<script setup lang="ts" generic="T extends string">
import MdIcon from './MdIcon.vue';
import type { IconName } from '../../lib/icons';

// Single-select segmented button. `iconOnly` drops the labels (they stay as
// the accessible name and tooltip) for tight top app bars.
defineProps<{
  options: { value: T; label: string; icon: IconName }[];
  label: string;
  iconOnly?: boolean;
}>();

const model = defineModel<T>({ required: true });
</script>

<template>
  <div class="md-segmented" role="radiogroup" :aria-label="label">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      role="radio"
      class="md-segmented__item state-layer type-label-large"
      :class="{ 'is-selected': model === opt.value, 'is-icon-only': iconOnly }"
      :aria-checked="model === opt.value"
      :aria-label="iconOnly ? opt.label : undefined"
      :title="iconOnly ? opt.label : undefined"
      @click="model = opt.value"
    >
      <MdIcon :name="model === opt.value && !iconOnly ? 'check' : opt.icon" :size="18" />
      <span v-if="!iconOnly">{{ opt.label }}</span>
    </button>
  </div>
</template>

<style>
.md-segmented {
  display: inline-flex;
  height: 40px;
}

.md-segmented__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 48px;
  padding: 0 12px;
  border: 1px solid var(--md-sys-color-outline);
  background: transparent;
  color: var(--md-sys-color-on-surface);
  white-space: nowrap;
}

.md-segmented__item + .md-segmented__item {
  margin-left: -1px;
}

.md-segmented__item:first-child {
  border-radius: 9999px 0 0 9999px;
  padding-left: 16px;
}

.md-segmented__item:last-child {
  border-radius: 0 9999px 9999px 0;
  padding-right: 16px;
}

.md-segmented__item.is-icon-only {
  padding: 0 12px;
}

.md-segmented__item.is-selected {
  background: var(--md-sys-color-secondary-container);
  color: var(--md-sys-color-on-secondary-container);
}
</style>
