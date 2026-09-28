import { createApp, h, ref, type App } from 'vue';
import katex from 'katex';
import type { Node as PMNode } from 'prosemirror-model';
import type { EditorView, NodeView } from 'prosemirror-view';
import MarkdownRenderer from '../../renderer/MarkdownRenderer.vue';
import { resolveAssetUrl } from '../../renderer/cdn';
import { getWsrvImageUrl } from '../../renderer/image';
import { ICONS, type IconName } from '../icons';
import { promptDialog } from '../dialogs';
import { openExternal } from '../platform';
import { parseSnippet } from './markdown';

type GetPos = () => number | undefined;

const RAW_LABELS: Record<string, string> = {
  github: 'GitHub card',
  instagram: 'Instagram post',
  facebook: 'Facebook post',
  carousel: 'Image carousel',
  details: 'Collapsible block',
  note: 'Note callout',
  tip: 'Tip callout',
  important: 'Important callout',
  warning: 'Warning callout',
  caution: 'Caution callout',
  mermaid: 'Mermaid diagram',
  math: 'Math block',
  table: 'Table',
  footnote: 'Footnote',
  reference: 'Link reference',
  html: 'HTML',
};

// Kinds whose render says nothing useful on its own, shown as source instead.
const SOURCE_ONLY = new Set(['reference']);

function iconButton(icon: IconName, label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'md-icon-button state-layer';
  b.setAttribute('aria-label', label);
  b.title = label;
  b.innerHTML = `<span class="md-icon inline-flex" style="width:20px;height:20px" aria-hidden="true">${ICONS[icon]}</span>`;
  return b;
}

// --- Lazy card rendering ------------------------------------------------------
//
// A card runs the blog renderer, and a Mermaid diagram blocks the main thread
// for a few hundred milliseconds. Rendering every card up front froze the
// editor for seconds on diagram-heavy posts, so cards render only when they
// come near the screen, one at a time with a pause between, and show a sized
// skeleton until then.

const renderQueue: RawBlockView[] = [];
let rendering = false;
const views = new WeakMap<Element, RawBlockView>();
const nearScreen = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) views.get(entry.target)?.requestRender();
}, { rootMargin: '600px 0px' });

function pump() {
  if (rendering) return;
  const next = renderQueue.shift();
  if (!next) return;
  rendering = true;
  next.renderNow().finally(() => {
    rendering = false;
    // Yield so input and scrolling get a turn between cards.
    window.setTimeout(pump, 30);
  });
}

// Rough heights so the page doesn't jump when cards fill in.
function skeletonHeight(kind: string, source: string): number {
  const lines = source.split('\n').length;
  switch (kind) {
    case 'mermaid': return 260;
    case 'github': return 130;
    case 'instagram': case 'facebook': return 420;
    case 'carousel': return 300;
    case 'table': return Math.min(600, 24 + lines * 34);
    case 'math': return 72;
    case 'details': return 64;
    default: return Math.min(400, 40 + lines * 24);
  }
}

const SKELETON_TEXT: Record<string, string> = {
  mermaid: 'Rendering diagram',
  math: 'Rendering math',
  table: 'Rendering table',
};

/** Replaces the node at `pos` with whatever `source` parses to. */
function replaceWithSource(view: EditorView, pos: number, node: PMNode, source: string) {
  const parsed = parseSnippet(source);
  const content = source.trim() ? parsed.content : parsed.type.schema.nodes.paragraph.create();
  view.dispatch(view.state.tr.replaceWith(pos, pos + node.nodeSize, content).scrollIntoView());
  view.focus();
}

/**
 * Directives, diagrams, math, tables and the like: rendered by the blog's own
 * renderer (dark, like the site) and edited through their source.
 */
export class RawBlockView implements NodeView {
  dom: HTMLElement;
  private source = ref('');
  private app: App | null = null;
  private label: HTMLElement;
  private body: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: GetPos;
  private state: 'idle' | 'queued' | 'rendering' | 'done' = 'idle';
  private onRendered: (() => void) | null = null;

