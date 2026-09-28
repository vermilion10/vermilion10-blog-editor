// Frontmatter read/write that matches the blog's own parser
// (src/utils/blog.ts in the blog repo): one `key: value` per line, strings in double
// quotes with no escaping, tag lists as JSON arrays, booleans bare.
//
// Edits rewrite only the line for the field that changed, so a post touched
// through the form produces the same one-line diff a hand edit would.

export type FmValue = string | string[] | boolean;

const FM_RE = /^---\r?\n(?:([\s\S]*?)\r?\n)?---[^\S\r\n]*(?:\r?\n|$)/;

export interface SplitDoc {
  /** Frontmatter lines without the `---` fences, or null when there is none. */
  frontmatter: string | null;
  body: string;
  eol: '\n' | '\r\n';
}

export function splitDoc(text: string): SplitDoc {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const match = text.match(FM_RE);
  if (!match) return { frontmatter: null, body: text, eol };
  return { frontmatter: match[1] ?? '', body: text.slice(match[0].length), eol };
}

function parseArray(raw: string): string[] {
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value.map(String);
  } catch { /* fall through to the blog's comma fallback */ }
  return raw
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map((t) => t.trim().replace(/^["']|["']$/g, ''))
    .filter(Boolean);
}

function parseValue(raw: string): FmValue {
  const value = raw.trim();
  if (value.startsWith('[')) return parseArray(value);
  if (value === 'true' || value === 'false') return value === 'true';
  const quoted = value.match(/^"(.*)"$|^'(.*)'$/);
  if (quoted) return quoted[1] ?? quoted[2] ?? '';
  // Bare value: drop a trailing ` # comment`.
  return value.replace(/\s+#.*$/, '');
}

export function parseFrontmatter(text: string): Record<string, FmValue> {
  const { frontmatter } = splitDoc(text);
  const out: Record<string, FmValue> = {};
  if (frontmatter == null) return out;
  for (const line of frontmatter.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][\w-]*)\s*:(.*)$/);
    if (m) out[m[1]] = parseValue(m[2]);
  }
  return out;
}

export function formatValue(value: FmValue): string {
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((v) => JSON.stringify(v)).join(', ')}]`;
  return `"${value.replace(/\r?\n/g, ' ')}"`;
}

function isEmpty(value: FmValue | undefined): boolean {
  return value === undefined || value === '' || (Array.isArray(value) && value.length === 0);
}

/**
 * Set (or with an empty value, remove) one frontmatter field and return the
 * new document. A document without frontmatter gets a block created for it.
 */
export function setField(text: string, key: string, value: FmValue | undefined): string {
  const { frontmatter, body, eol } = splitDoc(text);
  const lines = frontmatter == null || frontmatter === '' ? [] : frontmatter.split(/\r?\n/);
  const at = lines.findIndex((line) => new RegExp(`^${key}\\s*:`).test(line));

  if (isEmpty(value)) {
    if (at === -1) return text;
    lines.splice(at, 1);
  } else {
    const line = `${key}: ${formatValue(value!)}`;
    if (at === -1) lines.push(line);
    else if (lines[at] === line) return text;
    else lines[at] = line;
  }

  return `---${eol}${lines.join(eol)}${lines.length ? eol : ''}---${eol}${body}`;
}

export function todayIso(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '-')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export function newPostTemplate(title: string, lang: string): string {
  const today = todayIso();
  return [
    '---',
    `title: ${formatValue(title)}`,
    `published: ${formatValue(today)}`,
    `updated: ${formatValue(today)}`,
    `description: ""`,
    `tags: []`,
    `category: "General"`,
    `lang: ${formatValue(lang)}`,
    '---',
    '',
    '',
  ].join('\n');
}
