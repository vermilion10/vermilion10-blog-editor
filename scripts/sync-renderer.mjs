// Copies the blog's markdown renderer into src/renderer/ so the preview pane
// renders posts with exactly the same pipeline as the live site.
//
// The blog repository is private, so the copy is git-ignored and refreshed
// from a local checkout before every dev run and build. Point BLOG_REPO at
// that checkout, either in the environment or in .env.local:
//
//   BLOG_REPO=/path/to/blog
//
// Without BLOG_REPO an existing copy is kept as is.
import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = resolve(root, 'src/renderer');

function fromEnvFile(key) {
  const file = resolve(root, '.env.local');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
  return line?.slice(key.length + 1).trim().replace(/^["']|["']$/g, '') || undefined;
}

const blogPath = process.env.BLOG_REPO || fromEnvFile('BLOG_REPO');

// [source in the blog repo, destination name, import rewrites]
const files = [
  ['src/components/MarkdownRenderer.vue', 'MarkdownRenderer.vue', [
    ["'../utils/image'", "'./image'"],
    ["'../utils/cdn'", "'./cdn'"],
  ]],
  ['src/utils/image.ts', 'image.ts', []],
  ['src/utils/cdn.ts', 'cdn.ts', []],
];

if (!blogPath) {
  if (files.every(([, dest]) => existsSync(resolve(outDir, dest)))) {
    console.warn('sync-renderer: BLOG_REPO is not set, keeping the existing src/renderer/ copy.');
    process.exit(0);
  }
  console.error('sync-renderer: set BLOG_REPO (environment or .env.local) to a local checkout of the blog repository.');
  process.exit(1);
}

const blog = resolve(blogPath);
await mkdir(outDir, { recursive: true });

for (const [src, dest, rewrites] of files) {
  let text = await readFile(resolve(blog, src), 'utf8');
  for (const [from, to] of rewrites) {
    if (!text.includes(from)) throw new Error(`${src}: expected import ${from} not found`);
    text = text.replaceAll(from, to);
  }
  const note = `Synced from the blog repo (${src}) by scripts/sync-renderer.mjs. Do not edit here.`;
  await writeFile(resolve(outDir, dest), (dest.endsWith('.vue') ? `<!-- ${note} -->\n` : `// ${note}\n`) + text);
}
console.log(`sync-renderer: refreshed src/renderer/ from ${blog}`);
