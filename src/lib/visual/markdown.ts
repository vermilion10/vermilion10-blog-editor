// Markdown <-> ProseMirror for the visual editor.
//
// The visual editor edits ordinary prose (paragraphs, headings, lists,
// quotes, code) as rich text. Everything the blog renders with its own
// extensions (`:::` directives, Mermaid, math, tables, footnotes, HTML) is
// kept as a raw block holding its exact source, shown as a rendered card.
//
// Saving never re-serializes a block that wasn't edited: each top-level block
// remembers the source it was parsed from, and unchanged blocks are written
// back verbatim. Only blocks the user actually touched are re-serialized, so
// a visual edit produces the same small diff a hand edit would.
//
// This module is plain TypeScript with no app imports so it can be tested
// under Node directly.

import MarkdownIt, {
  type MarkdownIt as MarkdownItInstance, type StateBlock, type StateCore, type StateInline, type Token,
} from 'markdown-it';
import { Schema, type Mark, type Node as PMNode } from 'prosemirror-model';
import { MarkdownParser, MarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown';

// --- Schema -----------------------------------------------------------------

export const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'inline*',
      group: 'block',
      parseDOM: [{ tag: 'p' }],
      toDOM: () => ['p', 0],
    },
    blockquote: {
      content: 'block+',
      group: 'block',
      defining: true,
      parseDOM: [{ tag: 'blockquote' }],
      toDOM: () => ['blockquote', 0],
    },
    horizontal_rule: {
      attrs: { markup: { default: '---' } },
      group: 'block',
      parseDOM: [{ tag: 'hr' }],
      toDOM: () => ['hr'],
    },
    heading: {
      attrs: { level: { default: 2 } },
      content: 'inline*',
      group: 'block',
      defining: true,
      parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({ tag: `h${level}`, attrs: { level } })),
      toDOM: (node) => [`h${node.attrs.level}`, 0],
    },
    code_block: {
      attrs: { params: { default: '' } },
      content: 'text*',
      marks: '',
      group: 'block',
      code: true,
      defining: true,
      parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
      toDOM: (node) => ['pre', { 'data-params': node.attrs.params }, ['code', 0]],
    },
    raw_block: {
      attrs: { source: { default: '' }, kind: { default: 'raw' } },
      group: 'block',
      atom: true,
      selectable: true,
      draggable: true,
      toDOM: (node) => ['div', { 'data-raw': node.attrs.kind }, node.attrs.source],
    },
    bullet_list: {
      attrs: { tight: { default: true }, bullet: { default: '-' } },
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ul' }],
      toDOM: () => ['ul', 0],
    },
    ordered_list: {
      attrs: { order: { default: 1 }, tight: { default: true }, delim: { default: '.' } },
      content: 'list_item+',
      group: 'block',
      parseDOM: [{ tag: 'ol' }],
      toDOM: (node) => ['ol', node.attrs.order === 1 ? {} : { start: node.attrs.order }, 0],
    },
    list_item: {
      // `task` is null for a plain item, 'todo' or 'done' for a task list item.
      attrs: { task: { default: null } },
      content: 'paragraph block*',
      defining: true,
      parseDOM: [{ tag: 'li' }],
      toDOM: (node) => ['li', node.attrs.task ? { 'data-task': node.attrs.task } : {}, 0],
    },
    text: { group: 'inline' },
    image: {
      inline: true,
      attrs: { src: {}, alt: { default: null }, title: { default: null } },
      group: 'inline',
      draggable: true,
      parseDOM: [{ tag: 'img[src]' }],
      toDOM: (node) => ['img', { src: node.attrs.src, alt: node.attrs.alt, title: node.attrs.title }],
    },
    soft_break: {
      // A line break inside a hard-wrapped paragraph. Shown as a space, saved
      // as the original newline so edited paragraphs keep their wrapping.
      inline: true,
      group: 'inline',
      selectable: false,
      toDOM: () => ['span', { class: 'vb-soft-break' }, ' '],
    },
    hard_break: {
      inline: true,
      group: 'inline',
      selectable: false,
      parseDOM: [{ tag: 'br' }],
      toDOM: () => ['br'],
    },
    inline_raw: {
      // Inline math, footnote references and inline HTML, kept as source.
      inline: true,
      attrs: { source: { default: '' }, kind: { default: 'raw' } },
      group: 'inline',
      atom: true,
      toDOM: (node) => ['span', { 'data-inline-raw': node.attrs.kind }, node.attrs.source],
    },
  },
  marks: {
    link: {
      attrs: { href: {}, title: { default: null } },
      inclusive: false,
      parseDOM: [{ tag: 'a[href]' }],
      toDOM: (mark) => ['a', { href: mark.attrs.href, title: mark.attrs.title }, 0],
    },
    // Order is nesting order when saving: earlier marks wrap later ones, so
    // `||**a** b||` stays one spoiler instead of splitting around the bold.
    spoiler: { toDOM: () => ['span', { class: 'vb-spoiler' }, 0] },
    strike: { parseDOM: [{ tag: 's' }, { tag: 'del' }], toDOM: () => ['s', 0] },
    em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
    strong: { parseDOM: [{ tag: 'strong' }, { tag: 'b' }], toDOM: () => ['strong', 0] },
    // Last, so it nests innermost: code spans can't hold other marks.
    code: { parseDOM: [{ tag: 'code' }], toDOM: () => ['code', 0] },
  },
});

