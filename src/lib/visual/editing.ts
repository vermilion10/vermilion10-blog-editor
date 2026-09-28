import { EditorState, NodeSelection, Plugin, TextSelection, type Command, type Transaction } from 'prosemirror-state';
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view';
import { Slice, type MarkType, type Node as PMNode, type NodeType } from 'prosemirror-model';
import { baseKeymap, chainCommands, exitCode, lift, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands';
import { history, redo, undo } from 'prosemirror-history';
import { keymap } from 'prosemirror-keymap';
import { inputRules, textblockTypeInputRule, wrappingInputRule } from 'prosemirror-inputrules';
import { liftListItem, sinkListItem, splitListItem, wrapInList } from 'prosemirror-schema-list';
import { dropCursor } from 'prosemirror-dropcursor';
import { gapCursor } from 'prosemirror-gapcursor';
import { parseSnippet, schema } from './markdown';
import { promptDialog } from '../dialogs';
import type { Snippet } from '../cheatsheet';

const { nodes, marks } = schema;

// --- Queries (for toolbar state) --------------------------------------------

export function isMarkActive(state: EditorState, type: MarkType): boolean {
  const { from, $from, to, empty } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks || $from.marks());
  return state.doc.rangeHasMark(from, to, type);
}

export function isBlockActive(state: EditorState, type: NodeType, attrs: Record<string, unknown> = {}): boolean {
  const { $from, to } = state.selection;
  if (to > $from.end()) return false;
  const parent = $from.parent;
  return parent.type === type && Object.entries(attrs).every(([k, v]) => parent.attrs[k] === v);
}

export function isInside(state: EditorState, type: NodeType): boolean {
  const { $from } = state.selection;
  for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === type) return true;
  return false;
}

// --- Commands -------------------------------------------------------------------

export const cmd = {
  undo,
  redo,
  bold: toggleMark(marks.strong),
  italic: toggleMark(marks.em),
  strike: toggleMark(marks.strike),
  code: toggleMark(marks.code),
  spoiler: toggleMark(marks.spoiler),
  paragraph: setBlockType(nodes.paragraph),
  heading: (level: number) => setBlockType(nodes.heading, { level }),
  codeBlock: setBlockType(nodes.code_block),
  quote: (state: EditorState, dispatch?: EditorView['dispatch']) =>
    isInside(state, nodes.blockquote) ? lift(state, dispatch) : wrapIn(nodes.blockquote)(state, dispatch),
  bulletList: wrapInList(nodes.bullet_list),
  orderedList: wrapInList(nodes.ordered_list),
  divider: ((state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.horizontal_rule.create()).scrollIntoView());
    return true;
  }) as Command,
  /** Turns list items in the selection into task items, or back. */
  taskList: ((state, dispatch) => {
    if (isInside(state, nodes.list_item)) {
      const { $from } = state.selection;
      let current: string | null = null;
      for (let d = $from.depth; d > 0; d--) if ($from.node(d).type === nodes.list_item) { current = $from.node(d).attrs.task; break; }
      if (dispatch) dispatch(setTasks(state.tr, state.selection.from, state.selection.to, current ? null : 'todo'));
      return true;
    }
    return wrapInList(nodes.bullet_list)(state, dispatch && ((tr) => {
      dispatch(setTasks(tr, tr.mapping.map(state.selection.from), tr.mapping.map(state.selection.to), 'todo'));
    }));
  }) as Command,
};

/** Sets the task state of every list item touching from..to. */
function setTasks(tr: Transaction, from: number, to: number, task: string | null): Transaction {
  const seen = new Set<number>();
  const mark = (node: PMNode, pos: number) => {
    if (node.type !== nodes.list_item || seen.has(pos)) return;
    seen.add(pos);
    tr.setNodeMarkup(pos, null, { ...node.attrs, task });
  };
  tr.doc.nodesBetween(from, Math.max(to, from + 1), mark);
  const $from = tr.doc.resolve(from);
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === nodes.list_item) { mark($from.node(d), $from.before(d)); break; }
  }
  return tr;
}

/** The extent of the link mark around `pos`, within its textblock. */
function linkRange(state: EditorState, pos: number): { from: number; to: number } | null {
  const $pos = state.doc.resolve(pos);
  const parent = $pos.parent;
  const start = $pos.start();
  const runs: { from: number; to: number }[] = [];
  let run: { from: number; to: number } | null = null;
  parent.forEach((child, offset) => {
    const a = start + offset;
    const b = a + child.nodeSize;
    if (!marks.link.isInSet(child.marks)) run = null;
    else if (run) run.to = b;
    else runs.push(run = { from: a, to: b });
  });
  return runs.find((r) => r.from <= pos && pos <= r.to) ?? null;
}

