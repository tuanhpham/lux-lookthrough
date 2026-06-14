import { screen, fetchMany } from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el } from '../ui/dom.js';
import { resultsTable } from '../ui/resultsTable.js';
import { openStock } from '../ui/stockModal.js';

const WL_KEY = 'watchlist:default';

async function loadSymbols(ctx: AppContext): Promise<string[]> {
  return (await ctx.storage.get<string[]>(WL_KEY)) ?? [];
}
async function saveSymbols(ctx: AppContext, syms: string[]): Promise<void> {
  await ctx.storage.set(WL_KEY, [...new Set(syms)]);
}

export function renderWatchlist(ctx: AppContext): void {
  const root = $('#tab-watchlist')!;
  root.innerHTML = `
    <h1>Watchlist</h1>
    <p class="subtitle">Track symbols and screen them in one click. Stored locally.</p>
    <div class="card" style="margin-bottom:14px">
      <div class="row">
        <input id="wl-symbol" class="field" style="flex:1" placeholder="Add symbol e.g. AMD" />
        <button id="wl-add" class="btn">Add</button>
        <button id="wl-screen" class="btn-outline">Screen All</button>
      </div>
      <div id="wl-chips" class="row" style="margin-top:12px"></div>
    </div>
    <div id="wl-results"></div>`;

  const refreshChips = async () => {
    const syms = await loadSymbols(ctx);
    const chips = $('#wl-chips')!;
    chips.innerHTML = syms.length
      ? syms.map((s) => `<span class="range-btn" data-sym="${s}">${s} <span data-del="${s}" style="color:var(--faint)">×</span></span>`).join('')
      : `<span class="muted">No symbols yet.</span>`;
    chips.querySelectorAll<HTMLElement>('[data-sym]').forEach((c) =>
      c.addEventListener('click', (e) => {
        const del = (e.target as HTMLElement).dataset.del;
        if (del) {
          void (async () => {
            await saveSymbols(ctx, (await loadSymbols(ctx)).filter((x) => x !== del));
            await refreshChips();
          })();
        } else void openStock(ctx, c.dataset.sym!);
      }),
    );
  };

  $('#wl-add')!.addEventListener('click', async () => {
    const input = $('#wl-symbol') as HTMLInputElement;
    const sym = input.value.trim().toUpperCase();
    if (!sym) return;
    await saveSymbols(ctx, [...(await loadSymbols(ctx)), sym]);
    input.value = '';
    await refreshChips();
  });
  $('#wl-screen')!.addEventListener('click', async () => {
    const out = $('#wl-results')!;
    const syms = await loadSymbols(ctx);
    if (!syms.length) return;
    out.innerHTML = `<div class="muted"><span class="spinner"></span> Screening…</div>`;
    const data = await fetchMany(ctx.data, syms, '1y', 8);
    const res = screen([...data.values()], { minScore: 0, sortBy: 'score', limit: 200 });
    out.innerHTML = '';
    out.appendChild(resultsTable(res.results, (sym) => void openStock(ctx, sym)));
  });

  void refreshChips();
}

const GLOSSARY: { term: string; body: string }[] = [
  { term: 'Conviction Score (0–100)', body: 'Blends Weinstein stage, ATR contraction, range tightness, volume dry-up, VCP count, and pivot proximity. 70+ high, 40–69 developing, <40 weak.' },
  { term: 'Signal', body: 'BREAKOUT_IMMINENT: score ≥ 70 within 3% of pivot. CONSOLIDATING: score ≥ 40. NO_SIGNAL otherwise.' },
  { term: 'Weinstein Stage', body: 'Stage 1 basing, Stage 2 advancing (buy zone), Stage 3 topping, Stage 4 declining — classified via simple moving averages of close.' },
  { term: 'VCP', body: 'Volatility Contraction Pattern: successively tighter, quieter pullbacks. 3+ contractions is textbook.' },
  { term: 'R:R', body: 'Reward ÷ risk. Default target is 3R (entry + 3×(entry−stop)); stop is 1.5×ATR below entry.' },
  { term: 'R-multiple (portfolio)', body: 'Trade PnL ÷ initial per-share risk, where risk = entry − stop. +2R means you made twice what you risked.' },
];

export function renderLearn(): void {
  const root = $('#tab-learn')!;
  root.innerHTML = `<h1>Learn the Terminology</h1><p class="subtitle">Every metric, in plain English.</p>`;
  const grid = el(`<div class="grid grid-cards"></div>`);
  for (const g of GLOSSARY) {
    grid.appendChild(el(`<div class="card"><strong>${g.term}</strong><p class="muted" style="margin:6px 0 0;line-height:1.55">${g.body}</p></div>`));
  }
  root.appendChild(grid);
}
