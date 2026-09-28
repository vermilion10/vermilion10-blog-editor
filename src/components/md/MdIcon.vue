<script setup lang="ts">
import { ICONS, type IconName } from '../../lib/icons';

withDefaults(defineProps<{ name: IconName; size?: number }>(), { size: 24 });
</script>

<template>
  <span
    class="md-icon inline-flex shrink-0"
    :style="{ width: `${size}px`, height: `${size}px` }"
    aria-hidden="true"
    v-html="ICONS[name]"
  ></span>
</template>

<style>
.md-icon svg {
  width: 100%;
  height: 100%;
  fill: currentColor;
}
</style>
