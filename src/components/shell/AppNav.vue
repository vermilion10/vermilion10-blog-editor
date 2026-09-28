<script setup lang="ts" generic="T extends string">
import MdIcon from '../md/MdIcon.vue';
import type { IconName } from '../../lib/icons';

// MD3 navigation: a bottom navigation bar on phones, a navigation rail from
// tablet width up. Active items show the filled icon in a pill indicator.
defineProps<{
  kind: 'bar' | 'rail';
  items: { id: T; label: string; icon: IconName; activeIcon: IconName }[];
  active: T | null;
}>();
defineEmits<{ select: [id: T] }>();
</script>

<template>
  <nav
    class="flex shrink-0 bg-surface-container"
    :class="kind === 'bar'
      ? 'keyboard-hides h-[calc(80px+env(safe-area-inset-bottom))] items-stretch justify-around pb-[env(safe-area-inset-bottom)]'
      : 'w-20 flex-col items-center gap-3 py-4'"
    aria-label="Main"
  >
    <div v-if="kind === 'rail' && $slots.fab" class="mb-4"><slot name="fab" /></div>
    <button
      v-for="item in items"
      :key="item.id"
      type="button"
      class="group flex flex-col items-center gap-1 outline-none"
      :class="kind === 'bar' ? 'flex-1 justify-center pt-3 pb-4' : 'w-full py-1'"
      :aria-current="active === item.id ? 'page' : undefined"
      @click="$emit('select', item.id)"
    >
      <span
        class="state-layer flex h-8 items-center justify-center rounded-full transition-colors duration-200 group-focus-visible:outline-3 group-focus-visible:outline-offset-2 group-focus-visible:outline-secondary"
        :class="[
          kind === 'bar' ? 'w-16' : 'w-14',
          active === item.id ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant',
        ]"
      >
        <MdIcon :name="active === item.id ? item.activeIcon : item.icon" />
      </span>
      <span
        class="type-label-medium"
        :class="active === item.id ? 'text-on-surface' : 'text-on-surface-variant'"
      >{{ item.label }}</span>
    </button>
    <div v-if="kind === 'rail' && $slots.footer" class="mt-auto flex flex-col items-center gap-2"><slot name="footer" /></div>
  </nav>
</template>
