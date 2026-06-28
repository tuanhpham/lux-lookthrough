import { marked } from 'marked';
import {
  allPosts,
  saveUserPost,
  deleteUserPost,
  parseMarkdown,
  serializeMarkdown,
  slugify,
  type Post,
} from '../blog/posts.js';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';

let filterType: 'all' | 'daily' | 'weekly' | 'monthly' = 'all';

export function renderBlog(ctx: AppContext): void {
  const root = $('#tab-blog')!;
  root.innerHTML = `
    <div class="row" style="margin-bottom:4px">
      <h1 style="margin:0">Analysis</h1>
      <button id="post-new" class="btn" style="margin-left:auto">＋ New post</button>
    </div>
    <p class="subtitle">Market reports rendered from Markdown. Add your own — paste/write Markdown or import a .md file.</p>
    <div class="card muted" style="font-size:12px;line-height:1.6;padding:10px 12px;margin-bottom:10px">
      ℹ️ <b>Two kinds of posts.</b> Posts you create here are saved in <b>this browser only</b>
      (localStorage) — that is why a new post shows on your machine but not in another browser or
      the deployed site. To publish a post <b>everywhere</b>, open it in the editor, click
      <b>⬇ Download .md</b>, drop the file into <code>apps/desktop/posts/</code>, then commit &amp;
      redeploy. Bundled <code>posts/*.md</code> files appear for all visitors.
    </div>
    <div class="toolbar">
      ${(['all', 'daily', 'weekly', 'monthly'] as const)
        .map(
          (tp) =>
            `<button class="range-btn ${tp === filterType ? 'active' : ''}" data-ftype="${tp}">${tp[0]!.toUpperCase() + tp.slice(1)}</button>`,
        )
        .join('')}
    </div>
    <div id="blog-list"></div>`;

  root.querySelectorAll<HTMLElement>('[data-ftype]').forEach((b) =>
    b.addEventListener('click', () => {
      filterType = b.dataset.ftype as typeof filterType;
      renderBlog(ctx);
    }),
  );
  $('#post-new')!.addEventListener('click', () => openEditor(ctx, null));
  void renderList(ctx);
}

async function renderList(ctx: AppContext): Promise<void> {
  const list = $('#blog-list')!;
  const posts = (await allPosts(ctx.storage)).filter((p) => filterType === 'all' || p.type === filterType);
  if (!posts.length) {
    list.innerHTML = `<div class="card muted" style="text-align:center;padding:30px">No posts yet. Click <b>＋ New post</b> to add one.</div>`;
    return;
  }
  list.innerHTML = '';
  for (const p of posts) {
    const card = el(`
      <div class="post-card" style="cursor:pointer">
        <div class="row"><strong style="font-size:16px">${escapeHtml(p.title)}</strong>
          <span class="tag" style="margin-left:auto">${p.type}</span>
          ${p.status === 'draft' ? `<span class="tag" style="color:var(--warn)">draft</span>` : ''}
          ${p.editable ? `<button class="icon-btn" data-edit title="Edit">✎</button><button class="icon-btn" data-del title="Delete">✕</button>` : ''}
        </div>
        <div class="muted" style="font-size:12px;margin-top:4px">${p.date}${p.period_start ? ` · ${p.period_start} → ${p.period_end ?? ''}` : ''}${p.author ? ` · ${escapeHtml(p.author)}` : ''}</div>
        ${p.summary ? `<p class="muted" style="margin:8px 0 0;line-height:1.5">${escapeHtml(p.summary)}</p>` : ''}
      </div>`);
    card.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-edit]')) {
        e.stopPropagation();
        openEditor(ctx, p);
      } else if (target.closest('[data-del]')) {
        e.stopPropagation();
        void (async () => {
          if (!confirm(`Delete post "${p.title}"?`)) return;
          await deleteUserPost(ctx.storage, p.slug);
          await renderList(ctx);
        })();
      } else {
        openPost(p);
      }
    });
    list.appendChild(card);
  }
}

function openPost(p: Post): void {
  $('#modal')!.classList.remove('hidden');
  $('#modal-title')!.textContent = p.title;
  const html = marked.parse(p.body, { async: false }) as string;
  $('#modal-body')!.innerHTML = `<div class="prose">${html}</div>`;
}

// ── Editor: front-matter fields + Markdown body, with live preview + .md import ──
const TEMPLATE = `## 1. Market Overview

| Metric | Value |
|---|---|
| Breadth | |

## 2. Sector Rotation

## 3. Top Setups This Period

### TICKER
- **Signal:** · **Score:** · **Stage:**
- **Entry/Stop/Target/R:R:**
- Thesis:

## 4. Watchlist Carryover

## 5. Paper Trades Status Update

## 6. Lessons & Notes

## 7. Next Period Watching
`;