// --- Tokenizer --------------------------------------------------------------

function lineAt(state: StateBlock, n: number): string {
  return state.src.slice(state.bMarks[n] + state.tShift[n], state.eMarks[n]);
}

function pushRaw(state: StateBlock, kind: string, start: number, end: number) {
  const token = state.push('raw_block', '', 0);
  token.map = [start, end];
  token.meta = { kind };
  state.line = end;
}

// Same block boundaries as the blog's renderer (src/renderer/MarkdownRenderer.vue):
// one-line embeds, and containers closed by a bare `:::` with nesting tracked
// for the container types that have their own closer.
const NESTED_CONTAINER = /^:{2,}(details|carousel|note|tip|important|caution|warning)\b/i;
const ONE_LINE = new Set(['instagram', 'facebook']);

function directiveRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const line = lineAt(state, startLine).trim();
  const m = line.match(/^:{2,}([a-z][\w-]*)/i);
  if (!m) return false;
  if (silent) return true;
  const name = m[1].toLowerCase();

  let end = startLine + 1;
  if (name === 'github') {
    if (end < endLine && /^:{2,3}$/.test(lineAt(state, end).trim())) end++;
  } else if (!ONE_LINE.has(name)) {
    let depth = 1;
    for (; end < endLine; end++) {
      const next = lineAt(state, end).trim();
      if (NESTED_CONTAINER.test(next)) depth++;
      else if (/^:{2,}$/.test(next) && --depth === 0) { end++; break; }
    }
  }
  pushRaw(state, name, startLine, end);
  return true;
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const line = lineAt(state, startLine).trim();
  if (!line.startsWith('$$')) return false;
  if (silent) return true;
  let end = startLine + 1;
  const oneLine = line.length >= 4 && /\$\$(\s*\(\S+\))?$/.test(line.slice(2));
  if (!oneLine) {
    for (; end < endLine; end++) {
      if (/\$\$(\s*\(\S+\))?$/.test(lineAt(state, end).trim())) { end++; break; }
    }
  }
  pushRaw(state, 'math', startLine, end);
  return true;
}

function tableRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (startLine + 1 >= endLine) return false;
  const head = lineAt(state, startLine);
  const delim = lineAt(state, startLine + 1);
  if (!head.includes('|') || !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/.test(delim)) return false;
  if (silent) return true;
  let end = startLine + 2;
  while (end < endLine && lineAt(state, end).trim() && lineAt(state, end).includes('|')) end++;
  pushRaw(state, 'table', startLine, end);
  return true;
}

