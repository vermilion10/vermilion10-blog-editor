<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { boot, discardLocalChanges, docMeta, flushDraft, isDirty, openPost, refreshPosts, state, type PostEntry } from './lib/store';
import { openExternal, readJson, writeJson } from './lib/platform';
import { confirmDialog } from './lib/dialogs';
import { theme, toggleThemeMode } from './lib/theme';
import type { Snippet } from './lib/cheatsheet';
import type { CommitResult } from './lib/github';
import type { IconName } from './lib/icons';
import LoginView from './components/LoginView.vue';
import PostList from './components/PostList.vue';
import FrontmatterForm from './components/FrontmatterForm.vue';
import CheatSheet from './components/CheatSheet.vue';
import CodeEditor from './components/CodeEditor.vue';
import PreviewPane from './components/PreviewPane.vue';
import VisualEditor from './components/visual/VisualEditor.vue';
import DialogHost from './components/DialogHost.vue';
import NewPostDialog from './components/NewPostDialog.vue';
import PublishDialog from './components/PublishDialog.vue';
import SettingsDialog from './components/SettingsDialog.vue';
import AppNav from './components/shell/AppNav.vue';
import TopBar from './components/shell/TopBar.vue';
import DocActions from './components/shell/DocActions.vue';
import NoPostOpen from './components/shell/NoPostOpen.vue';
import MdIcon from './components/md/MdIcon.vue';
import MdFab from './components/md/MdFab.vue';
import MdIconButton from './components/md/MdIconButton.vue';
import MdSegmented from './components/md/MdSegmented.vue';

// --- Window size classes (MD3) --------------------------------------------
//   compact  < 600   bottom navigation bar, one destination at a time
//   medium   < 840   navigation rail, one destination at a time
//   expanded < 1200  rail + side pane + editor (code or preview)
//   large            rail + side pane + code and preview side by side
type WindowClass = 'compact' | 'medium' | 'expanded' | 'large';
const queries = { medium: '(min-width: 600px)', expanded: '(min-width: 840px)', large: '(min-width: 1200px)' };
const mql = Object.fromEntries(Object.entries(queries).map(([k, q]) => [k, window.matchMedia(q)])) as Record<keyof typeof queries, MediaQueryList>;
const windowClass = ref<WindowClass>('compact');
function measure() {
  windowClass.value = mql.large.matches ? 'large' : mql.expanded.matches ? 'expanded' : mql.medium.matches ? 'medium' : 'compact';
}
measure();
const isCompact = computed(() => windowClass.value === 'compact');
const singlePane = computed(() => windowClass.value === 'compact' || windowClass.value === 'medium');

// --- Navigation -------------------------------------------------------------
type Dest = 'posts' | 'write' | 'details' | 'syntax';
type Pane = Exclude<Dest, 'write'>;
type EditorView = 'code' | 'visual' | 'split' | 'preview';

const dest = ref<Dest>('posts');
const pane = ref<Pane | null>('posts');
// The last view picked is remembered on this device.
const editorView = ref<EditorView>(readJson<EditorView>('editor-view', 'split'));
watch(editorView, (v) => writeJson('editor-view', v));

const NAV: { id: Dest; label: string; icon: IconName; activeIcon: IconName }[] = [
  { id: 'posts', label: 'Posts', icon: 'description', activeIcon: 'description-fill' },
  { id: 'write', label: 'Write', icon: 'edit_note', activeIcon: 'edit_note-fill' },
  { id: 'details', label: 'Details', icon: 'tune', activeIcon: 'tune-fill' },
  { id: 'syntax', label: 'Syntax', icon: 'menu_book', activeIcon: 'menu_book-fill' },
];
// With a side pane the editor is always on screen, so Write isn't a destination.
const navItems = computed(() => (singlePane.value ? NAV : NAV.filter((n) => n.id !== 'write')));
const activeNav = computed(() => (singlePane.value ? dest.value : pane.value));

function onNav(id: Dest) {
  if (singlePane.value) {
    dest.value = id;
  } else {
    // Selecting the open pane again folds it away for more writing room.
    pane.value = pane.value === id ? null : (id as Pane);
  }
}