export async function editLink(view: EditorView) {
  const { state } = view;
  const { from, to, empty } = state.selection;
  let current = '';
  state.doc.nodesBetween(from, Math.max(to, from + 1), (node) => {
    const m = marks.link.isInSet(node.marks);
    if (m) current = m.attrs.href;
  });
  const href = await promptDialog({
    headline: current ? 'Edit link' : 'Add link',
    label: 'URL',
    value: current || 'https://',
    confirmLabel: current ? 'Update' : 'Add',
    supporting: current ? 'Clear the field to remove the link' : undefined,
  });
  if (href === null) return view.focus();
  const tr = view.state.tr;
  const url = href.trim();
  const range = empty ? linkRange(state, from) : { from, to };
  if (!url || url === 'https://') {
    if (range) tr.removeMark(range.from, range.to, marks.link);
  } else if (!range) {
    tr.insert(from, schema.text(url, [marks.link.create({ href: url })]));
  } else {
    tr.removeMark(range.from, range.to, marks.link).addMark(range.from, range.to, marks.link.create({ href: url }));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// --- Block operations (drag handle menu) ---------------------------------------

export interface BlockRef {
  pos: number;
  index: number;
  node: PMNode;
}

export function blockAt(state: EditorState, index: number): BlockRef | null {
  if (index < 0 || index >= state.doc.childCount) return null;
  let pos = 0;
  for (let i = 0; i < index; i++) pos += state.doc.child(i).nodeSize;
  return { pos, index, node: state.doc.child(index) };
}

export function blockOfSelection(state: EditorState): BlockRef | null {
  const index = state.selection.$from.index(0);
  return blockAt(state, Math.min(index, state.doc.childCount - 1));
}

export function moveBlock(view: EditorView, block: BlockRef, dir: -1 | 1) {
  const { state } = view;
  const neighbour = blockAt(state, block.index + dir);
  if (!neighbour) return;
  const tr = state.tr.delete(block.pos, block.pos + block.node.nodeSize);
  const target = dir < 0 ? neighbour.pos : block.pos + neighbour.node.nodeSize;
  // The same node object goes back in, so it keeps its original source.
  tr.insert(target, block.node);
  tr.setSelection(block.node.isTextblock
    ? TextSelection.near(tr.doc.resolve(target + 1))
    : NodeSelection.create(tr.doc, target));
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function duplicateBlock(view: EditorView, block: BlockRef) {
  const end = block.pos + block.node.nodeSize;
  view.dispatch(view.state.tr.insert(end, block.node.copy(block.node.content)).scrollIntoView());
  view.focus();
}

export function deleteBlock(view: EditorView, block: BlockRef) {
  const { state } = view;
  const tr = state.doc.childCount === 1
    ? state.tr.replaceWith(0, state.doc.content.size, nodes.paragraph.create())
    : state.tr.delete(block.pos, block.pos + block.node.nodeSize);
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

export function turnBlockInto(view: EditorView, block: BlockRef, type: 'paragraph' | 'h2' | 'h3') {
  if (!block.node.isTextblock) return;
  const [nodeType, attrs] = type === 'paragraph' ? [nodes.paragraph, null] : [nodes.heading, { level: type === 'h2' ? 2 : 3 }];
  view.dispatch(view.state.tr.setBlockType(block.pos, block.pos + block.node.nodeSize, nodeType, attrs));
  view.focus();
}

export function startBlockDrag(view: EditorView, block: BlockRef, event: DragEvent, image: Element | null) {
  const sel = NodeSelection.create(view.state.doc, block.pos);
  view.dispatch(view.state.tr.setSelection(sel));
  // ProseMirror's own drop handling moves `dragging.slice` when `move` is set.
  (view as unknown as { dragging: { slice: Slice; move: boolean } | null }).dragging = { slice: sel.content(), move: true };
  event.dataTransfer?.clearData();
  event.dataTransfer?.setData('text/plain', block.node.textContent || ' ');
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
  if (image && event.dataTransfer) event.dataTransfer.setDragImage(image, 16, 16);
}

// --- Snippets from the syntax sidebar -------------------------------------------

export function insertSnippet(view: EditorView, snippet: Snippet) {
  const { state } = view;
  const selected = state.doc.textBetween(state.selection.from, state.selection.to, '\n');
  const text = snippet.text.replace('{sel}', selected).replace('{|}', '');
  const parsed = parseSnippet(text);
  let tr = state.tr;

  if (snippet.block) {
    const block = blockOfSelection(state);
    if (!block) return;
    const end = block.pos + block.node.nodeSize;
    const emptyPara = block.node.type === nodes.paragraph && block.node.content.size === 0;
    if (!state.selection.empty) tr = tr.deleteSelection();
    const at = emptyPara ? block.pos : tr.mapping.map(end);
    tr = emptyPara ? tr.replaceWith(block.pos, block.pos + block.node.nodeSize, parsed.content) : tr.insert(at, parsed.content);
    const last = at + parsed.content.size;
    const lastNode = parsed.lastChild;
    tr.setSelection(lastNode && !lastNode.isTextblock && lastNode.isAtom
      ? NodeSelection.create(tr.doc, last - lastNode.nodeSize)
      : TextSelection.near(tr.doc.resolve(Math.max(0, last - 1)), -1));
  } else {
    const para = parsed.firstChild;
    if (!para?.isTextblock) return;
    tr = tr.replaceSelection(new Slice(para.content, 0, 0));
  }
  view.dispatch(tr.scrollIntoView());
  view.focus();
}

// --- Plugins --------------------------------------------------------------------

function placeholder(text: string) {
  return new Plugin({
    props: {
      decorations(state) {
        const { doc } = state;
        if (doc.childCount !== 1 || !doc.firstChild!.isTextblock || doc.firstChild!.content.size) return null;
        return DecorationSet.create(doc, [Decoration.node(0, doc.firstChild!.nodeSize, { class: 'vb-empty', 'data-placeholder': text })]);
      },
    },
  });
}

export function buildPlugins(onLink: (view: EditorView) => void): Plugin[] {
  const hardBreak = chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) dispatch(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView());
    return true;
  });
  return [
    inputRules({
      rules: [
        textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading, (m) => ({ level: m[1].length })),
        wrappingInputRule(/^\s*>\s$/, nodes.blockquote),
        wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list, (m) => ({ bullet: m[1] })),
        wrappingInputRule(/^(\d+)\.\s$/, nodes.ordered_list, (m) => ({ order: +m[1] }), (m, node) => node.childCount + node.attrs.order === +m[1]),
        textblockTypeInputRule(/^```([^\s`]*)\s$/, nodes.code_block, (m) => ({ params: m[1] })),
      ],
    }),
    keymap({
      'Mod-z': undo,
      'Mod-y': redo,
      'Shift-Mod-z': redo,
      'Mod-b': cmd.bold,
      'Mod-i': cmd.italic,
      'Mod-e': cmd.code,
      'Mod-Shift-x': cmd.strike,
      'Mod-k': (_state, _dispatch, view) => { if (view) onLink(view); return true; },
      'Mod-Alt-0': cmd.paragraph,
      'Mod-Alt-2': cmd.heading(2),
      'Mod-Alt-3': cmd.heading(3),
      'Shift-Enter': hardBreak,
      Enter: splitListItem(nodes.list_item),
      Tab: sinkListItem(nodes.list_item),
      'Shift-Tab': liftListItem(nodes.list_item),
    }),
    keymap(baseKeymap),
    history(),
    dropCursor({ color: 'var(--md-sys-color-primary)', width: 2 }),
    gapCursor(),
    placeholder('Start writing, or insert a block from Syntax'),
  ];
}

/**
 * Inserts parsed Markdown as blocks near `pos`: after the block containing it,
 * into it when that block is an empty paragraph, or exactly at `pos` when it
 * already sits between blocks. Returns the position after the insertion.
 */
export function insertMarkdownBlocksAt(view: EditorView, pos: number, markdown: string): number {
  const { state } = view;
  const content = parseSnippet(markdown).content;
  const $pos = state.doc.resolve(Math.min(pos, state.doc.content.size));
  let tr = state.tr;
  let at: number;
  if ($pos.depth === 0) {
    at = $pos.pos;
    tr = tr.insert(at, content);
  } else {
    const block = blockAt(state, $pos.index(0))!;
    const empty = block.node.type === nodes.paragraph && block.node.content.size === 0;
    at = empty ? block.pos : block.pos + block.node.nodeSize;
    tr = empty ? tr.replaceWith(block.pos, block.pos + block.node.nodeSize, content) : tr.insert(at, content);
  }
  view.dispatch(tr.scrollIntoView());
  return at + content.size;
}
