import { screen, fetchMany } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { resultsTable } from '../ui/resultsTable.js';
import { openStock } from '../ui/stockModal.js';
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { loadIndex, loadItems, saveItems, saveIndex, itemsKey, newId } from '../ui/watchlists.js';

let activeId: string | null = null;

export function renderWatchlist(ctx: AppContext): void {
  const root = $('#tab-watchlist')!;
  root.innerHTML = `
    <h1>${t('wl.title')}</h1>
    <p class="subtitle">${t('wl.sub')}</p>
    <div class="toolbar" id="wl-tabs"></div>
    <div class="card" style="margin-bottom:14px">
      <div class="row">
        <input id="wl-symbol" class="field" style="flex:1" placeholder="Add symbol e.g. AMD" />
        <button id="wl-add" class="btn">${t('wl.add')}</button>
        <button id="wl-screen" class="btn-outline">${t('wl.screenall')}</button>
      </div>
      <div id="wl-chips" class="row" style="margin-top:12px"></div>
    </div>
    <div id="wl-results"></div>`;

  void refreshAll(ctx);

  $('#wl-add')!.addEventListener('click', async () => {
    const input = $('#wl-symbol') as HTMLInputElement;
    const sym = input.value.trim().toUpperCase();
    if (!sym || !activeId) return;
    await saveItems(ctx, activeId, [...(await loadItems(ctx, activeId)), sym]);
    input.value = '';
    await refreshChips(ctx);
    await refreshTabs(ctx); // update count
  });
  ($('#wl-symbol') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ($('#wl-add') as HTMLButtonElement).click();
  });
  $('#wl-screen')!.addEventListener('click', async () => {
    const out = $('#wl-results')!;
    if (!activeId) return;
    const syms = await loadItems(ctx, activeId);
    if (!syms.length) return;
    out.innerHTML = `<div class="muted"><span class="spinner"></span> ${t('msg.scanning')}…</div>`;
    const data = await fetchMany(ctx.data, syms, '1y', 8);
    const res = screen([...data.values()], { minScore: 0, sortBy: 'score', limit: 200 });
    out.innerHTML = '';
    out.appendChild(resultsTable(res.results, (sym) => void openStock(ctx, sym)));
  });
}

async function refreshAll(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  if (!activeId || !idx.some((w) => w.id === activeId)) activeId = idx[0]!.id;
  await refreshTabs(ctx);
  await refreshChips(ctx);
}

async function refreshTabs(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  const tabs = $('#wl-tabs')!;
  tabs.innerHTML = '';
  for (const w of idx) {
    const count = (await loadItems(ctx, w.id)).length;
    const tab = el(
      `<span class="range-btn ${w.id === activeId ? 'active' : ''}" data-wl="${w.id}" style="display:inline-flex;gap:6px;align-items:center">
        <span data-open>${w.name}</span><span class="muted">${count}</span>
        <span data-rename title="Rename" style="cursor:pointer">✎</span>${
          idx.length > 1 ? `<span data-del title="Delete" style="cursor:pointer;color:var(--faint)">×</span>` : ''
        }</span>`,
    );
    tab.querySelector('[data-open]')!.addEventListener('click', async () => {
      activeId = w.id;
      await refreshTabs(ctx);
      await refreshChips(ctx);
      $('#wl-results')!.innerHTML = '';
    });
    tab.querySelector('[data-rename]')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      const name = prompt('Rename watchlist:', w.name);
      if (!name?.trim()) return;
      const next = idx.map((x) => (x.id === w.id ? { ...x, name: name.trim() } : x));
      await saveIndex(ctx, next);
      await refreshTabs(ctx);
    });
    tab.querySelector('[data-del]')?.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!confirm(`Delete watchlist "${w.name}"?`)) return;
      await ctx.storage.delete(itemsKey(w.id));
      const next = idx.filter((x) => x.id !== w.id);
      await saveIndex(ctx, next);
      if (activeId === w.id) activeId = next[0]?.id ?? null;
      await refreshAll(ctx);
      $('#wl-results')!.innerHTML = '';
    });
    tabs.appendChild(tab);
  }
  const add = el(`<button class="range-btn" title="New watchlist">＋ New list</button>`);
  add.addEventListener('click', async () => {
    const name = prompt('Name your new watchlist:', '');
    if (!name?.trim()) return;
    const id = newId();
    const next = [...idx, { id, name: name.trim() }];
    await saveIndex(ctx, next);
    activeId = id;
    await refreshAll(ctx);
    $('#wl-results')!.innerHTML = '';
  });
  tabs.appendChild(add);
}

async function refreshChips(ctx: AppContext): Promise<void> {
  const chips = $('#wl-chips')!;
  if (!activeId) {
    chips.innerHTML = '';
    return;
  }
  const syms = await loadItems(ctx, activeId);
  chips.innerHTML = syms.length
    ? syms
        .map(
          (s) =>
            `<span class="range-btn" data-sym="${s}">${s} <span data-del="${s}" style="color:var(--faint)">×</span></span>`,
        )
        .join('')
    : `<span class="muted">No symbols yet.</span>`;
  chips.querySelectorAll<HTMLElement>('[data-sym]').forEach((c) =>
    c.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).dataset.del;
      if (del) {
        void (async () => {
          await saveItems(ctx, activeId!, (await loadItems(ctx, activeId!)).filter((x) => x !== del));
          await refreshChips(ctx);
          await refreshTabs(ctx);
        })();
      } else void openStock(ctx, c.dataset.sym!);
    }),
  );
}

// ── Learn (full bilingual glossary, grouped) ────────────────────────────────────
export function renderLearn(): void {
  const root = $('#tab-learn')!;
  const lang = getLang();
  root.innerHTML = `<h1>${lang === 'vi' ? 'Tìm hiểu thuật ngữ' : 'Learn the Terminology'}</h1>
    <p class="subtitle">${lang === 'vi' ? 'Mọi chỉ số trong ứng dụng, giải thích dễ hiểu.' : 'Every metric in this app, explained in plain English.'}</p>`;
  for (const group of GLOSSARY_GROUPS) {
    const section = el(`<div style="margin-bottom:18px"></div>`);
    section.appendChild(
      el(
        `<h2 style="font-size:13px;text-transform:uppercase;letter-spacing:.04em;color:var(--accent);margin:0 0 8px">${
          group.title[lang] ?? group.title.en
        }</h2>`,
      ),
    );
    const grid = el(`<div class="grid grid-cards"></div>`);
    for (const key of group.keys) {
      const g = gloss(key);
      if (!g) continue;
      grid.appendChild(
        el(`<div class="card"><strong>${g.term}</strong><p class="muted" style="margin:6px 0 0;line-height:1.55">${g.long}</p></div>`),
      );
    }
    section.appendChild(grid);
    root.appendChild(section);
  }
}
