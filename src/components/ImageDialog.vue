<script setup lang="ts">
import { computed, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import MdDialog from './md/MdDialog.vue';
import MdButton from './md/MdButton.vue';
import MdTextField from './md/MdTextField.vue';
import MdSwitch from './md/MdSwitch.vue';
import MdSlider from './md/MdSlider.vue';
import MdSegmented from './md/MdSegmented.vue';
import MdIcon from './md/MdIcon.vue';
import { imageQueue, finishCurrentImage, cancelAllImages, imageMarkdown } from '../lib/images';
import { ImageProcessor } from '../lib/image/processor';
import { EXT, MIME, type ImageFormat } from '../lib/image/types';
import {
  r2, r2Available, headObject, putObject, postFolder, safeName, withExtension, nextVersion, KEY_PATTERN,
} from '../lib/r2';
import { docMeta, setDocField, state } from '../lib/store';
import { readJson, writeJson } from '../lib/platform';

const emit = defineEmits<{ openSettings: [] }>();

type Format = ImageFormat | 'original';

// Settings persist across images and sessions, like a converter app would.
const settings = reactive({
  format: 'webp' as Format,
  quality: 85,
  lossless: false,
  maxWidth: 1920,
  targetKB: '',
  ...readJson<Record<string, unknown>>('image-settings', {}),
});
watch(settings, (s) => writeJson('image-settings', { ...s }), { deep: true });

const WIDTHS = [0, 3840, 2560, 1920, 1600, 1280, 1024, 800];
const FORMATS: { value: Format; label: string; hint: string }[] = [
  { value: 'webp', label: 'WebP', hint: 'Small, supported everywhere' },
  { value: 'avif', label: 'AVIF', hint: 'Smallest, slower to encode' },
  { value: 'jpeg', label: 'JPEG (MozJPEG)', hint: 'Photos, widest compatibility' },
  { value: 'png', label: 'PNG (OxiPNG)', hint: 'Lossless, optimized' },
  { value: 'original', label: 'Keep original file', hint: 'Uploads the file untouched' },
];

const current = computed(() => imageQueue.items[0] ?? null);
const processor = shallowRef<ImageProcessor | null>(null);

const original = ref<{ width: number; height: number; size: number; type: string; url: string } | null>(null);
const result = ref<{ blob: Blob; url: string; width: number; height: number; size: number; quality: number; reachedTarget: boolean } | null>(null);
const decodable = ref(true);
const encoding = ref(false);
const error = ref('');
const compare = ref<'result' | 'original'>('result');

const key = ref('');
const keyEdited = ref(false);
const keyStatus = ref<'idle' | 'checking' | 'free' | 'taken' | 'invalid' | 'error'>('idle');
const alt = ref('');
const asCover = ref(false);
const uploading = ref(false);

const outputFormat = computed<Format>(() => (decodable.value ? settings.format : 'original'));
const lossyControls = computed(() => outputFormat.value !== 'original' && outputFormat.value !== 'png' && !settings.lossless);
const targetBytes = computed(() => {
  const kb = Number(settings.targetKB);
  return Number.isFinite(kb) && kb > 0 ? Math.round(kb * 1024) : 0;
});
const fileExt = computed(() => (outputFormat.value === 'original'
  ? (current.value?.file.name.split('.').pop() ?? 'bin').toLowerCase()
  : EXT[outputFormat.value as ImageFormat]));

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

const outSize = computed(() => (outputFormat.value === 'original' ? original.value?.size ?? current.value?.file.size ?? 0 : result.value?.size ?? 0));
const savings = computed(() => {
  const before = current.value?.file.size ?? 0;
  if (!before || !outSize.value || outputFormat.value === 'original') return '';
  const pct = Math.round((1 - outSize.value / before) * 100);
  return pct >= 0 ? `${pct}% smaller` : `${-pct}% larger`;
});

// --- Load each queued image -----------------------------------------------------

function revoke() {
  if (original.value) URL.revokeObjectURL(original.value.url);
  if (result.value) URL.revokeObjectURL(result.value.url);
}

watch(current, async (item) => {
  revoke();
  original.value = null;
  result.value = null;
  error.value = '';
  compare.value = 'result';
  keyEdited.value = false;
  alt.value = '';
  if (!item) {
    processor.value?.dispose();
    processor.value = null;
    return;
  }
  asCover.value = item.target.kind === 'cover';
  processor.value ??= new ImageProcessor();
  const file = item.file;
  // Animated GIFs and SVGs would lose what makes them what they are.
  const keepAsIs = /image\/(gif|svg\+xml)/.test(file.type);
  try {
    const dims = keepAsIs ? await imageSize(file) : await processor.value.load(file);
    decodable.value = !keepAsIs;
    original.value = { ...dims, size: file.size, type: file.type || 'unknown', url: URL.createObjectURL(file) };
  } catch {
    // Formats the web view can't decode (HEIC, for one) can still be uploaded as-is.
    decodable.value = false;
    original.value = { width: 0, height: 0, size: file.size, type: file.type || 'unknown', url: URL.createObjectURL(file) };
  }
  resetKey();
  void runEncode();
}, { immediate: true });

function imageSize(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { resolve({ width: img.naturalWidth, height: img.naturalHeight }); URL.revokeObjectURL(img.src); };
    img.onerror = () => resolve({ width: 0, height: 0 });
    img.src = URL.createObjectURL(file);
  });
}