const effectiveView = computed<EditorView>(() =>
  editorView.value === 'split' && windowClass.value !== 'large' ? 'code' : editorView.value,
);
const viewOptions = computed(() => [
  { value: 'code' as const, label: 'Code', icon: 'code' as const },
  { value: 'visual' as const, label: 'Visual', icon: 'edit_note' as const },
  ...(windowClass.value === 'large' ? [{ value: 'split' as const, label: 'Split', icon: 'vertical_split' as const }] : []),
  { value: 'preview' as const, label: 'Preview', icon: 'visibility' as const },
]);
const viewModel = computed<EditorView>({
  get: () => effectiveView.value,
  set: (v) => { editorView.value = v; },
});

const PANE_TITLES: Record<Pane, string> = { posts: 'Posts', details: 'Post details', syntax: 'Syntax' };

// --- Open post ----------------------------------------------------------------
const docTitle = computed(() => {
  if (!state.doc) return '';
  const t = docMeta.value.title;
  return typeof t === 'string' && t ? t : state.doc.path.split('/').pop()!;
});
const docStatus = computed(() => {
  if (!state.doc) return '';
  if (state.doc.baseSha === null) return 'New, not published yet';
  return isDirty.value ? 'Edited, saved on this device' : 'Same as published';
});

const dialog = ref<'new' | 'publish' | 'settings' | null>(null);
const editor = ref<InstanceType<typeof CodeEditor>>();
const visual = ref<InstanceType<typeof VisualEditor>>();

const snackbar = ref<{ text: string; link?: string } | null>(null);
let snackTimer: number | undefined;
function notify(text: string, link?: string) {
  snackbar.value = { text, link };
  window.clearTimeout(snackTimer);
  snackTimer = window.setTimeout(() => { snackbar.value = null; }, link ? 8000 : 4000);
}

async function onOpen(entry: PostEntry) {
  if (state.doc?.path !== entry.path) {
    try {
      const restored = await openPost(entry);
      if (restored) notify('Restored your unpublished local changes.');
    } catch (err) {
      notify((err as Error).message);
      return;
    }
  }
  if (singlePane.value) dest.value = 'write';
}

function onCreated() {
  dialog.value = null;
  if (singlePane.value) dest.value = 'details';
  else pane.value = 'details';
}

function onPublished(result: CommitResult) {
  dialog.value = null;
  notify('Published. The site redeploys in a minute or two.', result.url);
}

async function onDiscard() {
  if (!state.doc) return;
  const isNew = state.doc.baseSha === null;
  const ok = await confirmDialog(isNew
    ? { headline: 'Delete this draft?', body: 'It was never published, so it will be gone for good.', confirmLabel: 'Delete draft', danger: true }
    : { headline: 'Discard local changes?', body: 'The post goes back to the version that is published on GitHub.', confirmLabel: 'Discard', danger: true });
  if (ok) discardLocalChanges();
}

async function onInsert(snippet: Snippet) {
  if (!state.doc) return;
  if (singlePane.value) dest.value = 'write';
  if (effectiveView.value === 'preview') editorView.value = windowClass.value === 'large' ? 'split' : 'code';
  await nextTick();
  if (effectiveView.value === 'visual') visual.value?.insertSnippet(snippet);
  else editor.value?.insertSnippet(snippet);
}

function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
    event.preventDefault();
    if (!state.doc) return;
    flushDraft();
    if (event.shiftKey) {
      if (isDirty.value) dialog.value = 'publish';
    } else {
      notify('Draft saved on this device.');
    }
  }
}

onMounted(() => {
  Object.values(mql).forEach((m) => m.addEventListener('change', measure));
  window.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', flushDraft);
  void boot();
});

onBeforeUnmount(() => {
  Object.values(mql).forEach((m) => m.removeEventListener('change', measure));
  window.removeEventListener('keydown', onKeydown);
  window.removeEventListener('beforeunload', flushDraft);
});
</script>

