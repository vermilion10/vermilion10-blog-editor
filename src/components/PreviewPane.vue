<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import MarkdownRenderer from '../renderer/MarkdownRenderer.vue';
import { resolveAssetUrl } from '../renderer/cdn';
import { getWsrvImageUrl } from '../renderer/image';
import { parseFrontmatter, splitDoc } from '../lib/frontmatter';
import { openExternal } from '../lib/platform';
import MdSegmented from './md/MdSegmented.vue';

// The width toggle is pointless when the window already is phone-sized.
const props = defineProps<{ content: string; widthToggle?: boolean }>();

const width = ref<'desktop' | 'phone'>('desktop');

// Re-rendering runs Shiki and Mermaid over the whole post, so wait for a pause
// in typing rather than rendering on every keystroke.
const debounced = ref(props.content);
let timer: number | undefined;
watch(() => props.content, (next) => {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => { debounced.value = next; }, 250);
});

const body = computed(() => splitDoc(debounced.value).body);
const meta = computed(() => parseFrontmatter(debounced.value));
const str = (key: string) => {
  const v = meta.value[key];
  return typeof v === 'string' ? v : '';
};
const tags = computed(() => (Array.isArray(meta.value.tags) ? meta.value.tags : []));
const cover = computed(() => (str('image') ? getWsrvImageUrl(resolveAssetUrl(str('image')), { width: 1200 }) : ''));

// Links in the preview must never navigate the editor's own webview away.
function onClick(event: MouseEvent) {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
  if (!link) return;
  const href = link.getAttribute('href') ?? '';
  if (href.startsWith('#')) return;
  event.preventDefault();
  if (/^https?:\/\//.test(link.href)) void openExternal(link.href);
}
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <div v-if="widthToggle" class="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
      <span class="type-title-small text-on-surface-variant">As it appears on the site</span>
      <MdSegmented
        v-model="width"
        label="Preview width"
        icon-only
        :options="[
          { value: 'desktop', label: 'Desktop width', icon: 'desktop_windows' },
          { value: 'phone', label: 'Phone width', icon: 'mobile' },
        ]"
      />
    </div>

    <!-- The blog is dark-only, so this surface is too, whatever the app theme. -->
    <div class="scroll-thin min-h-0 flex-1 overflow-y-auto bg-blog font-[Inter] [color-scheme:dark]" @click.capture="onClick">
      <article
        class="mx-auto px-5 py-8 transition-[max-width] duration-300 ease-standard"
        :class="widthToggle && width === 'phone' ? 'max-w-[390px]' : 'max-w-[800px]'"
      >
        <img v-if="cover" :src="cover" alt="" class="mb-6 aspect-[2/1] w-full rounded-xl object-cover" />
        <h1 class="mb-3 text-[1.9rem] leading-tight font-bold text-white">{{ str('title') || 'Untitled' }}</h1>
        <div class="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[#9a9aa8]">
          <span v-if="str('published')"><i class="fa-regular fa-calendar mr-1"></i>{{ str('published') }}</span>
          <span v-if="str('updated') && str('updated') !== str('published')"><i class="fa-solid fa-pen mr-1"></i>{{ str('updated') }}</span>
          <span v-if="str('category')"><i class="fa-regular fa-folder mr-1"></i>{{ str('category') }}</span>
          <span v-if="str('lang')" class="uppercase">{{ str('lang') }}</span>
          <span v-if="meta.draft === true" class="rounded bg-[#f9731624] px-1.5 py-0.5 text-[#f97316]">Draft</span>
          <span v-if="meta.encrypted === true"><i class="fa-solid fa-lock mr-1"></i>Password protected</span>
        </div>
        <p v-if="str('description')" class="mb-3 text-[0.95rem] text-[#9a9aa8]">{{ str('description') }}</p>
        <div v-if="tags.length" class="mb-8 flex flex-wrap gap-1.5">
          <span v-for="tag in tags" :key="tag" class="rounded-full border border-[#262632] px-2 py-0.5 text-xs text-[#9a9aa8]">#{{ tag }}</span>
        </div>
        <hr class="mb-6 border-[#262632]" />
        <MarkdownRenderer :content="body" />
      </article>
    </div>
  </div>
</template>
