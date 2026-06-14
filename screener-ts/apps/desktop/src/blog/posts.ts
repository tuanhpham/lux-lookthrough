import yaml from 'js-yaml';

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
}

/**
 * Eagerly import every Markdown file in posts/ as raw text (Vite glob). Each
 * file has YAML front matter delimited by leading `---` fences.
 */
const RAW = import.meta.glob('/posts/*.md', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>;

function parse(path: string, raw: string): Post | null {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return null;
  const fm = yaml.load(m[1]!) as PostFrontMatter;
  const slug = path.split('/').pop()!.replace(/\.md$/, '');
  return { ...fm, slug, body: m[2]!.trim() };
}

export function allPosts(): Post[] {
  return Object.entries(RAW)
    .map(([path, raw]) => parse(path, raw))
    .filter((p): p is Post => p !== null)
    .filter((p) => p.status === 'published')
    .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
}

export function postBySlug(slug: string): Post | undefined {
  return allPosts().find((p) => p.slug === slug);
}