// Link reference and footnote definitions produce no tokens in markdown-it,
// so without this rule they would silently vanish from the document.
function definitionRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const line = lineAt(state, startLine);
  const m = line.match(/^\[(\^?)[^\]]+\]:/);
  if (!m) return false;
  if (silent) return true;
  const footnote = m[1] === '^';
  let end = startLine + 1;
  if (footnote) {
    // Lazy continuation until a blank line, then indented continuation blocks.
    while (end < endLine) {
      const next = state.src.slice(state.bMarks[end], state.eMarks[end]);
      if (!next.trim()) {
        let k = end;
        while (k < endLine && !state.src.slice(state.bMarks[k], state.eMarks[k]).trim()) k++;
        if (k < endLine && /^( {4}|\t)/.test(state.src.slice(state.bMarks[k], state.eMarks[k]))) { end = k + 1; continue; }
        break;
      }
      if (/^\[\^?[^\]]+\]:/.test(next.trim()) && !/^( {4}|\t)/.test(next)) break;
      end++;
    }
  }
  pushRaw(state, footnote ? 'footnote' : 'reference', startLine, end);
  return true;
}

function mathInlineRule(state: StateInline, silent: boolean): boolean {
  const { src, pos, posMax } = state;
  if (src.charCodeAt(pos) !== 0x24 /* $ */) return false;
  let end = -1;
  if (src.charCodeAt(pos + 1) === 0x24) {
    const close = src.indexOf('$$', pos + 2);
    if (close > pos + 2 && close + 2 <= posMax) end = close + 2;
  } else {
    const first = src[pos + 1];
    if (!first || /\s/.test(first)) return false;
    for (let i = pos + 1; i < posMax; i++) {
      if (src[i] === '\\') { i++; continue; }
      if (src[i] === '$' && !/\s/.test(src[i - 1]) && !/\d/.test(src[i + 1] ?? '')) { end = i + 1; break; }
    }
  }
  if (end < 0) return false;
  if (!silent) {
    const token = state.push('math_inline', '', 0);
    token.content = src.slice(pos, end);
  }
  state.pos = end;
  return true;
}

function footnoteRefRule(state: StateInline, silent: boolean): boolean {
  const m = state.src.slice(state.pos, state.posMax).match(/^\[\^[^\]\s]+\](?!:)/);
  if (!m) return false;
  if (!silent) state.push('footnote_ref', '', 0).content = m[0];
  state.pos += m[0].length;
  return true;
}

// `||spoiler||`, as in the blog. `|` is not an inline terminator, so the stock
// text rule would swallow `||` before the spoiler rule saw it; the wrapper
// backs up to the first `||` it consumed.
function spoilerPlugin(md: MarkdownItInstance) {
  const textRule = (md.inline.ruler as any).__rules__.find((r: { name: string }) => r.name === 'text').fn;
  md.inline.ruler.at('text', (state: StateInline, silent: boolean) => {
    const start = state.pos;
    if (!textRule(state, silent)) return false;
    const consumed = state.src.slice(start, state.pos);
    const cut = consumed.indexOf('||');
    if (cut < 0) return true;
    state.pos = start + cut;
    if (!silent) state.pending = state.pending.slice(0, state.pending.length - (consumed.length - cut));
    return cut > 0;
  });
  md.inline.ruler.before('emphasis', 'spoiler', (state: StateInline, silent: boolean) => {
    const { src, pos, posMax } = state;
    if (src.charCodeAt(pos) !== 0x7c || src.charCodeAt(pos + 1) !== 0x7c) return false;
    const close = src.indexOf('||', pos + 2);
    if (close < 0 || close + 2 > posMax || close === pos + 2) return false;
    if (silent) return true;
    state.push('spoiler_open', 'span', 1);
    state.pos = pos + 2;
    state.posMax = close;
    state.md.inline.tokenize(state);
    state.push('spoiler_close', 'span', -1);
    state.pos = close + 2;
    state.posMax = posMax;
    return true;
  });
}

function taskItems(state: StateCore) {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length - 2; i++) {
    if (tokens[i].type !== 'list_item_open' || tokens[i + 1].type !== 'paragraph_open') continue;
    const inline = tokens[i + 2];
    const m = inline.content.match(/^\[([ xX])\] /);
    if (!m) continue;
    tokens[i].attrSet('data-task', m[1] === ' ' ? 'todo' : 'done');
    inline.content = inline.content.slice(4);
    const first = inline.children?.[0];
    if (first?.type === 'text') first.content = first.content.slice(4);
  }
}

