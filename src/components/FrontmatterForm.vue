<script setup lang="ts">
import { computed, ref } from 'vue';
import { allCategories, allTags, docMeta, setDocField } from '../lib/store';
import { todayIso, type FmValue } from '../lib/frontmatter';
import MdTextField from './md/MdTextField.vue';
import MdSwitch from './md/MdSwitch.vue';
import MdChip from './md/MdChip.vue';
import MdButton from './md/MdButton.vue';
import MdIcon from './md/MdIcon.vue';
import MdIconButton from './md/MdIconButton.vue';

const str = (key: string) => {
  const v = docMeta.value[key];
  return typeof v === 'string' ? v : '';
};
const bool = (key: string) => docMeta.value[key] === true;
const tags = computed(() => (Array.isArray(docMeta.value.tags) ? docMeta.value.tags : []));

function set(key: string, value: FmValue | undefined) {
  setDocField(key, value);
}

// Booleans that default to true on the site (`comment`) are written only when
// turned off; the rest only when turned on.
function setFlag(key: string, on: boolean, defaultOn = false) {
  set(key, on === defaultOn ? undefined : on);
}

const tagInput = ref('');
const tagSuggestions = computed(() => {
  const q = tagInput.value.trim().toLowerCase();
  return allTags.value.filter((t) => !tags.value.includes(t) && (!q || t.toLowerCase().includes(q))).slice(0, 8);
});

function addTag(raw = tagInput.value) {
  const next = raw.split(',').map((t) => t.trim()).filter((t) => t && !tags.value.includes(t));
  if (next.length) set('tags', [...tags.value, ...next]);
  tagInput.value = '';
}

function removeTag(tag: string) {
  set('tags', tags.value.filter((t) => t !== tag));
}

function onTagKey(event: KeyboardEvent) {
  if (event.key === 'Enter' || event.key === ',') {
    event.preventDefault();
    addTag();
  } else if (event.key === 'Backspace' && !tagInput.value && tags.value.length) {
    removeTag(tags.value[tags.value.length - 1]);
  }
}

const showPassword = ref(false);
const showAdvanced = ref(false);
</script>

<template>
  <form class="scroll-thin h-full space-y-5 overflow-y-auto px-4 pt-3 pb-24" @submit.prevent>
    <MdTextField label="Title" :model-value="str('title')" @update:model-value="set('title', $event)" />

    <MdTextField
      label="Description"
      multiline
      :rows="3"
      supporting="Shown in post previews and search results"
      :model-value="str('description')"
      @update:model-value="set('description', $event)"
    />

    <div class="grid grid-cols-2 gap-3">
      <MdTextField label="Published" type="date" float-label :model-value="str('published')" @update:model-value="set('published', $event)" />
      <MdTextField label="Updated" type="date" float-label :model-value="str('updated')" @update:model-value="set('updated', $event)" />
    </div>
    <MdButton class="-mt-3" icon="check" :disabled="str('updated') === todayIso()" @click="set('updated', todayIso())">Mark updated today</MdButton>

    <div class="grid grid-cols-2 gap-3">
      <MdTextField label="Category" list="fm-categories" autocomplete="off" :model-value="str('category')" @update:model-value="set('category', $event)" />
      <datalist id="fm-categories">
        <option v-for="c in allCategories" :key="c" :value="c" />
      </datalist>
      <MdTextField label="Language" select :model-value="str('lang')" @update:model-value="set('lang', $event)">
        <option value="">Not set</option>
        <option value="en">English</option>
        <option value="id">Indonesian</option>
      </MdTextField>
    </div>

    <div>
      <MdTextField
        v-model="tagInput"
        label="Add tags"
        autocomplete="off"
        supporting="Press Enter or comma to add"
        @keydown="onTagKey"
        @blur="addTag()"
      />
      <div v-if="tags.length" class="mt-3 flex flex-wrap gap-2" aria-label="Tags">
        <MdChip v-for="tag in tags" :key="tag" kind="input" :label="tag" @remove="removeTag(tag)" />
      </div>
      <div v-if="tagSuggestions.length" class="mt-3">
        <p class="type-label-medium mb-2 text-on-surface-variant">Used in other posts</p>
        <div class="flex flex-wrap gap-2">
          <MdChip v-for="t in tagSuggestions" :key="t" kind="suggestion" :label="t" @pick="addTag(t)" />
        </div>
      </div>
    </div>

    <MdTextField
      label="Cover image"
      mono
      autocomplete="off"
      supporting="R2 key like posts/2026/slug/cover.webp, or a full URL"
      :model-value="str('image')"
      @update:model-value="set('image', $event)"
    />

    <div class="-mx-4">
      <MdSwitch label="Draft" supporting="Left out of the site entirely" :model-value="bool('draft')" @update:model-value="setFlag('draft', $event)" />
      <MdSwitch label="Pinned" supporting="Kept at the top of the list" :model-value="bool('pinned')" @update:model-value="setFlag('pinned', $event)" />
      <MdSwitch label="Password protected" supporting="Encrypted at build time" :model-value="bool('encrypted')" @update:model-value="setFlag('encrypted', $event)" />
    </div>

    <div v-if="bool('encrypted')" class="space-y-5">
      <MdTextField
        label="Password"
        :type="showPassword ? 'text' : 'password'"
        autocomplete="off"
        :model-value="str('password')"
        @update:model-value="set('password', $event)"
      >
        <template #trailing>
          <MdIconButton
            :icon="showPassword ? 'visibility_off' : 'visibility'"
            :label="showPassword ? 'Hide password' : 'Show password'"
            @click="showPassword = !showPassword"
          />
        </template>
      </MdTextField>
      <MdTextField label="Password hint" :model-value="str('passwordHint')" @update:model-value="set('passwordHint', $event)" />
    </div>

    <div>
      <button
        type="button"
        class="state-layer type-label-large -mx-2 flex min-h-12 items-center gap-2 rounded-full pr-4 pl-2 text-on-surface-variant"
        :aria-expanded="showAdvanced"
        @click="showAdvanced = !showAdvanced"
      >
        <MdIcon name="chevron_right" :size="20" class="transition-transform duration-150" :class="{ 'rotate-90': showAdvanced }" />
        More fields
      </button>
      <div v-if="showAdvanced" class="mt-4 space-y-5">
        <MdTextField label="Alias" supporting="Used in the link instead of the file name" :model-value="str('alias')" @update:model-value="set('alias', $event)" />
        <MdTextField label="Author" supporting="Defaults to vermilion10" :model-value="str('author')" @update:model-value="set('author', $event)" />
        <MdTextField label="Source link" supporting="For reposts; the license box links here" :model-value="str('sourceLink')" @update:model-value="set('sourceLink', $event)" />
        <MdTextField label="License name" supporting="Defaults to CC BY-NC-SA 4.0" :model-value="str('licenseName')" @update:model-value="set('licenseName', $event)" />
        <MdTextField label="License URL" :model-value="str('licenseUrl')" @update:model-value="set('licenseUrl', $event)" />
        <div class="-mx-4">
          <MdSwitch label="Comments" :model-value="docMeta.comment !== false" @update:model-value="setFlag('comment', $event, true)" />
        </div>
      </div>
    </div>
  </form>
</template>
