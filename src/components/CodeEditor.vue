<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { EditorState, type Extension } from '@codemirror/state';
import {
  EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter,
  drawSelection, placeholder,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { HighlightStyle, syntaxHighlighting, bracketMatching } from '@codemirror/language';
import { markdown, markdownLanguage } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { yamlFrontmatter } from '@codemirror/lang-yaml';
import { tags as t } from '@lezer/highlight';
import type { Snippet } from '../lib/cheatsheet';
import { addImages, imageFilesIn } from '../lib/images';

const props = defineProps<{
  modelValue: string;
  /** Changing this starts a fresh editor state (new undo history). */
  docKey: string;
}>();

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const host = ref<HTMLElement>();
let view: EditorView | null = null;

// Colors come from CSS variables (style.css), so switching the app theme
// restyles the editor without rebuilding its state.
const highlight = HighlightStyle.define([
  { tag: t.heading1, color: 'var(--cm-heading)', fontWeight: '700', fontSize: '1.15em' },
  { tag: t.heading2, color: 'var(--cm-heading)', fontWeight: '700', fontSize: '1.08em' },
  { tag: [t.heading3, t.heading4, t.heading5, t.heading6], color: 'var(--cm-heading)', fontWeight: '600' },
  { tag: t.strong, color: 'var(--cm-heading)', fontWeight: '700' },
  { tag: t.emphasis, fontStyle: 'italic', color: 'var(--cm-emphasis)' },
  { tag: t.strikethrough, textDecoration: 'line-through', color: 'var(--cm-comment)' },
  { tag: [t.link, t.url], color: 'var(--cm-link)' },
  { tag: t.monospace, color: 'var(--cm-code)' },
  { tag: t.quote, color: 'var(--cm-quote)', fontStyle: 'italic' },
  { tag: [t.processingInstruction, t.meta, t.contentSeparator], color: 'var(--cm-mark)' },
  { tag: t.list, color: 'var(--cm-mark)' },
  { tag: [t.keyword, t.operatorKeyword, t.modifier], color: 'var(--cm-keyword)' },
  { tag: [t.string, t.special(t.string)], color: 'var(--cm-string)' },
  { tag: [t.number, t.bool, t.null, t.atom], color: 'var(--cm-number)' },
  { tag: [t.comment, t.lineComment, t.blockComment], color: 'var(--cm-comment)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: 'var(--cm-function)' },
  { tag: [t.typeName, t.className], color: 'var(--cm-type)' },
  { tag: [t.propertyName, t.attributeName], color: 'var(--cm-property)' },
  { tag: t.tagName, color: 'var(--cm-property)' },
]);

const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-on-surface)', fontSize: '14px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.65', scrollbarWidth: 'thin' },
  '.cm-content': { padding: '12px 0 40vh', caretColor: 'var(--md-sys-color-primary)', maxWidth: '900px' },
  '.cm-line': { padding: '0 16px 0 8px' },
  '.cm-gutters': { backgroundColor: 'var(--md-sys-color-surface)', color: 'var(--md-sys-color-outline)', border: 'none' },
  '.cm-lineNumbers .cm-gutterElement': { padding: '0 4px 0 12px', fontSize: '12px' },
  '.cm-activeLine': { backgroundColor: 'color-mix(in srgb, var(--md-sys-color-on-surface) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--md-sys-color-on-surface-variant)' },
  '&.cm-focused': { outline: 'none' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--md-sys-color-primary)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'color-mix(in srgb, var(--md-sys-color-primary) 28%, transparent) !important' },
  '.cm-selectionMatch': { backgroundColor: 'color-mix(in srgb, var(--md-sys-color-on-surface) 10%, transparent)' },
  '.cm-matchingBracket': { backgroundColor: 'color-mix(in srgb, var(--md-sys-color-on-surface) 14%, transparent)', outline: 'none' },
  '.cm-panels': { backgroundColor: 'var(--md-sys-color-surface-container)', color: 'var(--md-sys-color-on-surface)', borderColor: 'var(--md-sys-color-outline-variant)' },
  '.cm-panel input, .cm-panel button': { font: 'inherit', fontSize: '13px', color: 'inherit' },
  '.cm-textfield': { backgroundColor: 'var(--md-sys-color-surface)', border: '1px solid var(--md-sys-color-outline)', borderRadius: '4px' },
  '.cm-button': { backgroundImage: 'none', backgroundColor: 'var(--md-sys-color-secondary-container)', color: 'var(--md-sys-color-on-secondary-container)', border: 'none', borderRadius: '9999px', padding: '2px 10px' },
  '.cm-searchMatch': { backgroundColor: 'color-mix(in srgb, var(--md-sys-color-tertiary) 30%, transparent)' },
  '.cm-placeholder': { color: 'var(--md-sys-color-on-surface-variant)' },
});

