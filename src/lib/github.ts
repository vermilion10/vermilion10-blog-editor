// Minimal GitHub client: everything the editor needs goes through the REST and
// GraphQL APIs, so no git binary or local clone is required. That is what makes
// the same code work on Android.

export interface RepoConfig {
  owner: string;
  repo: string;
  branch: string;
  postsDir: string;
}

export interface RemoteFile {
  name: string;
  path: string;
  sha: string;
}

export interface CommitResult {
  oid: string;
  url: string;
}

export class GitHubError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const API = 'https://api.github.com';

function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

async function request(token: string, path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...init.headers,
    },
  });
  if (!res.ok) {
    let message = res.statusText;
    try { message = (await res.json()).message || message; } catch { /* not JSON */ }
    throw new GitHubError(res.status, message);
  }
  return res;
}

export async function getLogin(token: string): Promise<string> {
  const res = await request(token, '/user');
  return (await res.json()).login;
}

/** Throws unless the token can push to the configured repo. */
export async function checkRepoAccess(token: string, cfg: RepoConfig): Promise<void> {
  const res = await request(token, `/repos/${cfg.owner}/${cfg.repo}`);
  const data = await res.json();
  if (data.permissions && !data.permissions.push) {
    throw new GitHubError(403, `This token can read ${cfg.owner}/${cfg.repo} but cannot push to it.`);
  }
}

export async function listMarkdownFiles(token: string, cfg: RepoConfig): Promise<RemoteFile[]> {
  const res = await request(
    token,
    `/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(cfg.postsDir)}?ref=${encodeURIComponent(cfg.branch)}`,
  );
  const items = (await res.json()) as { type: string; name: string; path: string; sha: string }[];
  return items
    .filter((item) => item.type === 'file' && item.name.endsWith('.md'))
    .map(({ name, path, sha }) => ({ name, path, sha }));
}

// Blobs are addressed by content hash, so a cached one can never be stale.
const blobCache = new Map<string, string>();
const BLOB_CACHE_PREFIX = 'blob:';

export async function readBlob(token: string, cfg: RepoConfig, sha: string): Promise<string> {
  const hit = blobCache.get(sha) ?? safeGet(BLOB_CACHE_PREFIX + sha);
  if (hit != null) {
    blobCache.set(sha, hit);
    return hit;
  }
  const res = await request(token, `/repos/${cfg.owner}/${cfg.repo}/git/blobs/${sha}`, {
    headers: { Accept: 'application/vnd.github.raw+json' },
  });
  const text = await res.text();
  blobCache.set(sha, text);
  safeSet(BLOB_CACHE_PREFIX + sha, text);
  return text;
}

/** Current blob sha of a file on the branch, or null if it doesn't exist. */
export async function currentFileSha(token: string, cfg: RepoConfig, path: string): Promise<string | null> {
  try {
    const res = await request(
      token,
      `/repos/${cfg.owner}/${cfg.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(cfg.branch)}`,
    );
    return (await res.json()).sha;
  } catch (err) {
    if (err instanceof GitHubError && err.status === 404) return null;
    throw err;
  }
}

async function branchHead(token: string, cfg: RepoConfig): Promise<string> {
  const res = await request(token, `/repos/${cfg.owner}/${cfg.repo}/git/ref/heads/${encodePath(cfg.branch)}`);
  return (await res.json()).object.sha;
}

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

const CREATE_COMMIT = `
mutation ($input: CreateCommitOnBranchInput!) {
  createCommitOnBranch(input: $input) { commit { oid url } }
}`;

/**
 * One commit with any number of added/changed and deleted files. The caller
 * checks for per-file conflicts first; `expectedHeadOid` only guards against
 * the branch moving between that check and this call, so one retry on a moved
 * head is safe.
 */
export async function commitFiles(
  token: string,
  cfg: RepoConfig,
  message: string,
  additions: { path: string; content: string }[],
  deletions: string[] = [],
): Promise<CommitResult> {
  const [headline, ...rest] = message.trim().split('\n');
  const body = rest.join('\n').trim();

  const attempt = async () => {
    const input = {
      branch: { repositoryNameWithOwner: `${cfg.owner}/${cfg.repo}`, branchName: cfg.branch },
      message: body ? { headline, body } : { headline },
      expectedHeadOid: await branchHead(token, cfg),
      fileChanges: {
        additions: additions.map((a) => ({ path: a.path, contents: toBase64(a.content) })),
        deletions: deletions.map((path) => ({ path })),
      },
    };
    const res = await request(token, '/graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: CREATE_COMMIT, variables: { input } }),
    });
    const data = await res.json();
    if (data.errors?.length) {
      throw new GitHubError(422, data.errors.map((e: { message: string }) => e.message).join('; '));
    }
    return data.data.createCommitOnBranch.commit as CommitResult;
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof GitHubError && /expected.*(head|oid)/i.test(err.message)) return attempt();
    throw err;
  }
}

function safeGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function safeSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* cache is best effort */ }
}
