<script setup lang="ts">
import { ref, watch } from 'vue';
import { dialogs } from '../lib/dialogs';
import MdDialog from './md/MdDialog.vue';
import MdButton from './md/MdButton.vue';
import MdTextField from './md/MdTextField.vue';
import MarkdownRenderer from '../renderer/MarkdownRenderer.vue';

const value = ref('');
const rendered = ref('');
let timer: number | undefined;

watch(() => dialogs.prompt, (p) => {
  value.value = p?.options.value ?? '';
  rendered.value = value.value;
});

// The live render runs Shiki/Mermaid, so it waits for a pause in typing.
watch(value, (v) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { rendered.value = v; }, 300);
});
</script>

<template>
  <MdDialog
    v-if="dialogs.confirm"
    :headline="dialogs.confirm.options.headline"
    @close="dialogs.confirm.resolve(false)"
  >
    <p>{{ dialogs.confirm.options.body }}</p>
    <template #actions>
      <MdButton @click="dialogs.confirm.resolve(false)">Cancel</MdButton>
      <MdButton :variant="dialogs.confirm.options.danger ? 'danger' : 'filled'" @click="dialogs.confirm.resolve(true)">
        {{ dialogs.confirm.options.confirmLabel }}
      </MdButton>
    </template>
  </MdDialog>

  <MdDialog
    v-if="dialogs.prompt"
    :headline="dialogs.prompt.options.headline"
    @close="dialogs.prompt.resolve(null)"
  >
    <form id="prompt-form" class="space-y-4 pt-1" @submit.prevent="dialogs.prompt.resolve(value)">
      <MdTextField
        v-model="value"
        :label="dialogs.prompt.options.label"
        :supporting="dialogs.prompt.options.supporting"
        :multiline="dialogs.prompt.options.multiline"
        :rows="dialogs.prompt.options.multiline ? Math.min(14, Math.max(4, value.split('\n').length + 1)) : undefined"
        :mono="dialogs.prompt.options.mono"
        autocomplete="off"
        spellcheck="false"
        autofocus
      />
      <div v-if="dialogs.prompt.options.preview && rendered.trim()" class="overflow-hidden rounded-md bg-blog px-4 py-2 font-[Inter] [color-scheme:dark]">
        <MarkdownRenderer :content="rendered" />
      </div>
    </form>
    <template #actions>
      <MdButton @click="dialogs.prompt.resolve(null)">Cancel</MdButton>
      <MdButton type="submit" form="prompt-form">{{ dialogs.prompt.options.confirmLabel ?? 'Apply' }}</MdButton>
    </template>
  </MdDialog>
</template>