// --- Encode on every settings change (latest request wins) ---------------------

let encodeSeq = 0;
let encodeTimer: number | undefined;

async function runEncode() {
  const seq = ++encodeSeq;
  if (!processor.value || !original.value || outputFormat.value === 'original') {
    encoding.value = false;
    return;
  }
  encoding.value = true;
  error.value = '';
  try {
    const out = await processor.value.encode({
      format: outputFormat.value as ImageFormat,
      quality: settings.quality,
      lossless: settings.lossless,
      maxWidth: settings.maxWidth,
      targetBytes: targetBytes.value,
    });
    if (seq !== encodeSeq) return;
    const blob = new Blob([out.bytes], { type: MIME[outputFormat.value as ImageFormat] });
    if (result.value) URL.revokeObjectURL(result.value.url);
    result.value = { blob, url: URL.createObjectURL(blob), width: out.width, height: out.height, size: blob.size, quality: out.quality, reachedTarget: out.reachedTarget };
  } catch (err) {
    if (seq === encodeSeq) error.value = `Encoding failed: ${(err as Error).message}`;
  } finally {
    if (seq === encodeSeq) encoding.value = false;
  }
}

watch(() => [settings.format, settings.quality, settings.lossless, settings.maxWidth, targetBytes.value], () => {
  window.clearTimeout(encodeTimer);
  encodeTimer = window.setTimeout(runEncode, 250);
});

// --- Destination key --------------------------------------------------------------

function resetKey() {
  if (!current.value || !state.doc) return;
  const published = typeof docMeta.value.published === 'string' ? docMeta.value.published : '';
  const name = asCover.value ? `cover.${fileExt.value}` : safeName(current.value.file.name, fileExt.value);
  key.value = postFolder(state.doc.path, published) + name;
}

watch(fileExt, (ext) => {
  if (key.value) key.value = withExtension(key.value, ext);
});
watch(asCover, () => { if (!keyEdited.value) resetKey(); });

let keyTimer: number | undefined;
let keySeq = 0;
watch(key, (k) => {
  window.clearTimeout(keyTimer);
  if (!KEY_PATTERN.test(k) || k.includes('..') || k.endsWith('/')) {
    keyStatus.value = 'invalid';
    return;
  }
  if (!r2Available || !r2.status) {
    keyStatus.value = 'idle';
    return;
  }
  keyStatus.value = 'checking';
  const seq = ++keySeq;
  keyTimer = window.setTimeout(async () => {
    try {
      const size = await headObject(k);
      if (seq === keySeq) keyStatus.value = size === null ? 'free' : 'taken';
    } catch {
      if (seq === keySeq) keyStatus.value = 'error';
    }
  }, 400);
}, { immediate: true });

function onKeyInput(v: string) {
  keyEdited.value = true;
  key.value = v.trim();
}

const keyMessage = computed(() => ({
  idle: '',
  checking: 'Checking the bucket…',
  free: 'Available',
  taken: 'Already in the bucket. Files there are cached for a year, so use a new name.',
  invalid: 'Letters, numbers, dots, dashes and slashes only.',
  error: 'Could not check the bucket.',
}[keyStatus.value]));

