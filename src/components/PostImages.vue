<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { docMeta, setDocField, state } from '../lib/store';
import { listObjects, postFolder, r2, r2Available, type R2Object } from '../lib/r2';
import { addImages, imageMarkdown, imageQueue, insertAtCursor } from '../lib/images';
import { cdn } from '../renderer/cdn';
import { getWsrvImageUrl } from '../renderer/image';
import MdButton from './md/MdButton.vue';
import MdIconButton from './md/MdIconButton.vue';

// What's already in the post's image folder, to reuse without re-uploading.

const folder = computed(() => {
  if (!state.doc) return '';
  const published = typeof docMeta.value.published === 'string' ? docMeta.value.published : '';
  return postFolder(state.doc.path, published);
});

const items = ref<R2Object[]>([]);
const loading = ref(false);
const error = ref('');
const copied = ref('');

async function load() {
  if (!r2Available || !r2.status || !folder.value) return;
  loading.value = true;
  error.value = '';
  try {
    items.value = (await listObjects(folder.value))
      .filter((o) => /\.(webp|avif|png|jpe?g|gif|svg)$/i.test(o.key))
      .sort((a, b) => b.lastModified.localeCompare(a.lastModified));
  } catch (err) {
    error.value = String((err as Error)?.message ?? err);
  } finally {
    loading.value = false;
  }
}

watch([folder, () => r2.status, () => imageQueue.uploaded], load, { immediate: true });

const thumb = (key: string) => getWsrvImageUrl(cdn(key), { width: 240, height: 240, fit: 'cover' });
const name = (key: string) => key.slice(folder.value.length);

async function copyKey(key: string) {
  await navigator.clipboard.writeText(key);
  copied.value = key;
  window.setTimeout(() => { if (copied.value === key) copied.value = ''; }, 1500);
}

const picker = ref<HTMLInputElement>();
function onPick(event: Event) {
  const input = event.target as HTMLInputElement;
  if (input.files?.length) addImages(input.files, { kind: 'insert', insert: insertAtCursor });
  input.value = '';
}

defineExpose({ reload: load });
</script>

<template>
  <section v-if="r2Available">
    <div class="mb-2 flex items-center justify-between gap-2">
      <h3 class="type-title-small text-on-surface">Images in this post’s folder</h3>
      <MdIconButton v-if="r2.status" icon="refresh" label="Reload images" :disabled="loading" @click="load" />
    </div>
    <p class="type-body-small mb-3 font-mono break-all text-on-surface-variant">{{ folder }}</p>

    <p v-if="!r2.status" class="type-body-medium text-on-surface-variant">Connect R2 in Settings to upload and reuse images.</p>
    <p v-else-if="error" class="type-body-medium rounded-md bg-error-container p-3 text-on-error-container">{{ error }}</p>
    <p v-else-if="!loading && !items.length" class="type-body-medium text-on-surface-variant">Nothing uploaded for this post yet. Drop an image into the editor, or pick one below.</p>

    <ul v-if="items.length" class="grid grid-cols-2 gap-3">
      <li v-for="item in items" :key="item.key" class="overflow-hidden rounded-md bg-surface-container-high">
        <img :src="thumb(item.key)" :alt="name(item.key)" loading="lazy" class="aspect-square w-full object-cover" />
        <p class="type-label-small truncate px-2 pt-1.5 text-on-surface-variant" :title="item.key">{{ name(item.key) }}</p>
        <div class="flex justify-between px-1 pb-1">
          <MdIconButton icon="add" label="Insert at cursor" @click="insertAtCursor(imageMarkdown(item.key, ''))" />
          <MdIconButton icon="image" label="Use as cover" :selected="docMeta.image === item.key" @click="setDocField('image', item.key)" />
          <MdIconButton :icon="copied === item.key ? 'check' : 'content_copy'" :label="copied === item.key ? 'Copied' : 'Copy path'" @click="copyKey(item.key)" />
        </div>
      </li>
    </ul>

    <template v-if="r2.status">
      <input ref="picker" type="file" accept="image/*" multiple class="hidden" @change="onPick" />
      <MdButton class="mt-3" variant="tonal" icon="add_photo_alternate" @click="picker?.click()">Add images</MdButton>
    </template>
  </section>
</template>
