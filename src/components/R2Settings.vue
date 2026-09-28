<script setup lang="ts">
import { reactive, ref } from 'vue';
import MdButton from './md/MdButton.vue';
import MdTextField from './md/MdTextField.vue';
import { clearR2, r2, r2Available, saveR2 } from '../lib/r2';
import { openExternal } from '../lib/platform';
import { confirmDialog } from '../lib/dialogs';

const editing = ref(!r2.status);
const busy = ref(false);
const error = ref('');
const form = reactive({ accountId: r2.status?.accountId ?? '', bucket: r2.status?.bucket ?? '', accessKeyId: '', secretAccessKey: '' });

async function save() {
  busy.value = true;
  error.value = '';
  try {
    await saveR2({ ...form });
    form.secretAccessKey = '';
    editing.value = false;
  } catch (err) {
    error.value = String((err as Error)?.message ?? err);
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  const ok = await confirmDialog({
    headline: 'Disconnect R2?',
    body: 'The token is removed from this device. Files already in the bucket are not touched.',
    confirmLabel: 'Disconnect',
    danger: true,
  });
  if (!ok) return;
  await clearR2();
  editing.value = true;
}
</script>

<template>
  <section>
    <h3 class="type-title-medium mb-2 text-on-surface">Image uploads (R2)</h3>

    <p v-if="!r2Available" class="type-body-medium">Available in the desktop and Android app.</p>

    <template v-else-if="r2.status && !editing">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="type-body-medium">
          Bucket <b class="text-on-surface">{{ r2.status.bucket }}</b>, key <span class="font-mono">{{ r2.status.accessKeyId.slice(0, 6) }}…</span>
        </span>
        <div class="flex gap-2">
          <MdButton variant="outlined" @click="editing = true">Change</MdButton>
          <MdButton @click="disconnect">Disconnect</MdButton>
        </div>
      </div>
    </template>

    <form v-else class="space-y-4" @submit.prevent="save">
      <p class="type-body-small">
        In the Cloudflare dashboard, open R2, then
        <button type="button" class="font-medium text-primary underline-offset-2 hover:underline" @click="openExternal('https://dash.cloudflare.com/?to=/:account/r2/api-tokens')">Manage API tokens</button>,
        and create a token with <b>Object Read &amp; Write</b> applied to your blog’s bucket only. The secret is kept in the system credential store and is only used by the app to sign uploads.
      </p>
      <MdTextField v-model.trim="form.accountId" label="Account ID" mono autocomplete="off" spellcheck="false" required />
      <MdTextField v-model.trim="form.bucket" label="Bucket name" mono autocomplete="off" spellcheck="false" required />
      <MdTextField v-model.trim="form.accessKeyId" label="Access key ID" mono autocomplete="off" spellcheck="false" required />
      <MdTextField v-model.trim="form.secretAccessKey" label="Secret access key" type="password" mono autocomplete="off" required />
      <p v-if="error" class="type-body-medium rounded-md bg-error-container p-3 text-on-error-container">{{ error }}</p>
      <div class="flex justify-end gap-2">
        <MdButton v-if="r2.status" @click="editing = false">Cancel</MdButton>
        <MdButton variant="tonal" type="submit" :loading="busy" :disabled="busy">{{ busy ? 'Checking' : 'Connect' }}</MdButton>
      </div>
    </form>
  </section>
</template>
