<script setup lang="ts">
import MdButton from '../md/MdButton.vue';

defineProps<{ what: string; showBrowse?: boolean }>();
defineEmits<{ browse: []; create: [] }>();
</script>

<template>
  <div class="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
    <p class="type-body-large max-w-sm text-on-surface-variant">
      No post is open. {{ what }}
    </p>
    <div class="flex flex-wrap justify-center gap-2">
      <MdButton v-if="showBrowse" variant="tonal" icon="description" @click="$emit('browse')">Browse posts</MdButton>
      <MdButton :variant="showBrowse ? 'text' : 'tonal'" icon="add" @click="$emit('create')">New post</MdButton>
    </div>
  </div>
</template>