// --- Upload ----------------------------------------------------------------------

const canUpload = computed(() =>
  !!current.value && r2Available && !!r2.status && keyStatus.value === 'free' && !uploading.value
  && (outputFormat.value === 'original' || (!!result.value && !encoding.value)));

async function upload() {
  const item = current.value;
  if (!item || !canUpload.value) return;
  uploading.value = true;
  error.value = '';
  try {
    const isOriginal = outputFormat.value === 'original';
    const blob = isOriginal ? item.file : result.value!.blob;
    const type = isOriginal ? item.file.type || 'application/octet-stream' : MIME[outputFormat.value as ImageFormat];
    await putObject(key.value, new Uint8Array(await blob.arrayBuffer()), type);
    if (asCover.value) setDocField('image', key.value);
    if (item.target.kind === 'insert') item.target.insert(imageMarkdown(key.value, alt.value.trim()));
    imageQueue.uploaded++;
    finishCurrentImage();
  } catch (err) {
    error.value = (err as Error).message ?? String(err);
    if (/already exists/.test(error.value)) keyStatus.value = 'taken';
  } finally {
    uploading.value = false;
  }
}

function skip() {
  finishCurrentImage();
}

function cancel() {
  cancelAllImages();
}

onBeforeUnmount(() => {
  revoke();
  processor.value?.dispose();
});
</script>

