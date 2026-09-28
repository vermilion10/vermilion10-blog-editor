// Insertable snippets for the sidebar, following the blog's
// docs/markdown-cheat-sheet.md. In a snippet, `{sel}` is replaced by the
// selected text and `{|}` marks where the cursor lands afterwards (the end of
// the inserted text when absent).

export interface Snippet {
  label: string;
  hint?: string;
  text: string;
  /** Block snippets go on their own lines, separated by blank lines. */
  block?: boolean;
}

export interface SnippetGroup {
  title: string;
  items: Snippet[];
}

export const CHEAT_SHEET: SnippetGroup[] = [
  {
    title: 'Text',
    items: [
      { label: 'Bold', hint: 'Ctrl+B', text: '**{sel}{|}**' },
      { label: 'Italic', hint: 'Ctrl+I', text: '*{sel}{|}*' },
      { label: 'Strikethrough', text: '~~{sel}{|}~~' },
      { label: 'Inline code', hint: 'Ctrl+E', text: '`{sel}{|}`' },
      { label: 'Link', hint: 'Ctrl+K', text: '[{sel}{|}](https://)' },
      { label: 'Spoiler', hint: '||hidden||', text: '||{sel}{|}||' },
      { label: 'Footnote', hint: 'ref + definition', text: '[^1]\n\n[^1]: {|}' },
      { label: 'Inline math', text: '${sel}{|}$' },
    ],
  },
  {
    title: 'Structure',
    items: [
      { label: 'Heading 2', text: '## {sel}{|}', block: true },
      { label: 'Heading 3', text: '### {sel}{|}', block: true },
      { label: 'Bullet list', text: '- {|}\n- \n- ', block: true },
      { label: 'Numbered list', text: '1. {|}\n2. \n3. ', block: true },
      { label: 'Task list', text: '- [ ] {|}\n- [x] Done', block: true },
      { label: 'Blockquote', text: '> {sel}{|}', block: true },
      { label: 'Table', text: '| Column | Column |\n|--------|--------|\n| {|}      |        |', block: true },
      { label: 'Horizontal rule', text: '---', block: true },
    ],
  },
  {
    title: 'Callouts',
    items: [
      { label: 'Note', hint: '> [!NOTE]', text: '> [!NOTE]\n> {sel}{|}', block: true },
      { label: 'Tip', hint: '> [!TIP]', text: '> [!TIP]\n> {sel}{|}', block: true },
      { label: 'Important', hint: '> [!IMPORTANT]', text: '> [!IMPORTANT]\n> {sel}{|}', block: true },
      { label: 'Warning', hint: '> [!WARNING]', text: '> [!WARNING]\n> {sel}{|}', block: true },
      { label: 'Caution', hint: '> [!CAUTION]', text: '> [!CAUTION]\n> {sel}{|}', block: true },
      { label: 'Directive with title', hint: ':::tip[Title]', text: ':::tip[{|}Title]\n{sel}\n:::', block: true },
      { label: 'Details (collapsible)', hint: ':::details', text: ':::details {|}Summary\n{sel}\n:::', block: true },
      { label: 'Details, open', hint: ':::details{open}', text: ':::details{open} {|}Summary\n{sel}\n:::', block: true },
    ],
  },
  {
    title: 'Code',
    items: [
      { label: 'Code block', text: '```ts\n{sel}{|}\n```', block: true },
      { label: 'With file title', text: '```ts title="src/{|}file.ts"\n{sel}\n```', block: true },
      { label: 'Highlight lines', hint: '{2,4-6}', text: '```ts {2}\n{sel}{|}\n```', block: true },
      { label: 'Added / removed lines', hint: 'ins / del', text: '```ts ins={2} del={1}\n{sel}{|}\n```', block: true },
      { label: 'Collapse lines', hint: 'collapse={…}', text: '```ts collapse={3-20}\n{sel}{|}\n```', block: true },
      { label: 'Wrapped, no numbers', text: '```ts wrap showLineNumbers=false\n{sel}{|}\n```', block: true },
    ],
  },
  {
    title: 'Media',
    items: [
      { label: 'Image', hint: 'R2 key or URL', text: '![{sel}{|}](posts/2026/)' },
      { label: 'Sized image', hint: 'w-70%', text: '![w-70% {sel}{|}](posts/2026/)' },
      {
        label: 'Carousel',
        text: ':::carousel{aspect="4/3" fit="cover"}\n![{|}First caption](posts/2026/)\n![Second caption](posts/2026/)\n:::',
        block: true,
      },
      { label: 'GitHub card', text: ':::github{repo="{|}owner/repo"}\n:::', block: true },
      { label: 'Instagram post', text: ':::instagram{url="{|}https://www.instagram.com/p/"}', block: true },
      { label: 'Facebook post', text: ':::facebook{url="{|}https://www.facebook.com/" width="70%"}', block: true },
    ],
  },
  {
    title: 'Diagrams & math',
    items: [
      { label: 'Flowchart', text: '```mermaid\nflowchart LR\n    A[{|}Start] --> B{Decision}\n    B -->|Yes| C[Done]\n    B -->|No| A\n```', block: true },
      { label: 'Sequence diagram', text: '```mermaid\nsequenceDiagram\n    participant A as Client\n    participant B as Server\n    A->>B: {|}Request\n    B-->>A: Response\n```', block: true },
      { label: 'State diagram', text: '```mermaid\nstateDiagram-v2\n    [*] --> Idle\n    Idle --> {|}Running\n    Running --> [*]\n```', block: true },
      { label: 'Block math', text: '$$\n{sel}{|}\n$$', block: true },
      { label: 'Aligned equations', text: '$$\n\\begin{aligned}\n{|}a &= b + c \\\\\nd &= e\n\\end{aligned}\n$$', block: true },
    ],
  },
];
