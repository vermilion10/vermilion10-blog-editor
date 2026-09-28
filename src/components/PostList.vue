<script setup lang="ts">
import { computed, ref } from 'vue';
import { state, refreshPosts, type PostEntry } from '../lib/store';
import MdIcon from './md/MdIcon.vue';
import MdButton from './md/MdButton.vue';

defineEmits<{ open: [entry: PostEntry]; create: [] }>();

const query = ref('');

const fileName = (path: string) => path.split('/').pop()!.replace(/\.md$/, '');

const posts = computed(() => {
  const q = query.value.trim().toLowerCase();
  return state.posts
    .filter((p) => !q
      || fileName(p.path).toLowerCase().includes(q)
      || p.meta?.title.toLowerCase().includes(q)
      || p.meta?.tags.some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => {
      // Unpublished drafts first, then newest by publish date.
      if (!a.sha !== !b.sha) return a.sha ? 1 : -1;
      return (b.meta?.published ?? '').localeCompare(a.meta?.published ?? '');
    });
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div class="px-4 pt-1 pb-2">
      <label class="flex h-14 items-center gap-3 rounded-full bg-surface-container-high px-4 text-on-surface-variant focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-secondary">
        <MdIcon name="search" />
        <input
          v-model="query"
          type="search"
          class="type-body-large min-w-0 flex-1 bg-transparent text-on-surface outline-none placeholder:text-on-surface-variant"
          placeholder="Search posts and tags"
          aria-label="Search posts and tags"
        />
      </label>
    </div>

    <div v-if="state.postsError" class="mx-4 mb-2 flex items-start gap-3 rounded-md bg-error-container p-4 text-on-error-container">
      <MdIcon name="sync_problem" class="mt-0.5" />
      <div class="min-w-0 flex-1">
        <p class="type-body-medium">{{ state.postsError }}</p>
        <MdButton class="-ml-3 mt-1" icon="refresh" @click="refreshPosts">Try again</MdButton>
      </div>
    </div>

    <p v-if="state.loadingPosts && !state.posts.length" class="type-body-medium px-8 py-6 text-on-surface-variant">Loading posts from GitHub…</p>

    <ul class="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-24" role="list">
      <li v-for="post in posts" :key="post.path">
        <button
          type="button"
          class="state-layer flex w-full items-start gap-4 rounded-lg px-4 py-3 text-left"
          :class="state.doc?.path === post.path ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface'"
          :aria-current="state.doc?.path === post.path ? 'true' : undefined"
          @click="$emit('open', post)"
        >
          <span class="min-w-0 flex-1">
            <span class="type-body-large line-clamp-2">{{ post.meta?.title ?? fileName(post.path) }}</span>
            <span class="type-body-medium mt-0.5 flex flex-wrap items-center gap-x-2 text-on-surface-variant">
              <span>{{ post.meta?.published || fileName(post.path) }}</span>
              <span v-if="post.meta?.lang" class="uppercase">{{ post.meta.lang }}</span>
              <span v-if="post.meta?.draft">Draft</span>
              <span v-if="post.meta?.encrypted" class="inline-flex items-center gap-1"><MdIcon name="lock" :size="14" />Locked</span>
            </span>
          </span>
          <span
            v-if="!post.sha || post.hasLocalChanges"
            class="type-label-medium mt-1 shrink-0 text-primary"
          >{{ post.sha ? 'Edited' : 'New' }}</span>
        </button>
      </li>
      <li v-if="!state.loadingPosts && !state.postsError && posts.length === 0" class="px-6 py-10 text-center">
        <template v-if="query">
          <p class="type-body-medium text-on-surface-variant">No post title, file name or tag matches “{{ query }}”.</p>
        </template>
        <template v-else>
          <p class="type-body-medium mb-3 text-on-surface-variant">There are no posts in {{ state.config.postsDir }} yet.</p>
          <MdButton variant="tonal" icon="add" @click="$emit('create')">Write the first one</MdButton>
        </template>
      </li>
    </ul>
  </div>
</template>
