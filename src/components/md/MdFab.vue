<script setup lang="ts">
import MdIcon from './MdIcon.vue';
import type { IconName } from '../../lib/icons';

// Floating action button. With a label it is an extended FAB; without one it
// needs `ariaLabel`.
defineProps<{ icon: IconName; label?: string; ariaLabel?: string }>();
</script>

<template>
  <button
    type="button"
    class="md-fab state-layer type-label-large"
    :class="{ 'md-fab--extended': label }"
    :aria-label="label ? undefined : ariaLabel"
    :title="label ? undefined : ariaLabel"
  >
    <MdIcon :name="icon" />
    <span v-if="label">{{ label }}</span>
  </button>
</template>

<style>
.md-fab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 56px;
  height: 56px;
  border: none;
  border-radius: var(--md-sys-shape-corner-large);
  background: var(--md-sys-color-primary-container);
  color: var(--md-sys-color-on-primary-container);
  box-shadow: 0 3px 6px rgb(0 0 0 / 0.25);
}

.md-fab--extended {
  width: auto;
  padding: 0 20px 0 16px;
}
</style>