// Gives every raw block its exact source text, and turns Mermaid fences and
// HTML blocks into raw blocks too.
function rawSources(state: StateCore) {
  const lines = state.src.split('\n');
  for (const token of state.tokens) {
    if (token.type === 'fence' && token.info.trim().split(/\s+/)[0] === 'mermaid') {
      token.type = 'raw_block';
      token.meta = { kind: 'mermaid' };
    } else if (token.type === 'html_block') {
      token.type = 'raw_block';
      token.meta = { kind: 'html' };
    }
    if (token.type === 'raw_block' && token.map) {
      (token.meta ??= {}).source = lines.slice(token.map[0], token.map[1]).join('\n').replace(/\n+$/, '');
    }
  }
}

export const tokenizer = MarkdownIt('commonmark', { html: true, linkify: false, typographer: false })
  .enable('strikethrough');

tokenizer.block.ruler.before('fence', 'directive', directiveRule);
tokenizer.block.ruler.before('fence', 'math_block', mathBlockRule, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
tokenizer.block.ruler.before('paragraph', 'table', tableRule, { alt: ['paragraph'] });
tokenizer.block.ruler.before('reference', 'definition', definitionRule, { alt: ['paragraph'] });
tokenizer.inline.ruler.before('escape', 'math_inline', mathInlineRule);
tokenizer.inline.ruler.before('link', 'footnote_ref', footnoteRefRule);
spoilerPlugin(tokenizer);
tokenizer.core.ruler.after('inline', 'task_items', taskItems);
tokenizer.core.ruler.push('raw_sources', rawSources);

function listIsTight(tokens: Token[], i: number): boolean {
  while (++i < tokens.length) if (tokens[i].type !== 'list_item_open') return tokens[i].hidden;
  return false;
}

export const parser = new MarkdownParser(schema, tokenizer as never, {
  blockquote: { block: 'blockquote' },
  paragraph: { block: 'paragraph' },
  list_item: { block: 'list_item', getAttrs: (tok) => ({ task: tok.attrGet('data-task') }) },
  bullet_list: { block: 'bullet_list', getAttrs: (tok, tokens, i) => ({ tight: listIsTight(tokens, i), bullet: tok.markup || '-' }) },
  ordered_list: {
    block: 'ordered_list',
    getAttrs: (tok, tokens, i) => ({ order: +(tok.attrGet('start') ?? 1) || 1, tight: listIsTight(tokens, i), delim: tok.markup || '.' }),
  },
  heading: { block: 'heading', getAttrs: (tok) => ({ level: +tok.tag.slice(1) }) },
  code_block: { block: 'code_block', noCloseToken: true },
  fence: { block: 'code_block', getAttrs: (tok) => ({ params: tok.info || '' }), noCloseToken: true },
  raw_block: { node: 'raw_block', getAttrs: (tok) => ({ source: tok.meta.source, kind: tok.meta.kind }) },
  hr: { node: 'horizontal_rule', getAttrs: (tok) => ({ markup: tok.markup || '---' }) },
  image: {
    node: 'image',
    getAttrs: (tok) => ({ src: tok.attrGet('src'), title: tok.attrGet('title') || null, alt: tok.children?.[0]?.content || null }),
  },
  hardbreak: { node: 'hard_break' },
  softbreak: { node: 'soft_break' },
  math_inline: { node: 'inline_raw', getAttrs: (tok) => ({ source: tok.content, kind: 'math' }) },
  footnote_ref: { node: 'inline_raw', getAttrs: (tok) => ({ source: tok.content, kind: 'footnote' }) },
  html_inline: { node: 'inline_raw', getAttrs: (tok) => ({ source: tok.content, kind: 'html' }) },
  em: { mark: 'em' },
  strong: { mark: 'strong' },
  s: { mark: 'strike' },
  spoiler: { mark: 'spoiler' },
  link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href'), title: tok.attrGet('title') || null }) },
  code_inline: { mark: 'code', noCloseToken: true },
});

// --- Serializer -------------------------------------------------------------

function backticksFor(node: PMNode, side: number): string {
  const ticks = /`+/g;
  let m: RegExpExecArray | null;
  let len = 0;
  if (node.isText) while ((m = ticks.exec(node.text!))) len = Math.max(len, m[0].length);
  let result = len > 0 && side > 0 ? ' `' : '`';
  for (let i = 0; i < len; i++) result += '`';
  if (len > 0 && side < 0) result += ' ';
  return result;
}

function isPlainUrl(link: Mark, parent: PMNode, index: number): boolean {
  if (link.attrs.title || !/^\w+:/.test(link.attrs.href)) return false;
  const content = parent.child(index);
  if (!content.isText || content.text !== link.attrs.href || content.marks[content.marks.length - 1] !== link) return false;
  return index === parent.childCount - 1 || !link.isInSet(parent.child(index + 1).marks);
}

export const serializer = new MarkdownSerializer(
  {
    blockquote(state, node) {
      state.wrapBlock('> ', null, node, () => state.renderContent(node));
    },
    code_block(state, node) {
      const backticks = node.textContent.match(/`{3,}/gm);
      const fence = backticks ? `${backticks.sort().slice(-1)[0]}\`` : '```';
      state.write(`${fence}${node.attrs.params || ''}\n`);
      state.text(node.textContent, false);
      state.write('\n');
      state.write(fence);
      state.closeBlock(node);
    },
    heading(state, node) {
      state.write(`${state.repeat('#', node.attrs.level)} `);
      state.renderInline(node, false);
      state.closeBlock(node);
    },
    horizontal_rule(state, node) {
      state.write(node.attrs.markup || '---');
      state.closeBlock(node);
    },
    raw_block(state, node) {
      state.text(node.attrs.source, false);
      state.closeBlock(node);
    },
    bullet_list(state, node) {
      state.renderList(node, '  ', () => `${node.attrs.bullet || '-'} `);
    },
    ordered_list(state, node) {
      const start = node.attrs.order ?? 1;
      const maxW = String(start + node.childCount - 1).length;
      const space = state.repeat(' ', maxW + 2);
      state.renderList(node, space, (i) => {
        const n = String(start + i);
        return `${state.repeat(' ', maxW - n.length)}${n}${node.attrs.delim || '.'} `;
      });
    },
    list_item(state, node, parent) {
      if (node.attrs.task) state.write(node.attrs.task === 'done' ? '[x] ' : '[ ] ');
      // In a tight list, blocks inside one item stay on adjacent lines; the
      // default blank line between them would turn the whole list loose.
      node.forEach((child, _offset, i) => {
        if (i > 0 && parent.attrs.tight) (state as unknown as { flushClose(size: number): void }).flushClose(1);
        state.render(child, node, i);
      });
    },
    paragraph(state, node) {
      state.renderInline(node);
      state.closeBlock(node);
    },
    image(state, node) {
      state.write(`![${state.esc(node.attrs.alt || '')}](${node.attrs.src.replace(/[()]/g, '\\$&')}${node.attrs.title ? ` "${node.attrs.title.replace(/"/g, '\\"')}"` : ''})`);
    },
    soft_break(state) {
      state.text('\n', false);
    },
    hard_break(state, node, parent, index) {
      for (let i = index + 1; i < parent.childCount; i++) {
        if (parent.child(i).type !== node.type) {
          state.write('\\\n');
          return;
        }
      }
    },
    text(state, node) {
      state.text(node.text!, !(state as MarkdownSerializerState & { inAutolink?: boolean }).inAutolink);
    },
    inline_raw(state, node) {
      state.write(node.attrs.source);
    },
  },
  {
    em: { open: '*', close: '*', mixable: true, expelEnclosingWhitespace: true },
    strong: { open: '**', close: '**', mixable: true, expelEnclosingWhitespace: true },
    strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    spoiler: { open: '||', close: '||', mixable: true, expelEnclosingWhitespace: true },
    link: {
      open(state, mark, parent, index) {
        const s = state as MarkdownSerializerState & { inAutolink?: boolean };
        s.inAutolink = isPlainUrl(mark, parent, index);
        return s.inAutolink ? '<' : '[';
      },
      close(state, mark) {
        const s = state as MarkdownSerializerState & { inAutolink?: boolean };
        const inAutolink = s.inAutolink;
        s.inAutolink = undefined;
        return inAutolink ? '>' : `](${mark.attrs.href.replace(/[()"]/g, '\\$&')}${mark.attrs.title ? ` "${mark.attrs.title.replace(/"/g, '\\"')}"` : ''})`;
      },
      mixable: true,
    },
    code: {
      open: (_state, _mark, parent, index) => backticksFor(parent.child(index), -1),
      close: (_state, _mark, parent, index) => backticksFor(parent.child(index - 1), 1),
      escape: false,
    },
  },
  // `||` and `$` would turn typed text into a spoiler or math on the next load.
  { escapeExtraCharacters: /\|\||\$/g },
);