/** Wraps the selection in `before`/`after`, or inserts both with the cursor between. */
function wrapWith(before: string, after: string) {
  return (v: EditorView) => {
    const { from, to } = v.state.selection.main;
    const selected = v.state.sliceDoc(from, to);
    v.dispatch({
      changes: { from, to, insert: before + selected + after },
      selection: selected
        ? { anchor: from + before.length, head: from + before.length + selected.length }
        : { anchor: from + before.length },
    });
    return true;
  };
}

/**
 * Inserts `text` as its own block at `pos` (blank lines around it) and
 * returns the position just after it.
 */
function insertBlockAt(v: EditorView, pos: number, text: string): number {
  const { state } = v;
  const at = Math.min(pos, state.doc.length);
  const before = state.sliceDoc(Math.max(0, at - 2), at);
  const after = state.sliceDoc(at, at + 2);
  const prefix = at === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = at === state.doc.length ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  v.dispatch({ changes: { from: at, insert: prefix + text + suffix }, scrollIntoView: true });
  return at + prefix.length + text.length;
}

// Dropped or pasted images go to the upload dialog; once uploaded they are
// inserted where they were dropped (the dialog is modal, so that spot can't
// move meanwhile).
function takeImages(v: EditorView, data: DataTransfer | null, at: number | null, event: Event): boolean {
  const files = imageFilesIn(data);
  if (!files.length) return false;
  event.preventDefault();
  let pos = at ?? v.state.selection.main.head;
  addImages(files, { kind: 'insert', insert: (md) => { pos = insertBlockAt(v, pos, md); } });
  return true;
}

function extensions(): Extension[] {
  return [
    lineNumbers(),
    highlightActiveLineGutter(),
    highlightActiveLine(),
    drawSelection(),
    history(),
    bracketMatching(),
    highlightSelectionMatches(),
    EditorView.lineWrapping,
    yamlFrontmatter({ content: markdown({ base: markdownLanguage, codeLanguages: languages }) }),
    syntaxHighlighting(highlight),
    theme,
    placeholder('Start writing…'),
    keymap.of([
      { key: 'Mod-b', run: wrapWith('**', '**') },
      { key: 'Mod-i', run: wrapWith('*', '*') },
      { key: 'Mod-e', run: wrapWith('`', '`') },
      { key: 'Mod-k', run: wrapWith('[', '](https://)') },
      ...defaultKeymap,
      ...historyKeymap,
      ...searchKeymap,
      indentWithTab,
    ]),
    EditorView.domEventHandlers({
      drop: (event, v) => takeImages(v, event.dataTransfer, v.posAtCoords({ x: event.clientX, y: event.clientY }), event),
      paste: (event, v) => takeImages(v, event.clipboardData, null, event),
    }),
    EditorView.updateListener.of((u) => {
      if (u.docChanged) emit('update:modelValue', u.state.doc.toString());
    }),
  ];
}

function freshState(doc: string) {
  return EditorState.create({ doc, extensions: extensions() });
}

onMounted(() => {
  view = new EditorView({ state: freshState(props.modelValue), parent: host.value! });
});

onBeforeUnmount(() => view?.destroy());

watch(() => props.docKey, () => view?.setState(freshState(props.modelValue)));

// Outside edits (the frontmatter form) arrive as a whole new string. Replace
// only the span that differs so the cursor and undo history survive.
watch(() => props.modelValue, (next) => {
  if (!view) return;
  const current = view.state.doc.toString();
  if (next === current) return;
  let start = 0;
  while (start < current.length && start < next.length && current[start] === next[start]) start++;
  let endCur = current.length;
  let endNext = next.length;
  while (endCur > start && endNext > start && current[endCur - 1] === next[endNext - 1]) { endCur--; endNext--; }
  view.dispatch({ changes: { from: start, to: endCur, insert: next.slice(start, endNext) } });
});

function insertSnippet(snippet: Snippet) {
  if (!view) return;
  const { state } = view;
  const { from, to } = state.selection.main;
  const selected = state.sliceDoc(from, to);

  let text = snippet.text.replace('{sel}', selected);
  let cursor = text.indexOf('{|}');
  text = text.replace('{|}', '');
  if (cursor < 0) cursor = text.length;

  let prefix = '';
  let suffix = '';
  if (snippet.block) {
    const before = state.sliceDoc(Math.max(0, from - 2), from);
    const after = state.sliceDoc(to, to + 2);
    prefix = from === 0 || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
    suffix = to === state.doc.length ? '\n' : after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  }

  view.dispatch({
    changes: { from, to, insert: prefix + text + suffix },
    selection: { anchor: from + prefix.length + cursor },
    scrollIntoView: true,
  });
  view.focus();
}

defineExpose({ insertSnippet, focus: () => view?.focus() });
</script>

<template>
  <div ref="host" class="h-full min-h-0 overflow-hidden"></div>
</template>
