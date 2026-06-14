import { marked } from 'marked';
import { allPosts, postBySlug, type Post } from '../blog/posts.js';
import { $, el } from '../ui/dom.js';

let filterType: 'all' | 'daily' | 'weekly' | 'monthly' = 'all';

export function renderBlog(): void {
  const root = $('#tab-blog')!;
  root.innerHTML = `
    <h1>Weekly Analysis</h1>
    <p class="subtitle">Market reports rendered from Markdown. Newest first.</p>
    <div class="toolbar">
      ${(['all', 'daily', 'weekly', 'monthly'] as const)
        .map(
          (t) => `<button class="range-btn ${t === filterType ? 'active' : ''}" data-ftype="${t}">${t[0]!.toUpperCase() + t.slice(1)}</button>`,
        )
        .join('')}
    </div>
    <div id="blog-list"></div>`;

  root.querySelectorAll<HTMLElement>('[data-ftype]').forEach((b) =>
    b.addEventListener('click', () => {
      filterType = b.dataset.ftype as typeof filterType;
      renderBlog();
    }),
  );
  renderList();
}

function renderList(): void {
  const list = $('#blog-list')!;
  const posts = allPosts().filter((p) => filterType === 'all' || p.type === filterType);
  if (!posts.length) {
    list.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No posts yet. Add Markdown files under <code>posts/</code>.</div>`;
    return;
  }
  list.innerHTML = '';
  for (const p of posts) {
    const card = el(`
      <button class="post-card">
        <div class="row"><strong style="font-size:16px">${p.title}</strong>
          <span class="tag" style="margin-left:auto">${p.type}</span></div>
        <div class="muted" style="font-size:12px;margin-top:4px">${p.date}${p.period_start ? ` · ${p.period_start} → ${p.period_end ?? ''}` : ''}</div>
        ${p.summary ? `<p class="muted" style="margin:8px 0 0;line-height:1.5">${p.summary}</p>` : ''}
      </button>`);
    card.addEventListener('click', () => openPost(p));
    list.appendChild(card);
  }
}

function openPost(p: Post): void {
  $('#modal')!.classList.remove('hidden');
  $('#modal-title')!.textContent = p.title;
  const html = marked.parse(p.body, { async: false }) as string;
  $('#modal-body')!.innerHTML = `<div class="prose">${html}</div>`;
}

export { postBySlug };