// --- Source-preserving round trip -------------------------------------------

export interface LoadedBody {
  doc: PMNode;
  /** Original source of each top-level block, by index. */
  sources: string[];
  /** Separator text after block i (between it and block i + 1). */
  gaps: string[];
  lead: string;
  trail: string;
  /** Top-level PM nodes as parsed, for identity checks. */
  nodes: PMNode[];
  crlf: boolean;
  /** False when blocks couldn't be lined up with source ranges. */
  preserved: boolean;
}

export function loadBody(body: string): LoadedBody {
  const crlf = body.includes('\r\n');
  const src = crlf ? body.replace(/\r\n/g, '\n') : body;
  const env = {};
  const tokens = tokenizer.parse(src, env);
  const doc = parser.parse(src);

  const lines = src.split('\n');
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    if (t.level === 0 && t.nesting !== -1 && t.map && t.block) ranges.push([t.map[0], t.map[1]]);
  }

  const nodes: PMNode[] = [];
  doc.forEach((n) => nodes.push(n));

  // An empty body parses to a single empty paragraph with no source range.
  if (!src.trim()) {
    return { doc, sources: [''], gaps: [], lead: '', trail: src, nodes, crlf, preserved: true };
  }

  const preserved = ranges.length === nodes.length;
  const sources = preserved ? ranges.map(([a, b]) => lines.slice(a, b).join('\n').replace(/\n+$/, '')) : [];
  const gaps: string[] = [];
  let lead = '';
  let trail = '';
  if (preserved) {
    // Ends are taken after trimming trailing blank lines from each block.
    const ends = ranges.map(([a], i) => a + sources[i].split('\n').length);
    lead = ranges.length ? lines.slice(0, ranges[0][0]).join('\n') + (ranges[0][0] > 0 ? '\n' : '') : '';
    for (let i = 0; i < ranges.length - 1; i++) {
      gaps.push(`\n${lines.slice(ends[i], ranges[i + 1][0]).map((l) => `${l}\n`).join('')}`);
    }
    const last = ends[ends.length - 1];
    trail = last < lines.length ? `\n${lines.slice(last).join('\n')}` : '';
  }
  return { doc, sources, gaps, lead, trail, nodes, crlf, preserved };
}

