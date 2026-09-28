<script setup lang="ts">
import { computed, ref } from 'vue';
import MdDialog from './md/MdDialog.vue';
import MdButton from './md/MdButton.vue';
import MdTextField from './md/MdTextField.vue';
import MdSwitch from './md/MdSwitch.vue';
import MdIcon from './md/MdIcon.vue';
import { ConflictError, docMeta, publish, state } from '../lib/store';
import type { CommitResult } from '../lib/github';
import { splitDoc } from '../lib/frontmatter';

const emit = defineEmits<{ close: []; published: [result: CommitResult] }>();

const doc = state.doc!;
const isNew = doc.baseSha === null;
const fileName = doc.path.split('/').pop()!.replace(/\.md$/, '');
const title = typeof docMeta.value.title === 'string' && docMeta.value.title ? docMeta.value.title : fileName;

// The site falls back to "Untitled" and today's date when these are missing,
// which is almost never what was meant.
const warnings = computed(() => {
  if (splitDoc(doc.content).frontmatter === null) {
    return ['The frontmatter block is missing or broken, so the site will show this post as "Untitled". It must start on the first line with ---.'];
  }
  const out: string[] = [];
  if (!docMeta.value.title) out.push('The post has no title.');
  if (!docMeta.value.published) out.push('The post has no published date.');
  if (docMeta.value.encrypted === true && !docMeta.value.password) out.push('Password protection is on but no password is set.');
  return out;
});

const message = ref(`post: ${isNew ? 'add' : 'update'} "${title}"`);
const bumpUpdated = ref(!isNew);
const busy = ref(false);
const error = ref('');
const conflict = ref('');

// Rough size of the change: lines that appear in one version and not the other.
const stats = computed(() => {
  const before = doc.baseContent ? doc.baseContent.split('\n') : [];
  const after = doc.content.split('\n');
  const pool = new Map<string, number>();
  for (const line of before) pool.set(line, (pool.get(line) ?? 0) + 1);
  let added = 0;
  for (const line of after) {
    const n = pool.get(line) ?? 0;
    if (n > 0) pool.set(line, n - 1);
    else added++;
  }
  const removed = [...pool.values()].reduce((a, b) => a + b, 0);
  return { added, removed };
});

async function submit(force = false) {
  busy.value = true;
  error.value = '';
  conflict.value = '';
  try {
    const result = await publish(message.value, { bumpUpdated: bumpUpdated.value, force });
    emit('published', result);
  } catch (err) {
    if (err instanceof ConflictError) conflict.value = err.message;
    else error.value = (err as Error).message;
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <MdDialog :headline="isNew ? 'Publish new post' : 'Publish changes'" @close="emit('close')">
    <form id="publish" class="space-y-5" @submit.prevent="submit()">
      <div class="rounded-md bg-surface-container-highest px-4 py-3">
        <p class="truncate font-mono text-[0.8125rem] text-on-surface">{{ doc.path }}</p>
        <p class="type-body-small mt-1 flex flex-wrap gap-x-3 text-on-surface-variant">
          <span>{{ state.config.owner }}/{{ state.config.repo }} @ {{ state.config.branch }}</span>
          <span>{{ stats.added }} {{ stats.added === 1 ? 'line' : 'lines' }} added, {{ stats.removed }} removed</span>
        </p>
      </div>

      <ul v-if="warnings.length" class="space-y-2 rounded-md bg-tertiary-container p-4 text-on-tertiary-container">
        <li v-for="w in warnings" :key="w" class="type-body-medium flex gap-3">
          <MdIcon name="warning" :size="20" class="mt-px" />{{ w }}
        </li>
      </ul>

      <MdTextField v-model="message" label="Commit message" multiline :rows="2" mono required />

      <div class="-mx-4">
        <MdSwitch v-model="bumpUpdated" label="Set updated date to today" />
      </div>

      <p class="type-body-small text-on-surface-variant">This commits straight to {{ state.config.branch }}, which starts the site deploy.</p>

      <div v-if="conflict" class="rounded-md bg-error-container p-4 text-on-error-container">
        <p class="type-body-medium mb-2">{{ conflict }}</p>
        <MdButton variant="danger" :disabled="busy" @click="submit(true)">Overwrite anyway</MdButton>
      </div>
      <p v-if="error" class="type-body-medium rounded-md bg-error-container p-4 text-on-error-container">{{ error }}</p>
    </form>
    <template #actions>
      <MdButton @click="emit('close')">Cancel</MdButton>
      <MdButton variant="filled" type="submit" form="publish" icon="cloud_upload" :loading="busy" :disabled="busy || !message.trim()">
        {{ busy ? 'Publishing' : 'Publish' }}
      </MdButton>
    </template>
  </MdDialog>
</template>
