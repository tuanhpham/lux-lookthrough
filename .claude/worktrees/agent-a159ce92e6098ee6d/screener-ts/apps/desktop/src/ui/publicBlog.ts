import { marked } from 'marked';
import { allPosts, type Post } from '../blog/posts.js';
import type { Storage } from '@screener/core';

/** Render public post-card grid into `container`. Reads bundled + user posts. */
export async function renderPublicBlog(container: HTMLElement, storage: Storage): Promise<void> {
  const posts = (await allPosts(storage)).filter((p) => p.status === 'published');
  if (!posts.length) {
    container.innerHTML = `<p class="muted" style="text-align:center;padding:40px 0">No posts yet.</p>`;
    return;
  }
  container.innerHTML = posts
    .map(
      (p) => `
    <article class="pub-card" data-slug="${p.slug}">
      <div class="pub-card-meta">
        <span class="pub-tag">${p.type}</span>
        <span class="pub-date">${p.date}</span>
      </div>
      <h3 class="pub-title">${escHtml(p.title)}</h3>
      ${p.summary ? `<p class="pub-summary">${escHtml(p.summary)}</p>` : ''}
    </article>`,
    )
    .join('');

  container.querySelectorAll<HTMLElement>('.pub-card').forEach((card) => {
    card.addEventListener('click', () => {
      const slug = card.dataset.slug!;
      const post = posts.find((p) => p.slug === slug);
      if (post) openPublicPost(post);
    });
  });
}

function openPublicPost(p: Post): void {
  const modal = document.getElementById('modal')!;
  const title = document.getElementById('modal-title')!;
  const body = document.getElementById('modal-body')!;
  title.textContent = p.title;
  const html = marked.parse(p.body, { async: false }) as string;
  body.innerHTML = `<div class="prose">${html}</div>`;
  modal.classList.remove('hidden');
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