function serializeNode(node: PMNode): string {
  return serializer.serialize(schema.topNodeType.create(null, node)).replace(/\n+$/, '');
}

export function serializeBody(doc: PMNode, loaded: LoadedBody): string {
  let out: string;
  if (!loaded.preserved) {
    out = `${serializer.serialize(doc).replace(/\n+$/, '')}\n`;
  } else {
    const byIdentity = new Map<PMNode, number>(loaded.nodes.map((n, i) => [n, i]));
    const used = new Set<number>();
    const parts: string[] = [];
    let prev = -2;
    doc.forEach((child, _offset, i) => {
      let j = byIdentity.get(child);
      if (j === undefined || used.has(j)) {
        // A moved block is usually a new object with equal content.
        j = loaded.nodes[i] && !used.has(i) && loaded.nodes[i].eq(child)
          ? i
          : loaded.nodes.findIndex((n, k) => !used.has(k) && n.eq(child));
      }
      const matched = j !== undefined && j >= 0;
      if (matched) used.add(j!);
      const text = matched ? loaded.sources[j!] : serializeNode(child);
      if (parts.length) parts.push(matched && prev >= 0 && j === prev + 1 ? loaded.gaps[prev] : '\n\n');
      parts.push(text);
      prev = matched ? j! : -2;
    });
    out = loaded.lead + parts.join('') + loaded.trail;
  }
  return loaded.crlf ? out.replace(/\r?\n/g, '\r\n') : out;
}

/** Parses a Markdown snippet (from the syntax sidebar) into nodes. */
export function parseSnippet(markdown: string): PMNode {
  return parser.parse(markdown);
}
