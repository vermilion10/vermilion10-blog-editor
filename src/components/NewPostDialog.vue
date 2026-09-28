<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MdDialog from './md/MdDialog.vue';
import MdButton from './md/MdButton.vue';
import MdTextField from './md/MdTextField.vue';
import MdSegmented from './md/MdSegmented.vue';
import { createPost, state } from '../lib/store';
import { slugify } from '../lib/frontmatter';

const emit = defineEmits<{ close: []; created: [] }>();

const title = ref('');
const slug = ref('');
const slugEdited = ref(false);
const lang = ref<'en' | 'id'>('en');
const error = ref('');

watch(title, (t) => {
  if (!slugEdited.value) slug.value = slugify(t);
});

const slugValid = computed(() => /^[a-z0-9][a-z0-9-]*$/.test(slug.value));
const valid = computed(() => title.value.trim() && slugValid.value);

function onSlug(value: string) {
  slugEdited.value = true;
  slug.value = value.trim();
}

function submit() {
  error.value = '';
  try {
    createPost(slug.value, title.value.trim(), lang.value);
    emit('created');
  } catch (err) {
    error.value = (err as Error).message;
  }
}
</script>

<template>
  <MdDialog headline="New post" @close="emit('close')">
    <form id="new-post" class="space-y-5 pt-1" @submit.prevent="submit">
      <MdTextField v-model="title" label="Title" autofocus required autocomplete="off" />
      <MdTextField
        :model-value="slug"
        label="File name"
        mono
        required
        autocomplete="off"
        :supporting="`${state.config.postsDir}/${slug || '…'}.md`"
        :error="slug && !slugValid ? 'Lowercase letters, numbers and dashes only' : error || undefined"
        @update:model-value="onSlug"
      />
      <div>
        <p class="type-label-large mb-2 text-on-surface">Language</p>
        <MdSegmented
          v-model="lang"
          label="Language"
          :options="[
            { value: 'en', label: 'English', icon: 'translate' },
            { value: 'id', label: 'Indonesian', icon: 'translate' },
          ]"
        />
      </div>
    </form>
    <template #actions>
      <MdButton @click="emit('close')">Cancel</MdButton>
      <MdButton type="submit" form="new-post" :disabled="!valid">Create draft</MdButton>
    </template>
  </MdDialog>
</template>
