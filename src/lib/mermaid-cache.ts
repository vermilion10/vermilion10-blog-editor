import mermaid from 'mermaid';

// The blog renderer re-renders every Mermaid diagram each time it renders,
// and each diagram blocks the main thread for a few hundred milliseconds. In
// the preview that happened on every pause in typing; a post with 30 diagrams
// froze the editor for seconds each time. Rendered SVGs are cached by source
// here, so a diagram is only drawn once per session unless it changes.
//
// This wraps mermaid.run rather than touching the renderer, which is synced
// from the blog repo. The renderer shares this same mermaid module instance.

const cache = new Map<string, string>();
const run = mermaid.run.bind(mermaid);

type RunOptions = Parameters<typeof mermaid.run>[0];

mermaid.run = async (options?: RunOptions) => {
  const nodes = options?.nodes
    ? Array.from(options.nodes as ArrayLike<HTMLElement>)
    : Array.from(document.querySelectorAll<HTMLElement>(options?.querySelector ?? '.mermaid'));

  const pending: { el: HTMLElement; source: string }[] = [];
  for (const el of nodes) {
    if (el.getAttribute('data-processed')) continue;
    const source = el.getAttribute('data-mermaid-source') ?? el.textContent ?? '';
    const hit = cache.get(source);
    if (hit) {
      el.innerHTML = hit;
      el.setAttribute('data-processed', 'true');
    } else {
      pending.push({ el, source });
    }
  }
  if (!pending.length) return;

  await run({ ...options, nodes: pending.map((p) => p.el) });
  for (const { el, source } of pending) {
    const svg = el.querySelector('svg');
    if (svg) cache.set(source, svg.outerHTML);
  }
};
