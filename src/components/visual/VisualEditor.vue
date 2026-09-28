<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import { EditorState } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import 'prosemirror-view/style/prosemirror.css';
import 'prosemirror-gapcursor/style/gapcursor.css';
import './visual.css';
import { splitDoc } from '../../lib/frontmatter';
import { loadBody, serializeBody, type LoadedBody } from '../../lib/visual/markdown';
import { nodeViews } from '../../lib/visual/nodeviews';
import {
  blockAt, blockOfSelection, buildPlugins, deleteBlock, duplicateBlock, editLink, insertSnippet as insertIntoView,
  insertMarkdownBlocksAt, moveBlock, startBlockDrag, turnBlockInto, type BlockRef,
} from '../../lib/visual/editing';
import type { Snippet } from '../../lib/cheatsheet';
import { addImages, imageFilesIn } from '../../lib/images';
import type { IconName } from '../../lib/icons';
import VisualToolbar from './VisualToolbar.vue';
import MdIcon from '../md/MdIcon.vue';

const props = defineProps<{
  modelValue: string;
  /** Changing this rebuilds the editor (new undo history). */
  docKey: string;
}>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const scroller = ref<HTMLElement>();
const mount = ref<HTMLElement>();
const editorState = shallowRef<EditorState | null>(null);
const notPreserved = ref(false);

let view: EditorView | null = null;
let loaded: LoadedBody;
let frontmatter = '';
let lastEmitted = '';
let emitTimer: number | undefined;

const touch = window.matchMedia('(pointer: coarse)').matches;
const plugins = buildPlugins((v) => void editLink(v));

// --- Sync with the Markdown source ------------------------------------------

function build(content: string) {
  window.clearTimeout(emitTimer);
  emitTimer = undefined;
  const body = splitDoc(content).body;
  frontmatter = content.slice(0, content.length - body.length);
  loaded = loadBody(body);
  notPreserved.value = !loaded.preserved;
  const state = EditorState.create({ doc: loaded.doc, plugins });
  if (view) view.updateState(state);
  else {
    view = new EditorView(mount.value!, {
      state,
      nodeViews,
      attributes: { class: 'vb-prose', spellcheck: 'true', 'aria-label': 'Post body' },
      // Dropped or pasted image files go through the upload dialog, then land
      // where they were dropped. Moves within the editor are left to ProseMirror.
      handleDrop(v, event, _slice, moved) {
        if (moved) return false;
        const at = v.posAtCoords({ left: event.clientX, top: event.clientY })?.pos ?? null;
        return takeImages(v, event.dataTransfer, at, event);
      },
      handlePaste(v, event) {
        return takeImages(v, event.clipboardData, null, event);
      },
      dispatchTransaction(tr) {
        const next = view!.state.apply(tr);
        view!.updateState(next);
        editorState.value = next;
        if (tr.docChanged) scheduleEmit();
        if (touch || !hover.active) placeHandleAtSelection();
      },
    });
  }
  editorState.value = view.state;
  lastEmitted = content;
}

function takeImages(v: EditorView, data: DataTransfer | null, at: number | null, event: Event): boolean {
  const files = imageFilesIn(data);
  if (!files.length) return false;
  event.preventDefault();
  let pos = at ?? v.state.selection.from;
  addImages(files, { kind: 'insert', insert: (md) => { pos = insertMarkdownBlocksAt(v, pos, md); } });
  return true;
}

function emitNow() {
  window.clearTimeout(emitTimer);
  emitTimer = undefined;
  if (!view) return;
  const content = frontmatter + serializeBody(view.state.doc, loaded);
  if (content === lastEmitted) return;
  lastEmitted = content;
  emit('update:modelValue', content);
}

function scheduleEmit() {
  window.clearTimeout(emitTimer);
  emitTimer = window.setTimeout(emitNow, 120);
}

watch(() => props.modelValue, (next) => {
  if (next === lastEmitted) return;
  // A frontmatter-only change (the Details form) keeps the editor, its
  // selection and undo history as they are. A pending save picks up the new
  // frontmatter when it runs.
  const body = splitDoc(next).body;
  if (body === lastEmitted.slice(frontmatter.length)) {
    frontmatter = next.slice(0, next.length - body.length);
    if (!emitTimer) lastEmitted = next;
    return;
  }
  build(next);
});

watch(() => props.docKey, () => build(props.modelValue));

// --- Block handle -----------------------------------------------------------

const hover = reactive({ active: false });
const handle = reactive({ visible: false, top: 0, index: -1 });
const menu = reactive({ open: false });
const menuEl = ref<HTMLElement>();

function blockIndexForDom(el: Element): number {
  if (!view) return -1;
  let pos = 0;
  for (let i = 0; i < view.state.doc.childCount; i++) {
    if (view.nodeDOM(pos) === el) return i;
    pos += view.state.doc.child(i).nodeSize;
  }
  return -1;
}

function placeHandle(el: Element, index: number) {
  if (!scroller.value) return;
  const box = el.getBoundingClientRect();
  const host = scroller.value.getBoundingClientRect();
  handle.top = box.top - host.top + scroller.value.scrollTop;
  handle.index = index;
  handle.visible = true;
}

function placeHandleAtSelection() {
  if (!view || menu.open) return;
  const block = blockOfSelection(view.state);
  const el = block ? view.nodeDOM(block.pos) : null;
  if (block && el instanceof Element) placeHandle(el, block.index);
}