function openEditor(ctx: AppContext, existing: Post | null): void {
  const p: Post = existing ?? {
    title: '', type: 'weekly', date: new Date().toISOString().slice(0, 10),
    status: 'published', slug: '', body: TEMPLATE, editable: true,
  };
  const modal = $('#modal')!;
  modal.classList.remove('hidden');
  $('#modal-title')!.textContent = existing ? 'Edit post' : 'New post';
  $('#modal-body')!.innerHTML = `
    <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px">
      <div><label class="field-label">Title</label><input id="e-title" class="field" value="${escapeAttr(p.title)}" placeholder="Analysis — …" /></div>
      <div><label class="field-label">Type</label><select id="e-type" class="field">
        ${(['daily', 'weekly', 'monthly'] as const).map((tp) => `<option value="${tp}" ${p.type === tp ? 'selected' : ''}>${tp}</option>`).join('')}
      </select></div>
      <div><label class="field-label">Date</label><input id="e-date" class="field" type="date" value="${p.date}" /></div>
      <div><label class="field-label">Status</label><select id="e-status" class="field">
        <option value="published" ${p.status === 'published' ? 'selected' : ''}>published</option>
        <option value="draft" ${p.status === 'draft' ? 'selected' : ''}>draft</option>
      </select></div>
      <div><label class="field-label">Period start (optional)</label><input id="e-pstart" class="field" type="date" value="${p.period_start ?? ''}" /></div>
      <div><label class="field-label">Period end (optional)</label><input id="e-pend" class="field" type="date" value="${p.period_end ?? ''}" /></div>
    </div>
    <label class="field-label" style="margin-top:10px">Summary (optional)</label>
    <input id="e-summary" class="field" value="${escapeAttr(p.summary ?? '')}" />

    <div class="row" style="margin-top:12px">
      <label class="field-label" style="margin:0">Markdown</label>
      <button id="e-import" class="range-btn" style="margin-left:auto">⬆ Import .md</button>
      <button id="e-download" class="range-btn" title="Download as a .md file to drop into posts/ and deploy">⬇ Download .md</button>
      <button id="e-preview-toggle" class="range-btn">Toggle preview</button>
      <input id="e-file" type="file" accept=".md,.markdown,text/markdown" style="display:none" />
    </div>
    <div class="row" style="align-items:stretch;gap:10px;margin-top:6px">
      <textarea id="e-body" class="field" style="flex:1;min-height:280px;font-family:monospace;font-size:12px;line-height:1.5;resize:vertical">${escapeHtml(p.body)}</textarea>
      <div id="e-preview" class="prose card" style="flex:1;min-height:280px;overflow:auto;display:none"></div>
    </div>

    <div class="row" style="justify-content:flex-end;margin-top:14px;gap:8px">
      <button id="e-cancel" class="btn-outline">Cancel</button>
      <button id="e-save" class="btn">${existing ? 'Save changes' : 'Create post'}</button>
    </div>`;

  const body = $('#modal-body')!;
  const ta = body.querySelector<HTMLTextAreaElement>('#e-body')!;
  const preview = body.querySelector<HTMLElement>('#e-preview')!;
  const updatePreview = () => {
    preview.innerHTML = marked.parse(ta.value, { async: false }) as string;
  };

  body.querySelector('#e-preview-toggle')!.addEventListener('click', () => {
    const showing = preview.style.display !== 'none';
    preview.style.display = showing ? 'none' : 'block';
    if (!showing) updatePreview();
  });
  ta.addEventListener('input', () => {
    if (preview.style.display !== 'none') updatePreview();
  });

  // Import a .md file → fill the editor (front matter parsed into the fields).
  const fileInput = body.querySelector<HTMLInputElement>('#e-file')!;
  body.querySelector('#e-import')!.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    if (!f) return;
    const text = await f.text();
    const parsed = parseMarkdown(text, slugify(f.name.replace(/\.md$/, '')));
    if (!parsed) return;
    (body.querySelector('#e-title') as HTMLInputElement).value = parsed.title;
    (body.querySelector('#e-type') as HTMLSelectElement).value = parsed.type;
    (body.querySelector('#e-date') as HTMLInputElement).value = parsed.date;
    (body.querySelector('#e-status') as HTMLSelectElement).value = parsed.status;
    (body.querySelector('#e-summary') as HTMLInputElement).value = parsed.summary ?? '';
    if (parsed.period_start) (body.querySelector('#e-pstart') as HTMLInputElement).value = parsed.period_start;
    if (parsed.period_end) (body.querySelector('#e-pend') as HTMLInputElement).value = parsed.period_end;
    ta.value = parsed.body;
    if (preview.style.display !== 'none') updatePreview();
  });

  // Collect the current editor state into a Post object (shared by Save + Download).
  const collect = (): Post | null => {
    const title = (body.querySelector('#e-title') as HTMLInputElement).value.trim();
    if (!title) {
      alert('Please enter a title.');
      return null;
    }
    return {
      title,
      type: (body.querySelector('#e-type') as HTMLSelectElement).value as Post['type'],
      date: (body.querySelector('#e-date') as HTMLInputElement).value || p.date,
      status: (body.querySelector('#e-status') as HTMLSelectElement).value as Post['status'],
      period_start: (body.querySelector('#e-pstart') as HTMLInputElement).value || undefined,
      period_end: (body.querySelector('#e-pend') as HTMLInputElement).value || undefined,
      summary: (body.querySelector('#e-summary') as HTMLInputElement).value.trim() || undefined,
      author: p.author,
      // Keep the existing slug when editing; generate one for a new post.
      slug: existing ? p.slug : slugify(title),
      body: ta.value,
      editable: true,
    };
  };

  // Download the post as a deploy-ready .md file (drop into posts/ to publish everywhere).
  body.querySelector('#e-download')!.addEventListener('click', () => {
    const post = collect();
    if (!post) return;
    const md = serializeMarkdown(post);
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${post.slug}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  body.querySelector('#e-cancel')!.addEventListener('click', () => modal.classList.add('hidden'));
  body.querySelector('#e-save')!.addEventListener('click', async () => {
    const next = collect();
    if (!next) return;
    await saveUserPost(ctx.storage, next);
    modal.classList.add('hidden');
    renderBlog(ctx);
  });
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeAttr(s: string): string {
  return escapeHtml(s).replace(/"/g, '&quot;');
}
