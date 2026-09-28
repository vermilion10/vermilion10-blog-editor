import { computed, reactive, watch } from 'vue';
import {
  checkRepoAccess, commitFiles, currentFileSha, getLogin, GitHubError, listMarkdownFiles, readBlob,
  type CommitResult, type RepoConfig,
} from './github';
import { deleteSecret, getSecret, readJson, removeKey, setSecret, writeJson } from './platform';
import { newPostTemplate, parseFrontmatter, setField, todayIso, type FmValue } from './frontmatter';

export interface PostMeta {
  title: string;
  published: string;
  updated: string;
  lang: string;
  category: string;
  tags: string[];
  draft: boolean;
  encrypted: boolean;
}

export interface PostEntry {
  path: string;
  /** Blob sha on the branch; null for a new post that only exists locally. */
  sha: string | null;
  meta: PostMeta | null;
  hasLocalChanges: boolean;
}

export interface OpenDoc {
  path: string;
  /** Blob sha the edit started from; null when the file is new. */
  baseSha: string | null;
  baseContent: string;
  content: string;
}

interface Draft {
  content: string;
  baseSha: string | null;
  baseContent: string;
  savedAt: number;
}

const TOKEN_KEY = 'github-token';
const CONFIG_KEY = 'repo-config';

// The owner and repo can be pre-filled per machine through .env.local; the
// sign-in screen asks for them otherwise.
export const DEFAULT_CONFIG: RepoConfig = {
  owner: import.meta.env.VITE_DEFAULT_OWNER ?? '',
  repo: import.meta.env.VITE_DEFAULT_REPO ?? '',
  branch: 'main',
  postsDir: 'src/content/blog',
};

export const state = reactive({
  booting: true,
  token: '',
  login: '',
  authError: '',
  config: readJson<RepoConfig>(CONFIG_KEY, DEFAULT_CONFIG),
  posts: [] as PostEntry[],
  loadingPosts: false,
  postsError: '',
  doc: null as OpenDoc | null,
});

export const isDirty = computed(() => !!state.doc && state.doc.content !== state.doc.baseContent);
export const docMeta = computed(() => (state.doc ? parseFrontmatter(state.doc.content) : {}));

function draftKey(path: string): string {
  const { owner, repo, branch } = state.config;
  return `draft:${owner}/${repo}@${branch}:${path}`;
}

function draftPrefix(): string {
  const { owner, repo, branch } = state.config;
  return `draft:${owner}/${repo}@${branch}:`;
}

function localDraftPaths(): string[] {
  const prefix = draftPrefix();
  const out: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) out.push(key.slice(prefix.length));
    }
  } catch { /* storage blocked */ }
  return out;
}

function toMeta(fm: Record<string, FmValue>): PostMeta {
  const str = (v: FmValue | undefined) => (typeof v === 'string' ? v : '');
  return {
    title: str(fm.title) || 'Untitled',
    published: str(fm.published),
    updated: str(fm.updated),
    lang: str(fm.lang),
    category: str(fm.category),
    tags: Array.isArray(fm.tags) ? fm.tags : [],
    draft: fm.draft === true,
    encrypted: fm.encrypted === true,
  };
}

// --- Auth -----------------------------------------------------------------

export async function boot(): Promise<void> {
  try {
    const token = await getSecret(TOKEN_KEY);
    if (token) {
      state.token = token;
      try {
        state.login = await getLogin(token);
        void refreshPosts();
      } catch (err) {
        // Only a rejected token means signed out. Anything else (offline,
        // GitHub down) keeps the session; the post list shows the error and
        // its reload button retries.
        if (err instanceof GitHubError && err.status === 401) {
          state.token = '';
          state.authError = 'Your saved token was rejected by GitHub. It may have expired; sign in with a new one.';
        } else {
          state.postsError = `Could not reach GitHub: ${(err as Error).message}`;
        }
      }
    }
  } finally {
    state.booting = false;
  }
}

export async function signIn(token: string, config: RepoConfig): Promise<void> {
  const login = await getLogin(token);
  await checkRepoAccess(token, config);
  await setSecret(TOKEN_KEY, token);
  state.token = token;
  state.login = login;
  state.config = { ...config };
  writeJson(CONFIG_KEY, state.config);
  await refreshPosts();
}

export async function signOut(): Promise<void> {
  await deleteSecret(TOKEN_KEY);
  state.token = '';
  state.login = '';
  state.posts = [];
  state.doc = null;
}

export async function updateConfig(config: RepoConfig): Promise<void> {
  await checkRepoAccess(state.token, config);
  state.config = { ...config };
  writeJson(CONFIG_KEY, state.config);
  state.doc = null;
  await refreshPosts();
}

// --- Posts ----------------------------------------------------------------

export async function refreshPosts(): Promise<void> {
  state.loadingPosts = true;
  state.postsError = '';
  try {
    const files = await listMarkdownFiles(state.token, state.config);
    const drafts = new Set(localDraftPaths());
    const entries: PostEntry[] = files.map((f) => ({ path: f.path, sha: f.sha, meta: null, hasLocalChanges: drafts.delete(f.path) }));
    // Drafts left over are new posts that were never published.
    for (const path of drafts) {
      const draft = readJson<Draft | null>(draftKey(path), null);
      if (draft) entries.push({ path, sha: null, meta: toMeta(parseFrontmatter(draft.content)), hasLocalChanges: true });
    }
    state.posts = entries;

    // Titles and dates need the file contents. Blobs are cached by sha, so
    // after the first load this only fetches posts that changed.
    await Promise.all(entries.map(async (entry, i) => {
      if (!entry.sha) return;
      try {
        const text = await readBlob(state.token, state.config, entry.sha);
        state.posts[i].meta = toMeta(parseFrontmatter(text));
      } catch { /* leave the row with its file name */ }
    }));
  } catch (err) {
    state.postsError = (err as Error).message;
  } finally {
    state.loadingPosts = false;
  }
}

