<script setup lang="ts">
import { isDirty, state } from '../../lib/store';
import MdButton from '../md/MdButton.vue';
import MdIconButton from '../md/MdIconButton.vue';

// Discard and publish for the open post. `compact` turns Publish into an icon
// button for narrow top app bars.
defineProps<{ compact?: boolean }>();
defineEmits<{ discard: []; publish: [] }>();
</script>

<template>
  <template v-if="state.doc">
    <MdIconButton
      v-if="isDirty || state.doc.baseSha === null"
      :icon="state.doc.baseSha === null ? 'delete' : 'undo'"
      :label="state.doc.baseSha === null ? 'Delete draft' : 'Discard local changes'"
      @click="$emit('discard')"
    />
    <MdIconButton
      v-if="compact"
      variant="filled"
      icon="cloud_upload"
      label="Publish (Ctrl+Shift+S)"
      :disabled="!isDirty"
      @click="$emit('publish')"
    />
    <MdButton v-else variant="filled" icon="cloud_upload" :disabled="!isDirty" title="Ctrl+Shift+S" @click="$emit('publish')">Publish</MdButton>
  </template>
</template>
