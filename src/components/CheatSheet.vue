<script setup lang="ts">
import { computed, ref } from 'vue';
import { CHEAT_SHEET, type Snippet } from '../lib/cheatsheet';
import MdIcon from './md/MdIcon.vue';
import type { IconName } from '../lib/icons';

defineEmits<{ insert: [snippet: Snippet] }>();

const GROUP_ICONS: Record<string, IconName> = {
  'Text': 'format_bold',
  'Structure': 'format_list_bulleted',
  'Callouts': 'info',
  'Code': 'code',
  'Media': 'image',
  'Diagrams & math': 'function',
};

const query = ref('');

const groups = computed(() => {
  const q = query.value.trim().toLowerCase();
  if (!q) return CHEAT_SHEET;
  return CHEAT_SHEET
    .map((g) => ({ ...g, items: g.items.filter((s) => `${s.label} ${s.hint ?? ''} ${s.text}`.toLowerCase().includes(q)) }))
    .filter((g) => g.items.length);
});

// Keyboard shortcuts mean nothing on a touchscreen.
const touch = window.matchMedia('(pointer: coarse)').matches;
const hintFor = (hint?: string) => (touch && hint?.startsWith('Ctrl') ? '' : hint);

const preview = (text: string) => text.replace('{sel}', '').replace('{|}', '');
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
          placeholder="Search syntax"
          aria-label="Search syntax"
        />
      </label>
      <p class="type-body-small mt-2 px-4 text-on-surface-variant">Tap to insert at the cursor. Selected text gets wrapped.</p>
    </div>
    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-2 pb-24">
      <section v-for="group in groups" :key="group.title" class="mb-2">
        <h3 class="type-title-small flex items-center gap-3 px-4 pt-4 pb-2 text-on-surface-variant">
          <MdIcon :name="GROUP_ICONS[group.title] ?? 'code'" :size="20" />{{ group.title }}
        </h3>
        <button
          v-for="item in group.items"
          :key="item.label"
          type="button"
          class="state-layer flex min-h-12 w-full items-center gap-3 rounded-lg px-4 py-2 text-left"
          :title="preview(item.text)"
          @mousedown.prevent
          @click="$emit('insert', item)"
        >
          <span class="type-body-large flex-1 text-on-surface">{{ item.label }}</span>
          <span v-if="hintFor(item.hint)" class="max-w-[45%] truncate font-mono text-xs text-on-surface-variant">{{ hintFor(item.hint) }}</span>
        </button>
      </section>
      <p v-if="!groups.length" class="type-body-medium px-6 py-10 text-center text-on-surface-variant">Nothing in the syntax list matches “{{ query }}”.</p>
    </div>
  </div>
</template>