export const allTags = computed(() => {
  const counts = new Map<string, number>();
  for (const p of state.posts) for (const t of p.meta?.tags ?? []) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t);
});

export const allCategories = computed(() => {
  const set = new Set<string>();
  for (const p of state.posts) if (p.meta?.category) set.add(p.meta.category);
  return [...set].sort();
});

/** Opens a post. Returns true when a local draft was restored over it. */
export async function openPost(entry: PostEntry): Promise<boolean> {
  flushDraft();
  const draft = readJson<Draft | null>(draftKey(entry.path), null);
  if (!entry.sha) {
    if (!draft) throw new Error('This local draft no longer exists.');
    state.doc = { path: entry.path, baseSha: null, baseContent: draft.baseContent, content: draft.content };
    return true;
  }
  const remote = await readBlob(state.token, state.config, entry.sha);
  state.doc = { path: entry.path, baseSha: entry.sha, baseContent: remote, content: remote };
  if (draft && draft.content !== remote) {
    state.doc.content = draft.content;
    // A draft started from an older version keeps its own base, so publishing
    // it still sees the conflict with the newer remote file.
    state.doc.baseSha = draft.baseSha;
    state.doc.baseContent = draft.baseSha === entry.sha ? remote : draft.baseContent;
    return true;
  }
  return false;
}

export function createPost(slug: string, title: string, lang: string): void {
  const path = `${state.config.postsDir}/${slug}.md`;
  if (state.posts.some((p) => p.path === path)) throw new Error(`${slug}.md already exists.`);
  flushDraft();
  const content = newPostTemplate(title, lang);
  state.doc = { path, baseSha: null, baseContent: '', content };
  saveDraftNow();
  state.posts.push({ path, sha: null, meta: toMeta(parseFrontmatter(content)), hasLocalChanges: true });
}

export function setDocField(key: string, value: FmValue | undefined): void {
  if (!state.doc) return;
  state.doc.content = setField(state.doc.content, key, value);
}

export function discardLocalChanges(): void {
  if (!state.doc) return;
  removeKey(draftKey(state.doc.path));
  if (state.doc.baseSha === null) {
    const path = state.doc.path;
    state.posts = state.posts.filter((p) => p.path !== path);
    state.doc = null;
    return;
  }
  state.doc.content = state.doc.baseContent;
  const entry = state.posts.find((p) => p.path === state.doc!.path);
  if (entry) entry.hasLocalChanges = false;
}

// --- Drafts ---------------------------------------------------------------

function saveDraftNow(): void {
  const doc = state.doc;
  if (!doc) return;
  const entry = state.posts.find((p) => p.path === doc.path);
  if (doc.content === doc.baseContent && doc.baseSha !== null) {
    removeKey(draftKey(doc.path));
    if (entry) entry.hasLocalChanges = false;
    return;
  }
  writeJson(draftKey(doc.path), { content: doc.content, baseSha: doc.baseSha, baseContent: doc.baseContent, savedAt: Date.now() } satisfies Draft);
  if (entry) {
    entry.hasLocalChanges = true;
    if (!entry.sha) entry.meta = toMeta(parseFrontmatter(doc.content));
  }
}

let draftTimer: number | undefined;

export function flushDraft(): void {
  window.clearTimeout(draftTimer);
  saveDraftNow();
}

watch(() => state.doc?.content, () => {
  window.clearTimeout(draftTimer);
  draftTimer = window.setTimeout(saveDraftNow, 600);
});

// --- Publish --------------------------------------------------------------

export class ConflictError extends Error {}

export async function publish(message: string, opts: { bumpUpdated: boolean; force?: boolean }): Promise<CommitResult> {
  const doc = state.doc;
  if (!doc) throw new Error('No post is open.');
  if (opts.bumpUpdated) setDocField('updated', todayIso());

  const remoteSha = await currentFileSha(state.token, state.config, doc.path);
  if (!opts.force && remoteSha !== doc.baseSha) {
    throw new ConflictError(
      doc.baseSha === null
        ? `${doc.path} already exists on ${state.config.branch}. Publishing would overwrite it.`
        : remoteSha === null
          ? `${doc.path} was deleted on ${state.config.branch} since you opened it.`
          : `${doc.path} changed on ${state.config.branch} since you opened it. Publishing would overwrite those changes.`,
    );
  }

  const content = doc.content;
  const result = await commitFiles(state.token, state.config, message, [{ path: doc.path, content }]);

  // The new blob sha isn't in the commit response; fetch it so the next edit
  // has the right base.
  const newSha = await currentFileSha(state.token, state.config, doc.path);
  doc.baseSha = newSha;
  doc.baseContent = content;
  removeKey(draftKey(doc.path));
  const entry = state.posts.find((p) => p.path === doc.path);
  if (entry) {
    entry.sha = newSha;
    entry.hasLocalChanges = false;
    entry.meta = toMeta(parseFrontmatter(content));
  }
  return result;
}