  constructor(node: PMNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.className = 'vb-card';
    views.set(this.dom, this);
    this.dom.contentEditable = 'false';

    const bar = document.createElement('div');
    bar.className = 'vb-card__bar';
    this.label = document.createElement('span');
    this.label.className = 'vb-card__label type-label-large';
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    const edit = iconButton('edit', 'Edit source');
    edit.addEventListener('click', () => this.editSource());
    const remove = iconButton('delete', 'Delete block');
    remove.addEventListener('click', () => {
      const pos = this.getPos();
      if (pos !== undefined) this.view.dispatch(this.view.state.tr.delete(pos, pos + this.node.nodeSize));
    });
    bar.append(this.label, spacer, edit, remove);

    this.body = document.createElement('div');
    this.body.className = 'vb-card__body';
    this.body.addEventListener('dblclick', () => this.editSource());
    // Links in rendered content must not navigate the editor away.
    this.body.addEventListener('click', (e) => {
      const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
      if (!link || link.getAttribute('href')?.startsWith('#')) return;
      e.preventDefault();
      if (/^https?:/.test(link.href)) void openExternal(link.href);
    }, true);

    this.dom.append(bar, this.body);
    this.render(node);
    nearScreen.observe(this.dom);
  }

  private render(node: PMNode) {
    const kind = node.attrs.kind as string;
    this.label.textContent = RAW_LABELS[kind] ?? `:::${kind}`;
    this.source.value = node.attrs.source;
    if (SOURCE_ONLY.has(kind)) {
      this.app?.unmount();
      this.app = null;
      this.body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'vb-card__source';
      pre.textContent = node.attrs.source;
      this.body.append(pre);
      return;
    }
    if (this.state === 'idle') this.showSkeleton(kind, node.attrs.source);
  }

  private showSkeleton(kind: string, source: string) {
    this.body.innerHTML = '';
    this.body.setAttribute('aria-busy', 'true');
    const sk = document.createElement('div');
    sk.className = 'vb-skeleton';
    sk.style.height = `${skeletonHeight(kind, source)}px`;
    const text = document.createElement('span');
    text.className = 'vb-skeleton__text type-label-medium';
    text.textContent = SKELETON_TEXT[kind] ?? 'Rendering';
    sk.append(text);
    this.body.append(sk);
  }

  /** Called when the card nears the screen. */
  requestRender() {
    if (this.state !== 'idle' || SOURCE_ONLY.has(this.node.attrs.kind)) return;
    this.state = 'queued';
    renderQueue.push(this);
    pump();
  }

  /** Mounts the renderer; resolves once it has finished (diagrams included). */
  renderNow(): Promise<void> {
    if (this.state !== 'queued') return Promise.resolve();
    this.state = 'rendering';
    const mount = document.createElement('div');
    mount.className = 'vb-card__render is-pending';
    this.body.append(mount);
    const source = this.source;
    return new Promise<void>((resolve) => {
      const finish = () => {
        window.clearTimeout(fallback);
        this.onRendered = null;
        if (this.state !== 'rendering') return resolve();
        this.state = 'done';
        this.body.querySelector('.vb-skeleton')?.remove();
        mount.classList.remove('is-pending');
        this.body.removeAttribute('aria-busy');
        resolve();
      };
      // Never let one broken card hold up the queue.
      const fallback = window.setTimeout(finish, 15000);
      this.onRendered = finish;
      this.app = createApp({
        render: () => h(MarkdownRenderer, { content: source.value, onRendered: () => this.onRendered?.() }),
      });
      this.app.mount(mount);
    });
  }

  private async editSource() {
    const kind = this.node.attrs.kind as string;
    const next = await promptDialog({
      headline: RAW_LABELS[kind] ?? `:::${kind} block`,
      label: 'Markdown source',
      value: this.node.attrs.source,
      multiline: true,
      mono: true,
      preview: !SOURCE_ONLY.has(kind),
    });
    const pos = this.getPos();
    if (next === null || pos === undefined || next === this.node.attrs.source) return;
    replaceWithSource(this.view, pos, this.node, next);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render(node);
    return true;
  }

