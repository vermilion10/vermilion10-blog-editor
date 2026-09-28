<script setup lang="ts">
// MD3 small top app bar: title (with an optional status line) and trailing
// actions.
defineProps<{ title: string; subtitle?: string }>();
</script>

<template>
  <header class="flex h-16 shrink-0 items-center gap-1 pr-2 pl-4">
    <slot name="leading" />
    <div class="min-w-0 flex-1">
      <h1 class="type-title-large truncate text-on-surface">{{ title }}</h1>
      <p v-if="subtitle" class="type-body-small truncate text-on-surface-variant">{{ subtitle }}</p>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <slot />
    </div>
  </header>
</template>
