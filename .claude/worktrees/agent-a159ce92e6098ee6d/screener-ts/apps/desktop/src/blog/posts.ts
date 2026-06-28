import yaml from 'js-yaml';
import type { Storage } from '@screener/core';

export interface PostFrontMatter {
  title: string;
  type: 'daily' | 'weekly' | 'monthly';
  date: string;
  period_start?: string;
  period_end?: string;
  tags?: string[];
  author?: string;
  summary?: string;
  status: 'draft' | 'published';
}

export interface Post extends PostFrontMatter {
  slug: string;
  body: string; // markdown without front matter
  /** true for user-created posts (editable/deletable); bundled .md are read-only. */
  editable?: boolean;
}

/**
 * Eagerly import every Markdown file in posts/ as raw text (Vite glob). Each
 * file has YAML front matter delimited by leading `---` fences. These are
 * read-only at runtime (they live in the source tree).
 */
const RAW = import.meta.glob('/posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

/** Parse a raw `.md` string (front matter + body) into a Post. */
export function parseMarkdown(raw: string, fallbackSlug = 'post'): Post | null {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!m) {
    // No front matter → treat the whole thing as the body with sane defaults.
    return {
      title: 'Untitled', type: 'weekly', date: new Date().toISOString().slice(0, 10),
      status: 'published', slug: fallbackSlug, body: raw.trim(),
    };
  }
  const fm = (yaml.load(m[1]!) ?? {}) as Partial<PostFrontMatter>;
  return {
    title: fm.title ?? 'Untitled',
    type: fm.type ?? 'weekly',
    date: fm.date ?? new Date().toISOString().slice(0, 10),
    period_start: fm.period_start,
    period_end: fm.period_end,
    tags: fm.tags,
    author: fm.author,
    summary: fm.summary,
    status: fm.status ?? 'published',
    slug: fallbackSlug,
    body: m[2]!.trim(),
  };
}

/**
 * Serialize a Post back into a `.md` string (YAML front matter + body). The
 * output is byte-compatible with the bundled posts in `posts/`, so a post
 * authored in the app can be downloaded and dropped into `posts/` to become a
 * permanent, deployed report (visible in every browser after a redeploy) —
 * unlike localStorage user posts, which live only in the browser that made them.
 */
export function serializeMarkdown(p: Post): string {
  const fm: Record<string, unknown> = {
    title: p.title,
    type: p.type,
    date: p.date,
  };
  if (p.period_start) fm.period_start = p.period_start;
  if (p.period_end) fm.period_end = p.period_end;
  if (p.tags?.length) fm.tags = p.tags;
  if (p.author) fm.author = p.author;
  if (p.summary) fm.summary = p.summary;
  fm.status = p.status;
  const front = yaml.dump(fm, { lineWidth: -1 }).trimEnd();
  return `---\n${front}\n---\n\n${p.body.trim()}\n`;
}

function bundledPosts(): Post[] {
  return Object.entries(RAW)
    .map(([path, raw]) => {
      const p = parseMarkdown(raw, path.split('/').pop()!.replace(/\.md$/, ''));
      return p;
    })
    .filter((p): p is Post => p !== null);
}

// ── User posts (stored in Storage, editable) ────────────────────────────────────
const INDEX_KEY = 'posts:index';
const postKey = (slug: string) => `post:${slug}`;

export function slugify(title: string): string {
  const base = title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'post';
  return `${new Date().toISOString().slice(0, 10)}-${base}`.slice(0, 80);
}

export async function userPosts(storage: Storage): Promise<Post[]> {
  const slugs = (await storage.get<string[]>(INDEX_KEY)) ?? [];
  const out: Post[] = [];
  for (const slug of slugs) {
    const p = await storage.get<Post>(postKey(slug));
    if (p) out.push({ ...p, editable: true });
  }
  return out;
}

export async function saveUserPost(storage: Storage, post: Post): Promise<void> {
  const slugs = (await storage.get<string[]>(INDEX_KEY)) ?? [];
  if (!slugs.includes(post.slug)) slugs.push(post.slug);
  await storage.set(INDEX_KEY, slugs);
  await storage.set(postKey(post.slug), { ...post, editable: true });
}

export async function deleteUserPost(storage: Storage, slug: string): Promise<void> {
  const slugs = ((await storage.get<string[]>(INDEX_KEY)) ?? []).filter((s) => s !== slug);
  await storage.set(INDEX_KEY, slugs);
  await storage.delete(postKey(slug));
}

/** All posts (bundled + user), published only, newest first. */
export async function allPosts(storage: Storage): Promise<Post[]> {
  const merged = [...bundledPosts(), ...(await userPosts(storage))];
  return merged
    .filter((p) => p.status === 'published' || p.editable) // show your own drafts
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
