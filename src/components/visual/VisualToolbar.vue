<script setup lang="ts">
import { computed } from 'vue';
import type { EditorState } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { schema } from '../../lib/visual/markdown';
import { cmd, editLink, isBlockActive, isInside, isMarkActive } from '../../lib/visual/editing';
import type { IconName } from '../../lib/icons';
import MdIconButton from '../md/MdIconButton.vue';

const props = defineProps<{ state: EditorState; view: () => EditorView | null }>();

type Command = (state: EditorState, dispatch?: EditorView['dispatch'], view?: EditorView) => boolean;

interface Item {
  icon: IconName;
  label: string;
  run: (view: EditorView) => void;
  command?: Command;
  active?: (s: EditorState) => boolean;
}

const { nodes, marks } = schema;

function exec(command: Command) {
  return (view: EditorView) => {
    command(view.state, view.dispatch, view);
    view.focus();
  };
}

const groups: Item[][] = [
  [
    { icon: 'undo', label: 'Undo (Ctrl+Z)', run: exec(cmd.undo), command: cmd.undo },
    { icon: 'redo', label: 'Redo (Ctrl+Y)', run: exec(cmd.redo), command: cmd.redo },
  ],
  [
    { icon: 'format_paragraph', label: 'Paragraph', run: exec(cmd.paragraph), command: cmd.paragraph, active: (s) => isBlockActive(s, nodes.paragraph) },
    { icon: 'format_h2', label: 'Heading 2', run: exec(cmd.heading(2)), command: cmd.heading(2), active: (s) => isBlockActive(s, nodes.heading, { level: 2 }) },
    { icon: 'format_h3', label: 'Heading 3', run: exec(cmd.heading(3)), command: cmd.heading(3), active: (s) => isBlockActive(s, nodes.heading, { level: 3 }) },
  ],
  [
    { icon: 'format_bold', label: 'Bold (Ctrl+B)', run: exec(cmd.bold), command: cmd.bold, active: (s) => isMarkActive(s, marks.strong) },
    { icon: 'format_italic', label: 'Italic (Ctrl+I)', run: exec(cmd.italic), command: cmd.italic, active: (s) => isMarkActive(s, marks.em) },
    { icon: 'strikethrough_s', label: 'Strikethrough', run: exec(cmd.strike), command: cmd.strike, active: (s) => isMarkActive(s, marks.strike) },
    { icon: 'code', label: 'Inline code (Ctrl+E)', run: exec(cmd.code), command: cmd.code, active: (s) => isMarkActive(s, marks.code) },
    { icon: 'visibility_off', label: 'Spoiler', run: exec(cmd.spoiler), command: cmd.spoiler, active: (s) => isMarkActive(s, marks.spoiler) },
    { icon: 'link', label: 'Link (Ctrl+K)', run: (v) => void editLink(v), active: (s) => isMarkActive(s, marks.link) },
  ],
  [
    { icon: 'format_list_bulleted', label: 'Bullet list', run: exec(cmd.bulletList), active: (s) => isInside(s, nodes.bullet_list) },
    { icon: 'format_list_numbered', label: 'Numbered list', run: exec(cmd.orderedList), active: (s) => isInside(s, nodes.ordered_list) },
    { icon: 'checklist', label: 'Task list', run: exec(cmd.taskList), command: cmd.taskList },
    { icon: 'format_quote', label: 'Quote', run: exec(cmd.quote), active: (s) => isInside(s, nodes.blockquote) },
  ],
  [
    { icon: 'data_object', label: 'Code block', run: exec(cmd.codeBlock), command: cmd.codeBlock, active: (s) => isBlockActive(s, nodes.code_block) },
    { icon: 'horizontal_rule', label: 'Divider', run: exec(cmd.divider) },
  ],
];

const rendered = computed(() => groups.map((group) => group.map((item) => ({
  ...item,
  isActive: item.active?.(props.state) ?? false,
  enabled: item.command ? item.command(props.state) : true,
}))));

function onClick(item: Item) {
  const view = props.view();
  if (view) item.run(view);
}
</script>

<template>
  <div class="scroll-thin flex h-14 shrink-0 items-center gap-1 overflow-x-auto px-2" role="toolbar" aria-label="Formatting">
    <template v-for="(group, gi) in rendered" :key="gi">
      <span v-if="gi > 0" class="mx-1 h-6 w-px shrink-0 bg-outline-variant" aria-hidden="true"></span>
      <MdIconButton
        v-for="item in group"
        :key="item.label"
        :icon="item.icon"
        :label="item.label"
        :toggle="!!item.active"
        :selected="item.isActive"
        :disabled="!item.enabled"
        @mousedown.prevent
        @click="onClick(item)"
      />
    </template>
  </div>
</template>
