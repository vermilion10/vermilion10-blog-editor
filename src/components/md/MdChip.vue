<script setup lang="ts">
import MdIcon from './MdIcon.vue';

// Input chips carry a remove button; suggestion chips are a single button.
defineProps<{ label: string; kind: 'input' | 'suggestion' }>();
defineEmits<{ remove: []; pick: [] }>();
</script>

<template>
  <span v-if="kind === 'input'" class="md-chip md-chip--input type-label-large">
    <span class="truncate">{{ label }}</span>
    <button type="button" class="md-chip__remove state-layer" :aria-label="`Remove ${label}`" @click="$emit('remove')">
      <MdIcon name="close" :size="18" />
    </button>
  </span>
  <button
    v-else
    type="button"
    class="md-chip md-chip--suggestion state-layer type-label-large"
    @mousedown.prevent
    @click="$emit('pick')"
  >
    <MdIcon name="add" :size="18" />
    <span class="truncate">{{ label }}</span>
  </button>
</template>

<style>
.md-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  max-width: 100%;
  height: 32px;
  border: 1px solid var(--md-sys-color-outline-variant);
  border-radius: var(--md-sys-shape-corner-small);
  background: transparent;
  color: var(--md-sys-color-on-surface-variant);
}

.md-chip--input {
  padding: 0 4px 0 12px;
}

.md-chip--suggestion {
  padding: 0 16px 0 8px;
}

.md-chip__remove {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: inherit;
}

.md-chip__remove::after {
  content: '';
  position: absolute;
  inset: -8px;
}
</style>