<template>
  <MdDialog
    v-if="current"
    :headline="imageQueue.batchSize > 1 ? `Add image ${imageQueue.batchIndex + 1} of ${imageQueue.batchSize}` : 'Add image'"
    @close="cancel"
  >
    <form id="image-form" class="space-y-5" @submit.prevent="upload">
      <!-- Not usable here: explain why and how to fix it -->
      <div v-if="!r2Available" class="type-body-medium rounded-md bg-surface-container-highest p-4">
        Uploading needs the desktop or Android app; this browser build has no access to R2.
      </div>
      <div v-else-if="r2.loaded && !r2.status" class="flex flex-wrap items-center gap-3 rounded-md bg-surface-container-highest p-4">
        <p class="type-body-medium flex-1">Connect your R2 bucket first. It takes an API token from the Cloudflare dashboard.</p>
        <MdButton variant="tonal" icon="settings" @click="emit('openSettings')">Set up R2</MdButton>
      </div>

      <!-- Preview -->
      <div class="overflow-hidden rounded-lg bg-surface-container-highest">
        <div class="vb-checker flex h-[min(40vh,320px)] items-center justify-center">
          <img
            v-if="(compare === 'result' && result) || (outputFormat === 'original' && original)"
            :src="compare === 'result' && result && outputFormat !== 'original' ? result.url : original?.url"
            alt=""
            class="max-h-full max-w-full object-contain"
          />
          <img v-else-if="original" :src="original.url" alt="" class="max-h-full max-w-full object-contain opacity-60" />
        </div>
        <div v-if="encoding" class="md-linear-progress" role="progressbar" aria-label="Encoding"></div>
        <div class="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <p class="type-body-small text-on-surface-variant" aria-live="polite">
            <template v-if="original">
              {{ original.width ? `${original.width}×${original.height} · ` : '' }}{{ formatBytes(original.size) }}
              <template v-if="outputFormat !== 'original'">
                <span aria-hidden="true"> → </span>
                <template v-if="encoding">encoding…</template>
                <template v-else-if="result">
                  <b class="text-on-surface">{{ result.width }}×{{ result.height }} · {{ formatBytes(result.size) }}</b>
                  <span v-if="savings"> ({{ savings }})</span>
                </template>
              </template>
            </template>
          </p>
          <MdSegmented
            v-if="outputFormat !== 'original'"
            v-model="compare"
            label="Show"
            icon-only
            :options="[
              { value: 'result', label: 'Show result', icon: 'image' },
              { value: 'original', label: 'Show original', icon: 'visibility' },
            ]"
          />
        </div>
      </div>

      <p v-if="!decodable" class="type-body-small text-on-surface-variant">
        This file is uploaded as it is{{ /gif|svg/.test(original?.type ?? '') ? ', so animation and vectors are kept' : ': the app can’t decode it for conversion' }}.
      </p>

      <!-- Conversion settings -->
      <template v-if="decodable">
        <MdTextField v-model="settings.format" label="Format" select>
          <option v-for="f in FORMATS" :key="f.value" :value="f.value">{{ f.label }}: {{ f.hint }}</option>
        </MdTextField>

        <div v-if="settings.format === 'webp' || settings.format === 'avif'" class="-mx-4">
          <MdSwitch v-model="settings.lossless" label="Lossless" supporting="Best for screenshots, pixel art and flat artwork" />
        </div>

        <MdSlider
          v-if="settings.format !== 'original'"
          v-model="settings.quality"
          label="Quality"
          :min="1"
          :max="100"
          :disabled="!lossyControls || targetBytes > 0"
          :value-text="!lossyControls ? 'Lossless' : targetBytes > 0 ? (result ? `${result.quality} (from target size)` : 'From target size') : String(settings.quality)"
        />

        <div v-if="settings.format !== 'original'" class="grid grid-cols-2 gap-3">
          <MdTextField :model-value="String(settings.maxWidth)" label="Max width" select @update:model-value="settings.maxWidth = Number($event)">
            <option v-for="w in WIDTHS" :key="w" :value="String(w)">{{ w ? `${w} px` : 'Original' }}</option>
          </MdTextField>
          <MdTextField
            v-model="settings.targetKB"
            label="Target size (KB)"
            inputmode="numeric"
            autocomplete="off"
            :disabled="!lossyControls"
            :supporting="!lossyControls ? 'Lossy formats only' : targetBytes && result && !result.reachedTarget ? 'Not reachable at this width' : 'Optional'"
            :error="targetBytes && result && !result.reachedTarget ? 'Too small even at quality 5. Lower the max width.' : undefined"
          />
        </div>
        <p class="type-body-small -mt-2 text-on-surface-variant">Location and camera data are removed when the image is converted.</p>
      </template>

      <!-- Destination -->
      <MdTextField
        :model-value="key"
        label="Path in the bucket"
        mono
        autocomplete="off"
        spellcheck="false"
        :supporting="keyStatus === 'taken' || keyStatus === 'invalid' ? undefined : keyMessage"
        :error="keyStatus === 'taken' || keyStatus === 'invalid' ? keyMessage : undefined"
        @update:model-value="onKeyInput"
      />
      <MdButton v-if="keyStatus === 'taken'" class="-mt-3" icon="edit" @click="onKeyInput(nextVersion(key))">
        Use {{ nextVersion(key).split('/').pop() }}
      </MdButton>

      <MdTextField v-if="current.target.kind === 'insert'" v-model="alt" label="Alt text" supporting="Describes the image; shown as its caption in carousels. Start with w-70% to size it." autocomplete="off" />
      <div class="-mx-4">
        <MdSwitch v-model="asCover" label="Use as cover image" supporting="Sets the post’s image field" />
      </div>

      <p v-if="error" class="type-body-medium flex gap-2 rounded-md bg-error-container p-4 text-on-error-container">
        <MdIcon name="error" :size="20" class="mt-px" />{{ error }}
      </p>
    </form>
    <template #actions>
      <MdButton @click="cancel">{{ imageQueue.items.length > 1 ? 'Cancel all' : 'Cancel' }}</MdButton>
      <MdButton v-if="imageQueue.items.length > 1" @click="skip">Skip</MdButton>
      <MdButton variant="filled" type="submit" form="image-form" icon="cloud_upload" :loading="uploading" :disabled="!canUpload">
        {{ uploading ? 'Uploading' : 'Upload' }}
      </MdButton>
    </template>
  </MdDialog>
</template>

<style>
/* Checkerboard behind the preview so transparency is visible. */
.vb-checker {
  background-color: var(--md-sys-color-surface-container-highest);
  background-image:
    linear-gradient(45deg, var(--md-sys-color-surface-container) 25%, transparent 25%),
    linear-gradient(-45deg, var(--md-sys-color-surface-container) 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, var(--md-sys-color-surface-container) 75%),
    linear-gradient(-45deg, transparent 75%, var(--md-sys-color-surface-container) 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0;
}
</style>