  selectNode() { this.dom.classList.add('is-selected'); }
  deselectNode() { this.dom.classList.remove('is-selected'); }

  // Let interactive bits of the render (carousel arrows, details toggles,
  // spoilers) and the card's own buttons work instead of selecting the node.
  stopEvent(event: Event) {
    const target = event.target as HTMLElement;
    if (event.type.startsWith('drag')) return false;
    return !!target.closest('button, summary, a, iframe, .md-spoiler, .md-carousel');
  }

  ignoreMutation() { return true; }

  destroy() {
    nearScreen.unobserve(this.dom);
    const queued = renderQueue.indexOf(this);
    if (queued >= 0) renderQueue.splice(queued, 1);
    this.state = 'idle';
    this.onRendered?.();
    this.app?.unmount();
    this.app = null;
  }
}

/** Inline math, footnote references and inline HTML, shown as chips. */
export class InlineRawView implements NodeView {
  dom: HTMLElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: GetPos;

  constructor(node: PMNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('span');
    this.dom.contentEditable = 'false';
    this.render();
    this.dom.addEventListener('dblclick', () => this.edit());
  }

  private render() {
    const { kind, source } = this.node.attrs as { kind: string; source: string };
    this.dom.className = `vb-inline vb-inline--${kind}`;
    this.dom.title = source;
    if (kind === 'math') {
      const display = source.startsWith('$$');
      const tex = source.slice(display ? 2 : 1, display ? -2 : -1);
      try {
        this.dom.innerHTML = katex.renderToString(tex, { throwOnError: false, displayMode: false });
      } catch {
        this.dom.textContent = source;
      }
    } else if (kind === 'footnote') {
      this.dom.textContent = source.slice(2, -1);
    } else {
      this.dom.textContent = source;
    }
  }

  private async edit() {
    const next = await promptDialog({ headline: 'Edit inline source', label: 'Markdown source', value: this.node.attrs.source, mono: true });
    const pos = this.getPos();
    if (next === null || pos === undefined || next === this.node.attrs.source) return;
    const para = parseSnippet(next).firstChild;
    const tr = this.view.state.tr;
    if (para?.isTextblock && para.content.size) tr.replaceWith(pos, pos + this.node.nodeSize, para.content);
    else tr.delete(pos, pos + this.node.nodeSize);
    this.view.dispatch(tr);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('is-selected'); }
  deselectNode() { this.dom.classList.remove('is-selected'); }
  ignoreMutation() { return true; }
}

/** List items, with a real checkbox for task list items. */
export class ListItemView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private box: HTMLInputElement | null = null;
  private node: PMNode;
  private view: EditorView;
  private getPos: GetPos;

  constructor(node: PMNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('li');
    this.contentDOM = document.createElement('div');
    this.contentDOM.className = 'vb-li__content';
    this.dom.append(this.contentDOM);
    this.render();
  }

  private render() {
    const task = this.node.attrs.task as string | null;
    this.dom.className = task ? 'vb-task' : '';
    if (task && !this.box) {
      this.box = document.createElement('input');
      this.box.type = 'checkbox';
      this.box.className = 'vb-task__box';
      this.box.contentEditable = 'false';
      this.box.setAttribute('aria-label', 'Done');
      this.box.addEventListener('mousedown', (e) => e.preventDefault());
      this.box.addEventListener('change', () => {
        const pos = this.getPos();
        if (pos === undefined) return;
        this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, task: this.box!.checked ? 'done' : 'todo' }));
      });
      this.dom.prepend(this.box);
    } else if (!task && this.box) {
      this.box.remove();
      this.box = null;
    }
    if (this.box) this.box.checked = task === 'done';
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(m: { type: string; target: Node }) {
    return m.type === 'attributes' || m.target === this.box;
  }
}