function onPointerMove(event: PointerEvent) {
  if (!view || menu.open || event.pointerType === 'touch') return;
  const children = Array.from(view.dom.children).filter((c) => !c.classList.contains('ProseMirror-gapcursor'));
  let target: Element | null = null;
  for (const child of children) {
    if (child.getBoundingClientRect().top <= event.clientY) target = child;
    else break;
  }
  if (!target) return;
  const index = blockIndexForDom(target);
  if (index < 0) return;
  hover.active = true;
  placeHandle(target, index);
}

function onPointerLeave() {
  hover.active = false;
}

const currentBlock = computed<BlockRef | null>(() => (editorState.value ? blockAt(editorState.value, handle.index) : null));

function onDragStart(event: DragEvent) {
  const block = currentBlock.value;
  if (!view || !block) return;
  menu.open = false;
  startBlockDrag(view, block, event, view.nodeDOM(block.pos) as Element | null);
}

function toggleMenu() {
  menu.open = !menu.open;
}

type MenuAction = 'up' | 'down' | 'duplicate' | 'paragraph' | 'h2' | 'h3' | 'delete';
const menuItems = computed(() => {
  const block = currentBlock.value;
  const count = editorState.value?.doc.childCount ?? 0;
  const items: { id: MenuAction; label: string; icon: IconName; disabled?: boolean; danger?: boolean }[] = [
    { id: 'up', label: 'Move up', icon: 'arrow_upward', disabled: !block || block.index === 0 },
    { id: 'down', label: 'Move down', icon: 'arrow_downward', disabled: !block || block.index >= count - 1 },
    { id: 'duplicate', label: 'Duplicate', icon: 'content_copy' },
  ];
  if (block?.node.isTextblock && block.node.type.name !== 'code_block') {
    items.push(
      { id: 'paragraph', label: 'Turn into paragraph', icon: 'format_paragraph', disabled: block.node.type.name === 'paragraph' },
      { id: 'h2', label: 'Turn into heading 2', icon: 'format_h2', disabled: block.node.type.name === 'heading' && block.node.attrs.level === 2 },
      { id: 'h3', label: 'Turn into heading 3', icon: 'format_h3', disabled: block.node.type.name === 'heading' && block.node.attrs.level === 3 },
    );
  }
  items.push({ id: 'delete', label: 'Delete', icon: 'delete', danger: true });
  return items;
});

function runMenu(action: MenuAction) {
  const block = currentBlock.value;
  menu.open = false;
  if (!view || !block) return;
  if (action === 'up') moveBlock(view, block, -1);
  else if (action === 'down') moveBlock(view, block, 1);
  else if (action === 'duplicate') duplicateBlock(view, block);
  else if (action === 'delete') deleteBlock(view, block);
  else turnBlockInto(view, block, action);
  placeHandleAtSelection();
}

function onDocPointerDown(event: PointerEvent) {
  if (menu.open && !menuEl.value?.contains(event.target as Node) && !(event.target as HTMLElement).closest('.vb-handle')) menu.open = false;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && menu.open) {
    menu.open = false;
    view?.focus();
  }
}

// --- Lifecycle ----------------------------------------------------------------

onMounted(() => {
  build(props.modelValue);
  document.addEventListener('pointerdown', onDocPointerDown, true);
  placeHandleAtSelection();
});

onBeforeUnmount(() => {
  if (emitTimer) emitNow();
  document.removeEventListener('pointerdown', onDocPointerDown, true);
  view?.destroy();
  view = null;
});

defineExpose({
  insertSnippet(snippet: Snippet) {
    if (view) insertIntoView(view, snippet);
  },
  focus: () => view?.focus(),
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col" @keydown="onKeydown">
    <VisualToolbar v-if="editorState" :state="editorState" :view="() => view" class="border-b border-outline-variant" />
    <p v-if="notPreserved" class="type-body-small bg-tertiary-container px-4 py-2 text-on-tertiary-container">
      This post has structure the visual editor can't map line for line, so saving from here may reformat unchanged parts. Use Code view to avoid that.
    </p>
    <div
      ref="scroller"
      class="vb-scroller scroll-thin relative min-h-0 flex-1 overflow-y-auto"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
    >
      <div ref="mount" class="vb-mount"></div>

      <button
        v-show="handle.visible"
        type="button"
        class="vb-handle state-layer"
        :style="{ top: `${handle.top}px` }"
        draggable="true"
        aria-label="Block options (drag to move)"
        title="Drag to move, click for options"
        :aria-expanded="menu.open"
        @dragstart="onDragStart"
        @click="toggleMenu"
      >
        <MdIcon name="drag_indicator" :size="20" />
      </button>

      <div
        v-if="menu.open"
        ref="menuEl"
        class="vb-menu"
        :style="{ top: `${handle.top + 40}px` }"
        role="menu"
        aria-label="Block options"
      >
        <button
          v-for="item in menuItems"
          :key="item.id"
          type="button"
          role="menuitem"
          class="vb-menu__item state-layer type-label-large"
          :class="{ 'text-error': item.danger }"
          :disabled="item.disabled"
          @click="runMenu(item.id)"
        >
          <MdIcon :name="item.icon" :size="20" />{{ item.label }}
        </button>
      </div>
    </div>
  </div>
</template>