<template>
  <div v-if="state.booting" class="flex h-full items-center justify-center bg-surface">
    <span class="md-spinner text-primary" role="status" aria-label="Loading"></span>
  </div>

  <LoginView v-else-if="!state.token" />

  <div v-else class="flex h-full bg-surface-container" :class="isCompact ? 'flex-col' : 'flex-row'">
    <!-- Navigation rail (medium and up) -->
    <AppNav v-if="!isCompact" kind="rail" :items="navItems" :active="activeNav" @select="onNav">
      <template #fab>
        <MdFab icon="add" aria-label="New post" @click="dialog = 'new'" />
      </template>
      <template #footer>
        <MdIconButton
          :icon="theme.mode === 'dark' ? 'light_mode' : 'dark_mode'"
          :label="theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleThemeMode"
        />
        <MdIconButton icon="settings" label="Settings" @click="dialog = 'settings'" />
      </template>
    </AppNav>

    <!-- Compact and medium: one destination at a time -->
    <main
      v-if="singlePane"
      class="flex min-h-0 min-w-0 flex-1 flex-col bg-surface"
      :class="{ 'my-2 mr-2 overflow-hidden rounded-xl': !isCompact }"
    >
      <TopBar v-if="dest === 'posts'" title="Posts">
        <MdIconButton icon="refresh" label="Reload from GitHub" :disabled="state.loadingPosts" @click="refreshPosts" />
        <template v-if="isCompact">
          <MdIconButton
            :icon="theme.mode === 'dark' ? 'light_mode' : 'dark_mode'"
            :label="theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
            @click="toggleThemeMode"
          />
          <MdIconButton icon="settings" label="Settings" @click="dialog = 'settings'" />
        </template>
      </TopBar>
      <TopBar
        v-else
        :title="state.doc ? docTitle : dest === 'write' ? 'Write' : dest === 'details' ? 'Post details' : 'Syntax'"
        :subtitle="state.doc ? docStatus : undefined"
      >
        <MdSegmented
          v-if="dest === 'write' && state.doc"
          v-model="viewModel"
          label="Editor view"
          :icon-only="isCompact"
          :options="viewOptions"
        />
        <DocActions :compact="isCompact" @discard="onDiscard" @publish="dialog = 'publish'" />
      </TopBar>

      <div class="relative min-h-0 flex-1">
        <PostList v-if="dest === 'posts'" @open="onOpen" @create="dialog = 'new'" />

        <div v-show="dest === 'write'" class="h-full">
          <template v-if="state.doc">
            <div v-show="effectiveView === 'code'" class="h-full">
              <CodeEditor ref="editor" v-model="state.doc.content" :doc-key="state.doc.path" />
            </div>
            <VisualEditor v-if="effectiveView === 'visual'" ref="visual" v-model="state.doc.content" :doc-key="state.doc.path" />
            <PreviewPane v-if="effectiveView === 'preview' && dest === 'write'" :content="state.doc.content" :width-toggle="!isCompact" />
          </template>
          <NoPostOpen v-else what="Pick one to write in, or start a new one." show-browse @browse="dest = 'posts'" @create="dialog = 'new'" />
        </div>

        <template v-if="dest === 'details'">
          <FrontmatterForm v-if="state.doc" :key="state.doc.path" />
          <NoPostOpen v-else what="Open a post to edit its title, dates and tags." show-browse @browse="dest = 'posts'" @create="dialog = 'new'" />
        </template>

        <template v-if="dest === 'syntax'">
          <CheatSheet v-if="state.doc" @insert="onInsert" />
          <NoPostOpen v-else what="Open a post to insert syntax into it." show-browse @browse="dest = 'posts'" @create="dialog = 'new'" />
        </template>

        <MdFab
          v-if="isCompact && dest === 'posts'"
          class="!absolute right-4 bottom-4"
          icon="add"
          label="New post"
          @click="dialog = 'new'"
        />
      </div>
    </main>

    <!-- Expanded and large: side pane plus editor -->
    <template v-else>
      <aside
        v-if="pane"
        class="my-2 mr-2 flex w-[340px] shrink-0 flex-col overflow-hidden rounded-xl bg-surface min-[1400px]:w-[380px]"
        :aria-label="PANE_TITLES[pane]"
      >
        <TopBar :title="PANE_TITLES[pane]">
          <MdIconButton v-if="pane === 'posts'" icon="refresh" label="Reload from GitHub" :disabled="state.loadingPosts" @click="refreshPosts" />
          <MdIconButton icon="close" label="Hide panel" @click="pane = null" />
        </TopBar>
        <div class="min-h-0 flex-1">
          <PostList v-if="pane === 'posts'" @open="onOpen" @create="dialog = 'new'" />
          <template v-else-if="!state.doc">
            <NoPostOpen :what="pane === 'details' ? 'Open a post to edit its details.' : 'Open a post to insert syntax.'" @create="dialog = 'new'" />
          </template>
          <FrontmatterForm v-else-if="pane === 'details'" :key="state.doc.path" />
          <CheatSheet v-else @insert="onInsert" />
        </div>
      </aside>

      <main class="my-2 mr-2 flex min-w-0 flex-1 flex-col gap-2">
        <template v-if="state.doc">
          <div class="rounded-xl bg-surface">
            <TopBar :title="docTitle" :subtitle="docStatus">
              <MdSegmented v-model="viewModel" label="Editor view" :options="viewOptions" class="mr-2" />
              <DocActions @discard="onDiscard" @publish="dialog = 'publish'" />
            </TopBar>
          </div>
          <div class="flex min-h-0 flex-1 gap-2">
            <section v-show="effectiveView === 'code' || effectiveView === 'split'" class="min-w-0 flex-1 overflow-hidden rounded-xl bg-surface" aria-label="Markdown source">
              <CodeEditor ref="editor" v-model="state.doc.content" :doc-key="state.doc.path" />
            </section>
            <section v-if="effectiveView === 'visual'" class="min-w-0 flex-1 overflow-hidden rounded-xl bg-surface" aria-label="Visual editor">
              <VisualEditor ref="visual" v-model="state.doc.content" :doc-key="state.doc.path" />
            </section>
            <section v-if="effectiveView === 'split' || effectiveView === 'preview'" class="min-w-0 flex-1 overflow-hidden rounded-xl bg-surface-container-low" aria-label="Preview">
              <PreviewPane :content="state.doc.content" width-toggle />
            </section>
          </div>
        </template>
        <div v-else class="flex-1 rounded-xl bg-surface">
          <NoPostOpen
            :what="pane === 'posts' ? 'Pick one from the list, or start a new one.' : 'Show the posts list to pick one, or start a new one.'"
            :show-browse="pane !== 'posts'"
            @browse="pane = 'posts'"
            @create="dialog = 'new'"
          />
        </div>
      </main>
    </template>

    <!-- Bottom navigation bar (compact) -->
    <AppNav v-if="isCompact" kind="bar" :items="navItems" :active="activeNav" @select="onNav" />

    <NewPostDialog v-if="dialog === 'new'" @close="dialog = null" @created="onCreated" />
    <PublishDialog v-if="dialog === 'publish'" @close="dialog = null" @published="onPublished" />
    <SettingsDialog v-if="dialog === 'settings'" @close="dialog = null" />
    <DialogHost />

    <div
      v-if="snackbar"
      class="fixed left-1/2 z-50 flex w-[calc(100%-32px)] max-w-[560px] -translate-x-1/2 items-center gap-2 rounded-xs bg-inverse-surface py-1 pr-2 pl-4 text-inverse-on-surface shadow-lg"
      :class="isCompact ? 'bottom-[calc(96px+env(safe-area-inset-bottom))]' : 'bottom-6'"
      role="status"
    >
      <span class="type-body-medium flex-1 py-3">{{ snackbar.text }}</span>
      <button
        v-if="snackbar.link"
        type="button"
        class="state-layer type-label-large h-10 shrink-0 rounded-full px-3 text-inverse-primary"
        @click="openExternal(snackbar.link)"
      >View commit</button>
      <button type="button" class="state-layer flex size-10 shrink-0 items-center justify-center rounded-full" aria-label="Dismiss" @click="snackbar = null">
        <MdIcon name="close" :size="20" />
      </button>
    </div>
  </div>
</template>
