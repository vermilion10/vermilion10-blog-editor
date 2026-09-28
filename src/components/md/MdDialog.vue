<script setup lang="ts">
import { onMounted, ref } from 'vue';
import MdIcon from './MdIcon.vue';
import type { IconName } from '../../lib/icons';

// MD3 basic dialog on the native <dialog> element, which handles focus
// trapping, Escape and the modal backdrop.
defineProps<{ headline: string; icon?: IconName }>();
const emit = defineEmits<{ close: [] }>();

const dialog = ref<HTMLDialogElement>();
onMounted(() => dialog.value?.showModal());
</script>

<template>
  <dialog ref="dialog" class="md-dialog" @cancel.prevent="emit('close')" @click.self="emit('close')">
    <div class="flex max-h-[inherit] flex-col">
      <div class="px-6 pt-6" :class="{ 'text-center': icon }">
        <MdIcon v-if="icon" :name="icon" class="mb-4 text-secondary" />
        <h2 class="type-headline-small text-on-surface">{{ headline }}</h2>
      </div>
      <div class="scroll-thin min-h-0 flex-1 overflow-y-auto px-6 pt-4 pb-6 type-body-medium text-on-surface-variant">
        <slot />
      </div>
      <div v-if="$slots.actions" class="flex flex-wrap justify-end gap-2 px-6 pb-6">
        <slot name="actions" />
      </div>
    </div>
  </dialog>
</template>

<style>
.md-dialog {
  width: calc(100% - 48px);
  max-width: 560px;
  max-height: calc(100dvh - 48px);
  margin: auto;
  padding: 0;
  border: 0;
  border-radius: var(--md-sys-shape-corner-extra-large);
  background: var(--md-sys-color-surface-container-high);
  color: var(--md-sys-color-on-surface);
  overflow: hidden;
}

.md-dialog[open] {
  animation: md-dialog-in var(--md-sys-motion-duration-medium) var(--md-sys-motion-easing-emphasized-decelerate);
}

.md-dialog::backdrop {
  background: color-mix(in srgb, var(--md-sys-color-scrim) 32%, transparent);
}

@keyframes md-dialog-in {
  from { opacity: 0; transform: translateY(-16px) scale(0.98); }
}
</style>