/** Code blocks with an editable language / fence options label. */
export class CodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private label: HTMLButtonElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: GetPos;

  constructor(node: PMNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('div');
    this.dom.className = 'vb-code';
    this.label = document.createElement('button');
    this.label.type = 'button';
    this.label.className = 'vb-code__lang state-layer type-label-medium';
    this.label.contentEditable = 'false';
    this.label.title = 'Edit language and options';
    this.label.addEventListener('click', () => this.editParams());
    const pre = document.createElement('pre');
    this.contentDOM = document.createElement('code');
    pre.append(this.contentDOM);
    this.dom.append(this.label, pre);
    this.render();
  }

  private render() {
    this.label.textContent = (this.node.attrs.params as string).trim() || 'text';
  }

  private async editParams() {
    const next = await promptDialog({
      headline: 'Code block options',
      label: 'Language and options',
      supporting: 'For example: ts title="src/app.ts" {2,4-6}',
      value: this.node.attrs.params,
      mono: true,
    });
    const pos = this.getPos();
    if (next === null || pos === undefined) return;
    this.view.dispatch(this.view.state.tr.setNodeMarkup(pos, null, { ...this.node.attrs, params: next.trim() }));
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  stopEvent(event: Event) {
    return this.label.contains(event.target as Node);
  }

  ignoreMutation(m: { target: Node }) {
    return this.label.contains(m.target);
  }
}

/** Images, resolved through the blog's CDN rules and `w-70%` sizing. */
export class ImageView implements NodeView {
  dom: HTMLImageElement;
  private node: PMNode;
  private view: EditorView;
  private getPos: GetPos;

  constructor(node: PMNode, view: EditorView, getPos: GetPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.dom = document.createElement('img');
    this.dom.className = 'vb-image';
    this.dom.draggable = true;
    this.dom.addEventListener('dblclick', () => this.edit());
    this.render();
  }

  private render() {
    const { src, alt, title } = this.node.attrs as { src: string; alt: string | null; title: string | null };
    const sized = (alt ?? '').match(/^\s*w-([\d.]+(?:%|px|rem|em|vw)?)\s*/i);
    this.dom.src = getWsrvImageUrl(resolveAssetUrl(src));
    this.dom.alt = sized ? (alt ?? '').slice(sized[0].length) : alt ?? '';
    this.dom.title = title ?? '';
    this.dom.style.width = sized ? (/\d$/.test(sized[1]) ? `${sized[1]}%` : sized[1]) : '';
  }

  private async edit() {
    const { src, alt, title } = this.node.attrs as { src: string; alt: string | null; title: string | null };
    const current = `![${alt ?? ''}](${src}${title ? ` "${title}"` : ''})`;
    const next = await promptDialog({
      headline: 'Edit image',
      label: 'Markdown',
      supporting: 'Start the alt text with w-70% to set the width',
      value: current,
      mono: true,
    });
    const pos = this.getPos();
    if (next === null || pos === undefined || next === current) return;
    const para = parseSnippet(next).firstChild;
    const tr = this.view.state.tr;
    if (para?.isTextblock && para.content.size) tr.replaceWith(pos, pos + this.node.nodeSize, para.content);
    else tr.delete(pos, pos + this.node.nodeSize);
    this.view.dispatch(tr);
  }

  update(node: PMNode) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  selectNode() { this.dom.classList.add('is-selected'); }
  deselectNode() { this.dom.classList.remove('is-selected'); }
}

export const nodeViews = {
  raw_block: (node: PMNode, view: EditorView, getPos: GetPos) => new RawBlockView(node, view, getPos),
  inline_raw: (node: PMNode, view: EditorView, getPos: GetPos) => new InlineRawView(node, view, getPos),
  list_item: (node: PMNode, view: EditorView, getPos: GetPos) => new ListItemView(node, view, getPos),
  code_block: (node: PMNode, view: EditorView, getPos: GetPos) => new CodeBlockView(node, view, getPos),
  image: (node: PMNode, view: EditorView, getPos: GetPos) => new ImageView(node, view, getPos),
};
