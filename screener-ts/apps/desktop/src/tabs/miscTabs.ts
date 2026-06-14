import { screen, fetchMany, type ScreenRow } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num, pct, scoreColor, signalBadge, stageBadge } from '../ui/dom.js';
import { openStock } from '../ui/stockModal.js';
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { formDialog } from '../ui/forms.js';
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
        <input id="wl-symbol" class="field" style="flex:1" placeholder="Add symbol e.g. AMD" autocomplete="off" />
        <button id="wl-add" class="btn">${t('wl.add')}</button>
        <button id="wl-refresh" class="btn-outline">↻ Refresh quotes</button>
      </div>
    </div>
    <div id="wl-results"></div>`;

  void refreshAll(ctx);

  $('#wl-add')!.addEventListener('click', async () => {
    const input = $('#wl-symbol') as HTMLInputElement;
    const sym = input.value.trim().toUpperCase();
    if (!sym || !activeId) return;
    await saveItems(ctx, activeId, [...(await loadItems(ctx, activeId)), sym]);
    input.value = '';
    await refreshTabs(ctx);
    await refreshRows(ctx);
  });
  ($('#wl-symbol') as HTMLInputElement).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') ($('#wl-add') as HTMLButtonElement).click();
  });
  $('#wl-refresh')!.addEventListener('click', () => void refreshRows(ctx, true));
}

async function refreshAll(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  if (!activeId || !idx.some((w) => w.id === activeId)) activeId = idx[0]!.id;
  await refreshTabs(ctx);
  await refreshRows(ctx);
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
      await refreshRows(ctx);
    });
    tab.querySelector('[data-rename]')!.addEventListener('click', async (e) => {
      e.stopPropagation();
      const res = await formDialog('Rename watchlist', [{ key: 'name', label: 'Name', value: w.name }]);
      const name = res?.name?.trim();
      if (!name) return;
      await saveIndex(ctx, idx.map((x) => (x.id === w.id ? { ...x, name } : x)));
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
    });
    tabs.appendChild(tab);
  }
  const add = el(`<button class="range-btn" title="New watchlist">＋ New list</button>`);
  add.addEventListener('click', async () => {
    const res = await formDialog('New watchlist', [{ key: 'name', label: 'List name', placeholder: 'e.g. Semis' }]);
    const name = res?.name?.trim();
    if (!name) return;
    const id = newId();
    await saveIndex(ctx, [...idx, { id, name }]);
    activeId = id;
    await refreshAll(ctx);
  });
  tabs.appendChild(add);
}

// Cache scan rows per list so switching tabs is instant; refetch on Refresh.
const rowCache = new Map<string, ScreenRow[]>();

/** Render the active list as a one-row-per-stock quick-info table. */
async function refreshRows(ctx: AppContext, force = false): Promise<void> {
  const out = $('#wl-results')!;
  if (!activeId) {
    out.innerHTML = '';
    return;
  }
  const syms = await loadItems(ctx, activeId);
  if (!syms.length) {
    out.innerHTML = `<div class="card muted" style="text-align:center;padding:28px">No symbols yet — add some above.</div>`;
    return;
  }

  let rows = rowCache.get(activeId);
  if (!rows || force) {
    out.innerHTML = `<div class="muted" style="padding:10px"><span class="spinner"></span> ${t('msg.scanning')} ${syms.length}…</div>`;
    const data = await fetchMany(ctx.data, syms, '1y', 8);
    rows = [];
    for (const sym of syms) {
      const ohlcv = data.get(sym);
      if (ohlcv && ohlcv.bars.length >= 60) {
        rows.push(screen([ohlcv], { minScore: -1000, limit: 1 }).results[0]!);
      } else {
        // Keep the symbol visible even if data is missing/short.
        rows.push({ symbol: sym, stage: 0, stageLabel: 'INSUFFICIENT_DATA', price: 0, score: 0, signal: 'NO_SIGNAL',
          entryPrice: null, stopLoss: null, targetPrice: null, riskReward: null, pivotHigh: null,
          distanceToPivotPct: null, priceRangePct: null, atrContractionPct: null, volumeDryUpPct: null,
          vcpContractions: null, daysInBase: null } as ScreenRow);
      }
    }
    rowCache.set(activeId, rows);
  }
  renderRows(ctx, out, rows);
}

function renderRows(ctx: AppContext, out: HTMLElement, rows: ScreenRow[]): void {
  const card = el(`<div class="card" style="overflow-x:auto"></div>`);
  card.innerHTML = `
    <table><thead><tr>
      <th>Symbol</th><th>Price</th><th>Score</th><th>Signal</th><th>Stage</th>
      <th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Dist</th><th>VCP</th><th></th>
    </tr></thead><tbody>${rows
      .map(
        (r) => `<tr data-sym="${r.symbol}">
        <td><strong>${r.symbol}</strong></td>
        <td>${r.price ? '$' + num(r.price) : '—'}</td>
        <td><span class="scorebar" style="width:46px"><span style="width:${Math.max(0, r.score)}%;background:${scoreColor(r.score)}"></span></span> <span style="color:${scoreColor(r.score)};font-weight:700">${num(r.score, 0)}</span></td>
        <td>${signalBadge(r.signal)}</td>
        <td>${stageBadge(r.stage, r.stageLabel)}</td>
        <td>${r.entryPrice != null ? '$' + num(r.entryPrice) : '—'}</td>
        <td class="danger">${r.stopLoss != null ? '$' + num(r.stopLoss) : '—'}</td>
        <td class="accent">${r.targetPrice != null ? '$' + num(r.targetPrice) : '—'}</td>
        <td>${r.riskReward != null ? num(r.riskReward, 1) + 'R' : '—'}</td>
        <td>${r.distanceToPivotPct != null ? num(r.distanceToPivotPct, 1) + '%' : '—'}</td>
        <td>${r.vcpContractions ?? '—'}</td>
        <td><button class="icon-btn" data-del="${r.symbol}" title="Remove from list">✕</button></td>
      </tr>`,
      )
      .join('')}</tbody></table>`;

  card.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) =>
    tr.addEventListener('click', (e) => {
      const del = (e.target as HTMLElement).closest('[data-del]') as HTMLElement | null;
      if (del) {
        e.stopPropagation();
        void (async () => {
          await saveItems(ctx, activeId!, (await loadItems(ctx, activeId!)).filter((x) => x !== del.dataset.del));
          rowCache.delete(activeId!);
          await refreshTabs(ctx);
          await refreshRows(ctx);
        })();
      } else {
        void openStock(ctx, tr.dataset.sym!);
      }
    }),
  );
  out.innerHTML = '';
  out.appendChild(card);
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
