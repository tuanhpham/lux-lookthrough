import {
  scanQm, qmToRow, fetchMany, buildTradePlan, explainPlan, computeCash,
  type QmRow, type QmScanResult, type AccountState, type Bar,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { $, el, num } from '../ui/dom.js';
import { openStock } from '../ui/stockModal.js';
import { qmTable, type QmSortKey } from '../ui/qmTable.js';
import { t, getLang } from '../ui/i18n.js';
import { GLOSSARY_GROUPS, gloss } from '../ui/glossary.js';
import { formDialog } from '../ui/forms.js';
import { sanitizeNoteHtml, richNoteDialog, isNoteEmpty } from '../ui/richNote.js';
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
        <button id="wl-refresh" class="btn-outline">↻ ${t('wl.refresh')}</button>
        <button id="wl-plan" class="btn-outline">📋 ${t('wl.plan')}</button>
        <button id="wl-export" class="btn-outline" title="${t('wl.export.tip')}">⬇ ${t('wl.export')}</button>
        <button id="wl-import" class="btn-outline" title="${t('wl.import.tip')}">⬆ ${t('wl.import')}</button>
        <input id="wl-import-file" type="file" accept="application/json,.json" style="display:none" />
      </div>
    </div>
    <div id="wl-plan-panel"></div>
    <div id="wl-results"></div>`;

  void refreshAll(ctx);

  $('#wl-export')!.addEventListener('click', () => void exportWatchlists(ctx));
  const importFile = $('#wl-import-file') as HTMLInputElement;
  $('#wl-import')!.addEventListener('click', () => importFile.click());
  importFile.addEventListener('change', () => void importWatchlists(ctx, importFile));

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
  $('#wl-plan')!.addEventListener('click', () => void renderTradePlanner(ctx));
}

async function refreshAll(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  if (!activeId || !idx.some((w) => w.id === activeId)) activeId = idx[0]!.id;
  await refreshTabs(ctx);
  await refreshRows(ctx);
}

// ── Export / Import ─────────────────────────────────────────────────────────
// Watchlists live in per-origin storage (localStorage on web), so they don't
// survive switching to a different URL/origin. These let you back them up to a
// JSON file and restore them on any origin or device.

interface WatchlistBackup {
  type: 'screener-watchlists';
  version: 1;
  exportedAt: string;
  lists: { id: string; name: string; symbols: string[] }[];
}

async function exportWatchlists(ctx: AppContext): Promise<void> {
  const idx = await loadIndex(ctx);
  const lists = [];
  for (const w of idx) lists.push({ id: w.id, name: w.name, symbols: await loadItems(ctx, w.id) });
  const backup: WatchlistBackup = {
    type: 'screener-watchlists',
    version: 1,
    exportedAt: new Date().toISOString(),
    lists,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `watchlists-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importWatchlists(ctx: AppContext, input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  input.value = ''; // allow re-importing the same file later
  if (!file) return;
  let backup: WatchlistBackup;
  try {
    backup = JSON.parse(await file.text()) as WatchlistBackup;
  } catch {
    alert('Could not read that file — it is not valid JSON.');
    return;
  }
  if (backup?.type !== 'screener-watchlists' || !Array.isArray(backup.lists)) {
    alert('That file is not a watchlist backup.');
    return;
  }

  const existing = await loadIndex(ctx);
  const merge = existing.length
    ? confirm(
        `Import ${backup.lists.length} watchlist(s)?\n\nOK = merge into your current lists (symbols combined).\nCancel = keep current lists unchanged.`,
      )
    : true;
  if (!merge) return;

  const byName = new Map(existing.map((w) => [w.name.toLowerCase(), w]));
  for (const imported of backup.lists) {
    const symbols = (imported.symbols ?? []).map((s) => String(s).toUpperCase());
    const match = byName.get(String(imported.name).toLowerCase());
    if (match) {
      // Merge symbols into the existing same-named list (saveItems de-dups).
      await saveItems(ctx, match.id, [...(await loadItems(ctx, match.id)), ...symbols]);
    } else {
      const id = newId();
      await saveIndex(ctx, [...(await loadIndex(ctx)), { id, name: imported.name || 'Imported' }]);
      await saveItems(ctx, id, symbols);
    }
  }
  rowCache.clear();
  await refreshAll(ctx);
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

// Cache scan rows per list so switching tabs is instant. Each entry remembers
// the symbol set it was built for, so a change (e.g. a stock added from the
// detail modal) is detected and the rows refetched automatically.
const rowCache = new Map<string, { syms: string[]; rows: QmRow[] }>();
let wlSort: { key: QmSortKey; desc: boolean } = { key: 'qualityScore', desc: true };

/** Render the active list as a sortable one-row-per-stock quick-info table. */
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

  const cached = rowCache.get(activeId);
  // Refetch when forced, when nothing cached, or when the symbol set changed
  // (e.g. a stock was just added/removed from the detail modal).
  const stale = !cached || cached.syms.join(',') !== syms.join(',');
  let rows = cached?.rows;
  if (stale || force) {
    out.innerHTML = `<div class="muted" style="padding:10px"><span class="spinner"></span> ${t('msg.scanning')} ${syms.length}…</div>`;
    const data = await fetchMany(ctx.data, syms, '1y', 8);
    rows = [];
    for (const sym of syms) {
      const ohlcv = data.get(sym);
      if (ohlcv && ohlcv.bars.length >= 60) {
        rows.push(qmToRow(scanQm(sym, ohlcv.bars)));
      } else {
        // Keep the symbol visible even if data is missing/short.
        rows.push({
          symbol: sym, price: 0, qualityScore: 0, setupType: 'NONE',
          previousAdvancePct: null, vcpContractions: null, atrContractionPct: null,
          volumeContractionPct: null, pivot: null, entryPrice: null, stopLoss: null,
          riskPct: null, relativeStrength: null, gapPct: null, catalyst: null,
        } as QmRow);
      }
    }
    rowCache.set(activeId, { syms: [...syms], rows });
  }

  out.innerHTML = '';
  out.appendChild(
    qmTable(rows!, {
      sortKey: wlSort.key,
      sortDesc: wlSort.desc,
      onRowClick: (sym) => void openStock(ctx, sym),
      onSortChange: (key, desc) => {
        wlSort = { key, desc };
      },
      action: {
        header: '',
        html: (r) => `<button class="icon-btn" data-row-action data-del="${r.symbol}" title="Remove from list">✕</button>`,
      },
    }),
  );

  // Wire the remove buttons (the table forwards row clicks but leaves actions to us).
  out.querySelectorAll<HTMLElement>('[data-del]').forEach((b) =>
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      const sym = b.dataset.del!;
      await saveItems(ctx, activeId!, (await loadItems(ctx, activeId!)).filter((x) => x !== sym));
      rowCache.delete(activeId!);
      await refreshTabs(ctx);
      await refreshRows(ctx);
    }),
  );
}

// ── Trade Planner ───────────────────────────────────────────────────────────────
/**
 * Scan the active watchlist with `scanQm` + `buildTradePlan` and display a
 * position-sizing card for every actionable setup. Also runs `explainPlan` so
 * the user can read why each stock passed or failed. Shown in the #wl-plan-panel
 * div (above the watchlist table); dismissed when the user closes it.
 */
async function renderTradePlanner(ctx: AppContext): Promise<void> {
  const panel = $('#wl-plan-panel')!;
  if (!activeId) { panel.innerHTML = ''; return; }

  // Latest EURUSD rate (shared with the Portfolio tab's cache) so we can convert
  // EUR account cash → USD for sizing and offer a €/$ display toggle.
  const fxBars = (await ctx.storage.get<Bar[]>('pf_eurusd_bars')) ?? [];
  if (fxBars.length) planEurUsd = fxBars[fxBars.length - 1]!.close || 1;

  // Portfolio accounts → pick one to size against (uses its live cash). Account
  // cash is in the account currency; convert EUR → USD so sizing matches the
  // USD stock prices. Falls back to a manual figure when no account is chosen.
  const pfAccounts = (await ctx.storage.get<AccountState[]>('accounts')) ?? [];
  const prevEquity = Number((document.getElementById('tp-equity') as HTMLInputElement | null)?.value);
  const equity = Number.isFinite(prevEquity) && prevEquity > 0 ? prevEquity : 100_000;

  const acctOpts = pfAccounts
    .map((a) => {
      const cashBase = computeCash(a);
      const cashUsd = Math.round(a.account.currency === 'EUR' && planEurUsd > 1 ? cashBase * planEurUsd : cashBase);
      const label = a.account.currency === 'EUR'
        ? `${a.account.name} — €${Math.round(cashBase).toLocaleString()}`
        : `${a.account.name} — $${cashUsd.toLocaleString()}`;
      return `<option value="${a.account.id}" data-cash="${cashUsd}">${label}</option>`;
    })
    .join('');

  panel.innerHTML = `
    <div class="card" style="margin-bottom:14px;position:relative">
      <button id="tp-close" style="position:absolute;top:10px;right:12px;background:0;border:0;color:var(--faint);font-size:18px;cursor:pointer">×</button>
      <div class="section-title" style="margin-top:0">📋 ${t('wl.plan.title')}</div>
      <div class="tp-controls">
        ${acctOpts ? `<div class="tp-ctl">
          <label class="field-label">${t('wl.plan.useacct')}</label>
          <select id="tp-acct" class="field pf-acct-select tp-acct-select">
            <option value="">${t('wl.plan.manualeq')}</option>
            ${acctOpts}
          </select>
        </div>` : ''}
        <div class="tp-ctl">
          <label class="field-label">${t('wl.plan.equity')} (USD)</label>
          <input id="tp-equity" class="field" type="number" value="${equity}" step="10000" />
        </div>
        <button id="tp-ccy" class="btn-outline tp-ctl-btn" title="Toggle display currency">${planSym()} ${planCcy}</button>
        <button id="tp-refresh" class="btn-outline tp-ctl-btn">${t('wl.plan.run')}</button>
      </div>
      <div id="tp-results"><div class="muted"><span class="spinner"></span> ${t('msg.scanning')}…</div></div>
    </div>`;

  document.getElementById('tp-close')!.addEventListener('click', () => { panel.innerHTML = ''; });
  document.getElementById('tp-refresh')!.addEventListener('click', () => void computePlans(ctx));

  // Currency toggle — display-only; recompute derived blocks in the new currency.
  document.getElementById('tp-ccy')!.addEventListener('click', () => {
    planCcy = planCcy === 'USD' ? 'EUR' : 'USD';
    void computePlans(ctx);
  });

  // Selecting an account fills the equity box with its (USD) cash and re-plans.
  const acctSel = document.getElementById('tp-acct') as HTMLSelectElement | null;
  acctSel?.addEventListener('change', () => {
    const opt = acctSel.selectedOptions[0];
    const cash = Number(opt?.dataset.cash);
    if (cash > 0) {
      (document.getElementById('tp-equity') as HTMLInputElement).value = String(cash);
      void computePlans(ctx);
    }
  });

  await computePlans(ctx);
}

async function computePlans(ctx: AppContext): Promise<void> {
  const panel = $('#wl-plan-panel')!;
  const out = document.getElementById('tp-results')!;
  if (!activeId || !out) return;

  const eq = Number((document.getElementById('tp-equity') as HTMLInputElement | null)?.value) || 100_000;

  out.innerHTML = `<div class="muted"><span class="spinner"></span> ${t('msg.scanning')}…</div>`;
  const syms = await loadItems(ctx, activeId);
  if (!syms.length) { out.innerHTML = `<p class="muted">${t('wl.empty')}</p>`; return; }

  const data = await fetchMany(ctx.data, syms, '1y', 6);
  const scans: QmScanResult[] = [];
  for (const sym of syms) {
    const d = data.get(sym);
    if (d && d.bars.length >= 60) scans.push(scanQm(sym, d.bars));
  }

  // Levels/quality come from buildTradePlan; sizing defaults to DEFAULT_SIZE_PCT
  // of equity (shares recomputed per-card in recalcPlan).
  const plans = scans
    .map((s) => ({ scan: s, plan: buildTradePlan(s, { equity: eq, riskPctPerTrade: 1 }) }))
    .sort((a, b) => b.plan.qualityScore - a.plan.qualityScore);

  if (!plans.length) { out.innerHTML = `<p class="muted">${t('wl.empty')}</p>`; return; }

  // Drop edit state for symbols no longer in the plan (keep edits for the rest).
  const liveSyms = new Set(plans.map((p) => p.plan.symbol));
  for (const key of [...planEdits.keys()]) if (!liveSyms.has(key)) planEdits.delete(key);

  const lang = getLang();
  const rows = plans.map(({ scan, plan }) => {
    const explanation = explainPlan(scan);

    // Default note = the planner's own narrative as FORMATTED HTML (bold
    // headline + green "passed" bullets + red "failed" bullets), so the note
    // keeps the explanation block's formatting and stays richly editable.
    const esc = (s: string): string => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
    const passedLis = explanation.passed.map((p) => `<li>${esc(p[lang])}</li>`).join('');
    const failedLis = explanation.failed.map((f) => `<li><span style="color:#ff5266">${esc(f[lang])}</span></li>`).join('');
    const defaultNote = sanitizeNoteHtml(
      `<h3>${esc(explanation.headline[lang])}</h3><ul>${passedLis}${failedLis}</ul>`,
    );

    // Seed the editable state once per symbol; keep any prior user edits.
    const prev = planEdits.get(plan.symbol);
    const edit: PlanEdit = prev ?? {
      entry: plan.entry ?? null,
      stop: plan.stop ?? null,
      target: plan.target ?? null,
      shares: plan.shares || 0,
      sizeMode: 'pct',           // default: size by % of equity
      sizePct: DEFAULT_SIZE_PCT,
      note: defaultNote,
    };
    planEdits.set(plan.symbol, edit);
    const actionColor = plan.actionable ? 'var(--accent)' : 'var(--faint)';
    const S = plan.symbol;
    const activePreset = edit.sizeMode === 'pct' ? edit.sizePct : null;
    const sizeChips = SIZE_PRESETS.map((p) =>
      `<button type="button" class="tp-size-chip${p === activePreset ? ' active' : ''}" data-tp-size="${S}" data-pct="${p}">${p}%</button>`,
    ).join('');
    // Show a non-preset % (e.g. custom) in the custom box.
    const customVal = edit.sizeMode === 'pct' && edit.sizePct != null && !SIZE_PRESETS.includes(edit.sizePct)
      ? edit.sizePct : '';
    return `
      <div class="card tp-card" data-tp-card="${S}" style="margin-bottom:10px;border-color:${plan.actionable ? 'var(--accent-line)' : 'var(--border)'}">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <strong style="font-size:15px">${S}</strong>
          <span class="badge" style="background:var(--surface);border-color:${actionColor};color:${actionColor}">
            ${plan.actionable ? t('wl.plan.actionable') : t('wl.plan.nosetup')} · Q ${plan.qualityScore.toFixed(0)}/100
          </span>
        </div>

        <div class="tp-fields">
          <label class="tp-field"><span>${t('wl.plan.entry')}</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="entry" data-sym="${S}" value="${edit.entry ?? ''}" /></label>
          <label class="tp-field"><span style="color:var(--danger)">${t('wl.plan.stop')}</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="stop" data-sym="${S}" value="${edit.stop ?? ''}" /></label>
          <label class="tp-field"><span style="color:var(--accent)">${t('wl.plan.target')}</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp="target" data-sym="${S}" value="${edit.target ?? ''}" /></label>
          <label class="tp-field"><span>${t('wl.plan.shares')}</span>
            <input class="field" type="number" step="1" inputmode="numeric" data-tp="shares" data-sym="${S}" value="${edit.shares || ''}" /></label>
        </div>

        <div class="tp-size-row">
          <span class="tp-size-label">${t('wl.plan.possize')}</span>
          ${sizeChips}
          <span class="tp-size-custom">
            <span class="tp-size-customlabel">${t('wl.plan.custom')}:</span>
            <input class="field" type="number" step="any" inputmode="decimal" data-tp-sizeinput="${S}" placeholder="%" style="width:64px" value="${customVal}" /><span>%</span>
          </span>
        </div>

        <div class="tp-derived" data-tp-derived="${S}"><!-- filled by recalcPlan --></div>

        <div class="tp-note-head">
          <span class="tp-note-label">${t('wl.plan.note')}</span>
          <button type="button" class="note-btn has-note" data-tp-noteedit="${S}" title="${t('pf.note.edit')}"><svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M11.5 2.5l2 2L6 12l-3 1 1-3 7.5-7.5z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>
        <div class="tp-note note-html" data-tp-note="${S}">${edit.note ?? ''}</div>
      </div>`;
  });

  out.innerHTML = rows.join('');

  // Recompute every card's derived stats from its current edit state.
  for (const { plan } of plans) recalcPlan(plan.symbol, eq);
  wirePlanEdits(out, eq);
}

/** Editable per-symbol planner state (ephemeral — lives while the panel is open). */
interface PlanEdit {
  entry: number | null;
  stop: number | null;
  target: number | null;
  shares: number;
  /** 'risk' sizes shares from risk %/trade; 'pct' sizes from a % of equity. */
  sizeMode: 'risk' | 'pct';
  sizePct: number | null;
  note: string;
}
const planEdits = new Map<string, PlanEdit>();
const SIZE_PRESETS = [3.5, 5, 7.5, 10, 12.5, 15, 17.25, 20];
const DEFAULT_SIZE_PCT = 3.5;

// Trade-planner display currency. Stock levels are in USD; toggling to EUR only
// converts the displayed dollar amounts (equity, position $, risk $) via the
// latest EURUSD rate. Percentages are currency-agnostic.
let planCcy: 'USD' | 'EUR' = 'USD';
let planEurUsd = 1; // 1 EUR = planEurUsd USD (latest cached rate)
const planSym = (): string => (planCcy === 'EUR' ? '€' : '$');
/** Convert a USD amount to the current display currency. */
const planConv = (usd: number): number => (planCcy === 'EUR' && planEurUsd > 1 ? usd / planEurUsd : usd);

/** Recompute shares (when sizing by %) and all derived risk/position stats,
 * then repaint just this card's derived block. Pure DOM update — no re-scan. */
function recalcPlan(symbol: string, equity: number): void {
  const e = planEdits.get(symbol);
  const box = document.querySelector<HTMLElement>(`[data-tp-derived="${CSS.escape(symbol)}"]`);
  if (!e || !box) return;

  const entry = e.entry ?? 0;
  const stop = e.stop ?? 0;
  const riskPerShare = entry > 0 && stop > 0 ? entry - stop : 0;

  // When sizing by % of equity, derive shares from that; else keep the shares
  // field (which itself was seeded from risk-based sizing).
  if (e.sizeMode === 'pct' && e.sizePct != null && entry > 0) {
    e.shares = Math.round((equity * e.sizePct) / 100 / entry);
    const sharesInput = document.querySelector<HTMLInputElement>(`input[data-tp="shares"][data-sym="${CSS.escape(symbol)}"]`);
    if (sharesInput && document.activeElement !== sharesInput) sharesInput.value = String(e.shares || '');
  }

  const shares = Math.max(0, Math.round(e.shares || 0));
  const positionValue = shares * entry;
  const positionPct = equity > 0 ? (positionValue / equity) * 100 : 0;
  const riskAmount = shares * Math.max(0, riskPerShare);
  const riskPctOfPos = positionValue > 0 ? (riskAmount / positionValue) * 100 : 0;
  const riskPctOfEq = equity > 0 ? (riskAmount / equity) * 100 : 0;
  const rr = riskPerShare > 0 && e.target != null && e.target > entry
    ? (e.target - entry) / riskPerShare : null;

  const sym = planSym();
  box.innerHTML = `
    <div class="grid" style="grid-template-columns:repeat(3,1fr);gap:8px">
      <div class="stat"><div class="k">${t('wl.plan.posval')}</div><div class="v">${sym}${num(planConv(positionValue), 0)} <span class="muted" style="font-size:11px">(${num(positionPct, 1)}%)</span></div></div>
      <div class="stat"><div class="k">${t('wl.plan.riskpos')}</div><div class="v" style="color:var(--warn)">${sym}${num(planConv(riskAmount), 0)} <span class="muted" style="font-size:11px">(${num(riskPctOfPos, 1)}%)</span></div></div>
      <div class="stat"><div class="k">${t('wl.plan.riskeq')}</div><div class="v" style="color:var(--warn)">${num(riskPctOfEq, 2)}%</div></div>
      <div class="stat"><div class="k">R:R</div><div class="v">${rr != null ? num(rr, 2) + ':1' : '—'}</div></div>
    </div>`;
}

/** Wire input/blur/click handlers for every editable planner card. */
function wirePlanEdits(root: HTMLElement, equity: number): void {
  // Field inputs (entry/stop/target/shares).
  root.querySelectorAll<HTMLInputElement>('input[data-tp][data-sym]').forEach((el2) => {
    el2.addEventListener('input', () => {
      const sym = el2.dataset.sym!;
      const e = planEdits.get(sym);
      if (!e) return;
      const key = el2.dataset.tp as keyof PlanEdit;
      if (key === 'shares') { e.shares = Number(el2.value) || 0; e.sizeMode = 'risk'; recalcPlan(sym, equity); return; }
      // entry / stop / target — numeric, blank → null.
      const v = el2.value.trim();
      (e as unknown as Record<string, number | null>)[key] = v === '' ? null : Number(v.replace(',', '.'));
      recalcPlan(sym, equity);
    });
  });

  // Rich-text note — open the formatting editor; save back the HTML.
  root.querySelectorAll<HTMLElement>('[data-tp-noteedit]').forEach((b) => {
    b.addEventListener('click', async () => {
      const sym = b.dataset.tpNoteedit!;
      const e = planEdits.get(sym);
      if (!e) return;
      const res = await richNoteDialog(`${sym} · ${t('wl.plan.note')}`, e.note ?? '', { lang: getLang() === 'vi' ? 'vi' : 'en' });
      if (res === null) return;
      e.note = res;
      const box = root.querySelector<HTMLElement>(`[data-tp-note="${CSS.escape(sym)}"]`);
      if (box) box.innerHTML = isNoteEmpty(res) ? `<span class="muted">${t('wl.plan.noteph')}</span>` : sanitizeNoteHtml(res);
    });
  });

  // Preset size chips.
  root.querySelectorAll<HTMLElement>('[data-tp-size]').forEach((b) => {
    b.addEventListener('click', () => {
      const sym = b.dataset.tpSize!;
      const pct = Number(b.dataset.pct);
      const e = planEdits.get(sym);
      if (!e) return;
      e.sizeMode = 'pct'; e.sizePct = pct;
      // Reflect selection: highlight the active chip, clear the custom box.
      const card = b.closest('.tp-card')!;
      card.querySelectorAll('[data-tp-size]').forEach((x) => x.classList.toggle('active', x === b));
      const custom = card.querySelector<HTMLInputElement>('[data-tp-sizeinput]');
      if (custom) custom.value = '';
      recalcPlan(sym, equity);
    });
  });

  // Custom size % input.
  root.querySelectorAll<HTMLInputElement>('[data-tp-sizeinput]').forEach((inp) => {
    inp.addEventListener('input', () => {
      const sym = inp.dataset.tpSizeinput!;
      const e = planEdits.get(sym);
      if (!e) return;
      const v = inp.value.trim();
      if (v === '') { return; }
      e.sizeMode = 'pct'; e.sizePct = Number(v.replace(',', '.')) || 0;
      inp.closest('.tp-card')!.querySelectorAll('[data-tp-size]').forEach((x) => x.classList.remove('active'));
      recalcPlan(sym, equity);
    });
  });
}

// ── Learn (full bilingual glossary, grouped) ────────────────────────────────────
/**
 * "How the system works" explainer for the Learn page. Mirrors the QM Quality
 * Score (packages/core/src/qm) and the Momentum engine + regime + sector
 * rotation (packages/core/src/momentum) so users understand what the scans
 * measure and why a name does or doesn't surface.
 */
function scoreExplainerHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';

  // ── QM Quality Score rubric (weights total 100). ──
  const qmIntro = vi
    ? `Bộ lọc <b>Qullamaggie (QM)</b> tìm các thiết lập có xác suất cao: mẫu hình <b>co thắt biến động (VCP)</b> sau một nhịp tăng mạnh, và <b>điểm xoay đột biến (Episodic Pivot)</b> — cú gap theo tin tức/lợi nhuận. Mỗi mã được chấm <b>điểm chất lượng 0–100</b> theo trọng số dưới đây.`
    : `The <b>Qullamaggie (QM)</b> screen finds high-probability setups: <b>Volatility Contraction Patterns (VCP)</b> after a strong advance, and <b>Episodic Pivots</b> — news/earnings gaps. Each stock gets a <b>Quality Score 0–100</b> from the weighted components below.`;

  const qmRows: [string, string, string][] = vi
    ? [
        ['Xu hướng (Trend)', '20', 'Giá > EMA50 > EMA150 > EMA200 và EMA200 đang lên.'],
        ['Nhịp tăng trước', '10', 'Nhịp tăng dẫn vào nền càng mạnh càng tốt (≥ 30%).'],
        ['Chất lượng VCP', '25', 'Số lần co thắt, độ chặt và độ co biến động của nền.'],
        ['Cạn thanh khoản', '15', 'Volume cạn dần trong nền.'],
        ['Sức mạnh tương đối (RS)', '15', 'Hiệu suất so với thị trường (SPY).'],
        ['Thanh khoản', '10', 'Giá trị giao dịch (giá × khối lượng) đủ lớn.'],
        ['Gần điểm bứt phá', '5', 'Càng sát pivot càng cao.'],
      ]
    : [
        ['Trend', '20', 'Price > EMA50 > EMA150 > EMA200 with EMA200 rising.'],
        ['Previous advance', '10', 'A strong advance into the base (≥ 30%).'],
        ['VCP quality', '25', 'Contraction count, base tightness and volatility contraction.'],
        ['Volume dry-up', '15', 'Volume drying up through the base.'],
        ['Relative strength (RS)', '15', 'Performance vs the market (SPY).'],
        ['Liquidity', '10', 'Sufficient dollar volume (price × volume).'],
        ['Breakout proximity', '5', 'Closer to the pivot = higher.'],
      ];

  const qmTableRows = qmRows
    .map(
      ([k, pts, desc]) =>
        `<tr><td style="white-space:nowrap"><b>${k}</b></td><td style="white-space:nowrap" class="accent">${pts}</td><td class="muted">${desc}</td></tr>`,
    )
    .join('');

  // ── Momentum engine. ──
  const momIntro = vi
    ? `Bộ lọc <b>Động lượng (Momentum)</b> trả lời "mã nào đang chạy?". Điểm động lượng 0–100 kết hợp lợi nhuận <b>1 tháng (15)</b>, <b>3 tháng (25)</b>, <b>6 tháng (25)</b>, <b>RS so với SPY (25)</b> và <b>thanh khoản (10)</b>. Theo phân vị, mỗi mã được xếp loại: <b>Weak → Building → Strong → Explosive</b>.`
    : `The <b>Momentum</b> screen answers "what's running right now?". A 0–100 momentum score blends <b>1-month (15)</b>, <b>3-month (25)</b>, <b>6-month (25)</b> returns, <b>RS vs SPY (25)</b> and <b>liquidity (10)</b>. By percentile each name is classed <b>Weak → Building → Strong → Explosive</b>.`;

  // ── Surge screen. ──
  const surgeIntro = vi
    ? `Bộ lọc <b>Surge</b> tìm các mã đang <i>bứt tốc ngay bây giờ</i> — không cần hình thành mẫu hình VCP hay điểm xoay. Nó thu hẹp kết quả của Momentum xuống những mã thoả cả hai điều kiện:`
    : `The <b>Surge</b> screen finds stocks that are <i>surging right now</i> — no VCP or pivot pattern required. It narrows the Momentum result down to names passing both conditions:`;

  const surgeConditions = vi
    ? [
        `<b>Giữ trên EMA5 cả tuần:</b> mỗi phiên trong 5 ngày giao dịch gần nhất đều đóng cửa ≥ EMA5 — không ngày nào bị gãy xu hướng ngắn hạn.`,
        `<b>Tăng &gt;20% trong 2 tuần:</b> giá hiện tại cao hơn giá 10 nến trước ít nhất 20% — chứng tỏ đà bứt phá mạnh.`,
      ]
    : [
        `<b>Held above EMA5 all week:</b> every close of the last 5 trading days is ≥ EMA5 — no single day broke the short-term trend.`,
        `<b>&gt;20% gain in two weeks:</b> the current price is at least 20% above the close 10 bars ago — demonstrating real breakout momentum.`,
      ];

  const surgeWhen = vi
    ? `<b>Khi nào dùng Surge?</b> Khi bạn muốn bắt các mã đang vào đà sớm nhất — chúng thường nằm trên EMA5 và EMA10, chưa kịp hình thành nền VCP hoàn chỉnh. Đây là "cánh cửa hẹp" — ít mã pass hơn Momentum nhưng tín hiệu trực tiếp hơn.`
    : `<b>When to use Surge?</b> When you want to catch names early in a move — they're typically riding their EMA5/EMA10, not yet forming a full VCP base. It's a tighter filter — fewer names pass than Momentum but the signal is more immediate.`;

  // ── Market regime + sector rotation. ──
  const layers = vi
    ? [
        `<b>Bối cảnh thị trường (Regime)</b>: dùng SPY/QQQ để xác định <b>BULL / TRANSITION / BEAR</b> và cờ risk-on/off — biết <i>khi nào</i> nên mạnh tay.`,
        `<b>Luân chuyển ngành (Sector rotation)</b>: xếp hạng ngành theo lợi nhuận 1M/3M và RS, nêu bật ngành <b>nóng/lạnh</b> — biết <i>tiền đang chảy về đâu</i>.`,
        `<b>Pre-filter động lượng</b>: bộ lọc QM/VCP có thể thu hẹp vũ trụ về nhóm động lượng mạnh nhất trước khi quét mẫu hình.`,
      ]
    : [
        `<b>Market regime</b>: SPY/QQQ define <b>BULL / TRANSITION / BEAR</b> and a risk-on/off flag — knowing <i>when</i> to be aggressive.`,
        `<b>Sector rotation</b>: sectors are ranked by 1M/3M return and RS, highlighting <b>hot/cold</b> groups — knowing <i>where money flows</i>.`,
        `<b>Momentum pre-filter</b>: the QM/VCP scan can first narrow the universe to the strongest-momentum names before looking for patterns.`,
      ];

  return `
  <div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 8px">${vi ? '🎯 Điểm chất lượng Qullamaggie' : '🎯 The Qullamaggie Quality Score'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 14px">${qmIntro}</p>
    <div style="overflow-x:auto">
      <table class="playbook-table">
        <thead><tr><th>${vi ? 'Thành phần' : 'Component'}</th><th>${vi ? 'Trọng số' : 'Weight'}</th><th>${vi ? 'Ý nghĩa' : 'Meaning'}</th></tr></thead>
        <tbody>${qmTableRows}</tbody>
      </table>
    </div>

    <div class="section-title">${vi ? '🚀 Động lượng (Momentum)' : '🚀 Momentum'}</div>
    <p class="muted" style="line-height:1.65;margin:0">${momIntro}</p>

    <div class="section-title">${vi ? '⚡ Surge (bứt tốc)' : '⚡ Surge'}</div>
    <p class="muted" style="line-height:1.65;margin:0 0 8px">${surgeIntro}</p>
    <ul class="analysis-list" style="margin:0 0 8px">${surgeConditions.map((c) => `<li>${c}</li>`).join('')}</ul>
    <p class="muted" style="line-height:1.65;margin:0;font-size:12px">${surgeWhen}</p>

    <div class="section-title">${vi ? '🧭 Bối cảnh & luân chuyển' : '🧭 Regime & rotation'}</div>
    <ul class="analysis-list">${layers.map((i) => `<li>${i}</li>`).join('')}</ul>

    <div class="muted" style="font-size:11px;margin-top:14px">${
      vi
        ? 'Mang tính giáo dục — không phải lời khuyên đầu tư.'
        : 'Educational use only — not financial advice.'
    }</div>
  </div>`;
}

function pageGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  type Page = { icon: string; name: string; what: string; howTo: string };
  const pages: Page[] = vi ? [
    {
      icon: '🏆', name: 'Top Picks',
      what: 'Quét toàn bộ vũ trụ cổ phiếu để tìm thiết lập tốt nhất. Ba chiến lược: <b>Qullamaggie</b> (VCP & EP), <b>Momentum</b> (mã đang tăng mạnh nhất), và <b>Surge</b> (bứt phá tuần này).',
      howTo: 'Chọn chiến lược → chọn thị trường và phạm vi (US curated ~540 mã, S&P 1500...) → nhấn ↻ Chạy. Kết quả cập nhật dần khi quét xong từng đợt. Bật "Lọc động lượng trước" để thu hẹp vũ trụ về nhóm mạnh nhất trước khi tìm mẫu hình. Dùng <b>Tính đến ngày</b> để quét theo một ngày trong quá khứ (xem mục bên dưới).',
    },
    {
      icon: '🔍', name: 'Screener',
      what: 'Bộ lọc tùy chỉnh: nhập mã bất kỳ hoặc chọn ngành. Lọc theo loại thiết lập (VCP / EP), điểm chất lượng tối thiểu, mức động lượng.',
      howTo: 'Nhập mã (cách nhau bằng dấu phẩy) hoặc nhấp vào chip ngành để chọn toàn bộ ngành đó → chọn bộ lọc → nhấn Chạy lọc. Nhấp vào hàng để xem biểu đồ chi tiết và phân tích. Đặt <b>Tính đến ngày</b> để lọc theo một ngày trong quá khứ.',
    },
    {
      icon: '👁', name: 'Watchlists',
      what: 'Theo dõi các mã bạn quan tâm. Mỗi mã được quét lại (điểm chất lượng QM, pivot, mức dừng lỗ). Hỗ trợ nhiều danh sách, xuất/nhập JSON.',
      howTo: 'Nhập mã → nhấn Thêm. Nhấn <b>📋 Lập kế hoạch</b> để xem kế hoạch giao dịch có kích thước vị thế cho từng mã. Nhấn ↻ để làm mới giá.',
    },
    {
      icon: '🗺', name: 'Sectors',
      what: 'Xếp hạng ngành theo động lượng 1M/3M và RS so với SPY. Cho thấy tiền đang chảy về ngành nào.',
      howTo: 'Nhấn ↻ Quét ngành → nhấp vào hàng ngành để xem cổ phiếu trong ngành → nhấn "Lọc cổ phiếu →" để chuyển các mã sang Screener. Có thể đặt <b>Tính đến ngày</b> để xem xếp hạng ngành tại một ngày trong quá khứ.',
    },
    {
      icon: '📈', name: 'Portfolio',
      what: 'Giao dịch giấy nhiều tài khoản độc lập. Mua/bán, theo dõi P&L và rủi ro theo thời gian thực (dữ liệu quote trực tiếp).',
      howTo: 'Chọn hoặc tạo tài khoản → nhập mã và số lượng → nhấn Mua/Bán. Đường vốn và các chỉ số rủi ro cập nhật tự động. Có thể đặt <b>ngày</b> trong quá khứ để ghi giao dịch lịch sử — gợi ý giá tự lấy giá đóng cửa của ngày đó.',
    },
    {
      icon: '⏱', name: 'Backtest',
      what: 'Mô phỏng chiến lược trên dữ liệu lịch sử. Hai chiến lược: <b>VCP breakout</b> (mua khi phá vỡ nền VCP) và <b>Momentum rebalancing</b> (nắm giữ mã điểm động lượng cao, thoát khi động lượng giảm).',
      howTo: 'Nhập mã (1–10 mã), chọn chu kỳ lịch sử và chiến lược → nhấn Chạy. Xem phần bên dưới để hiểu tại sao đôi khi kết quả 0 giao dịch.',
    },
    {
      icon: '📰', name: 'Analysis',
      what: 'Bài viết phân tích thị trường: setup đang nổi bật, luận điểm cổ phiếu, lý thuyết nền tảng.',
      howTo: 'Nhấp vào bài để đọc toàn văn.',
    },
    {
      icon: '📓', name: 'Playbook',
      what: 'Quy trình giao dịch hàng ngày dưới dạng checklist tương tác: mở cửa, đóng cửa, và quản lý vị thế.',
      howTo: 'Dùng như danh sách kiểm tra hàng ngày. Đánh dấu từng mục khi hoàn thành; trạng thái không được lưu lại (làm mới mỗi ngày).',
    },
    {
      icon: '📊', name: 'Hồ sơ Setup (Case Studies)',
      what: 'Nhật ký các thiết lập trong quá khứ: ghim một mã vào ngày then chốt, kèm mức mua/cắt lỗ/mục tiêu, các chất xúc tác có ngày tháng, và ghi chú/bài học. Mỗi hồ sơ vẽ biểu đồ nến ±3 tháng quanh ngày đó với mọi mức và dấu mốc.',
      howTo: 'Bấm “＋ Hồ sơ mới” → nhập mã, ngày then chốt, các mức và chất xúc tác → Lưu. Mở hồ sơ để xem biểu đồ (đổi cửa sổ ±1/3/6 tháng) và bấm “⬇ Tải HTML” để xuất báo cáo độc lập (mở ra có nút In → Lưu thành PDF). Hồ sơ được đồng bộ giữa các thiết bị.',
    },
  ] : [
    {
      icon: '🏆', name: 'Top Picks',
      what: 'Sweeps the whole stock universe for the best setups. Three strategies: <b>Qullamaggie</b> (VCP & episodic pivot patterns), <b>Momentum</b> (the strongest movers right now), and <b>Surge</b> (names that broke out this week).',
      howTo: 'Pick a strategy → pick a market and universe (US curated ~540, S&P 1500, …) → hit ↻ Run. Results stream in as each batch is scanned. Enable "Momentum pre-filter" to narrow the universe to the highest-momentum names before looking for patterns. Use <b>As of date</b> to screen as of a past day (see the section below).',
    },
    {
      icon: '🔍', name: 'Screener',
      what: 'Custom scan: paste any tickers or click sector chips. Filter by setup type (VCP / EP), min quality score, and momentum tier.',
      howTo: 'Type symbols (comma-separated) or click sector chips → set your filters → Run Screen. Click any row to open the detail chart with trade levels, analysis, and fundamentals. Set <b>As of date</b> to screen as of a past day.',
    },
    {
      icon: '👁', name: 'Watchlists',
      what: 'Track any symbols you care about. Each is re-scanned live (QM quality score, pivot, stop level). Supports multiple named lists, JSON export/import.',
      howTo: 'Type a ticker → Add. Hit <b>📋 Trade Plan</b> to get position-sized trade plans for every symbol in the list. Hit ↻ to refresh quotes.',
    },
    {
      icon: '🗺', name: 'Sectors',
      what: 'Ranks all sectors by 1M/3M momentum and RS vs SPY. Shows where money is flowing — which sectors are hot and which are cold.',
      howTo: 'Hit ↻ Scan sectors → click a sector row to see its stocks → hit "Screen stocks →" to send them to the Screener. You can set <b>As of date</b> to see the sector ranking as of a past day.',
    },
    {
      icon: '📈', name: 'Portfolio',
      what: 'Multi-account paper trading with live quotes. Buy/sell, track PnL and risk metrics across independent accounts.',
      howTo: 'Select or create an account → enter a ticker and size → Buy/Sell. The equity curve and risk stats update in real time. Set a past <b>date</b> to record a historical transaction — the price hint auto-fills that date\'s close.',
    },
    {
      icon: '⏱', name: 'Backtest',
      what: 'Simulate strategies on historical daily bars. Two strategies: <b>VCP breakout</b> (enters when a VCP base breaks out) and <b>Momentum rebalancing</b> (holds high-momentum names, exits when momentum fades).',
      howTo: 'Enter 1–10 symbols, choose a history period and strategy → Run Backtest. Read the section below for why you sometimes see 0 trades.',
    },
    {
      icon: '📰', name: 'Analysis',
      what: 'Market analysis posts: notable setups, stock thesis, and foundational theory.',
      howTo: 'Click a post to read it in full.',
    },
    {
      icon: '📓', name: 'Playbook',
      what: 'Daily trading process as an interactive checklist: open, close, and position management.',
      howTo: 'Use it as a daily checklist. Check items off as you complete them; state is not saved (resets each session).',
    },
    {
      icon: '📊', name: 'Case Studies',
      what: 'A journal of past setups: pin a stock to a key date with entry/stop/target levels, dated catalysts, and notes/lessons. Each case renders a ±3-month candle chart around that date with every level and marker drawn on it.',
      howTo: 'Click “＋ New case study” → enter the symbol, key date, levels and catalysts → Save. Open a case to view the chart (switch ±1/3/6-month window) and hit “⬇ Download HTML” for a standalone report (it opens with a Print → Save as PDF button). Case studies sync across your devices.',
    },
  ];

  const cards = pages
    .map(
      (p) => `<div class="card" style="margin-bottom:10px">
        <div style="display:flex;gap:10px;align-items:flex-start">
          <span style="font-size:22px;flex:0 0 auto">${p.icon}</span>
          <div>
            <strong style="font-size:14px">${p.name}</strong>
            <p class="muted" style="margin:4px 0;line-height:1.55;font-size:13px">${p.what}</p>
            <p style="margin:4px 0;line-height:1.55;font-size:12px;color:var(--subtext)">
              <b style="color:var(--faint)">${vi ? 'Cách dùng: ' : 'How to use: '}</b>${p.howTo}
            </p>
          </div>
        </div>
      </div>`,
    )
    .join('');

  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 12px">${vi ? '🗺 Hướng dẫn từng trang' : '🗺 Page-by-page guide'}</h2>
    ${cards}
  </div>`;
}

function backtestGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 10px">⏱ ${vi ? 'Hướng dẫn Backtest — tại sao kết quả 0 giao dịch?' : 'Backtest guide — why do I get 0 trades?'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 10px">
      ${vi
        ? 'Backtest mô phỏng chiến lược trên dữ liệu ngày lịch sử mà <b>không nhìn trước</b>. Dưới đây là những lý do phổ biến nhất khiến kết quả trả về 0 giao dịch:'
        : 'The backtest simulates a strategy on historical daily bars with <b>no lookahead</b>. Here are the most common reasons you see 0 trades:'}
    </p>
    <table class="playbook-table">
      <thead><tr>
        <th>${vi ? 'Vấn đề' : 'Issue'}</th>
        <th>${vi ? 'Nguyên nhân' : 'Cause'}</th>
        <th>${vi ? 'Giải pháp' : 'Fix'}</th>
      </tr></thead>
      <tbody>
        <tr>
          <td><b>${vi ? 'VCP hiếm trên 1 mã' : 'VCP is rare on 1 symbol'}</b></td>
          <td>${vi ? 'VCP cần: nhịp tăng 30%+, rồi ≥2 lần co thắt biến động với volume cạn dần. Một mã điển hình chỉ hình thành 0–2 VCP/năm.' : 'VCP requires: a 30%+ prior advance, then ≥2 contracting pullbacks with drying volume. A typical stock forms 0–2 VCPs per year.'}</td>
          <td>${vi ? 'Nhập 5–10 mã đang trong xu hướng tăng mạnh. Dùng "Max" hoặc "5Y" để có đủ dữ liệu.' : 'Enter 5–10 strong-trending stocks. Use "Max" or "5Y" for sufficient history.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Không đủ dữ liệu' : 'Insufficient data'}</b></td>
          <td>${vi ? 'VCP cần ≥100 nến (để tính EMA200 và phát hiện swing). Nếu chọn "2Y" nhưng mã chỉ có dữ liệu 1 năm, nó bị bỏ qua.' : 'VCP needs ≥100 bars (for EMA200 and swing detection). If you pick "2Y" but the stock only has 1Y of data, it is skipped.'}</td>
          <td>${vi ? 'Chọn "5Y" hoặc "Max". Xem thông báo skip trong dòng trạng thái.' : 'Use "5Y" or "Max". Check the skip notice in the status line.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? '"Max" đôi khi ít hơn "5Y"' : '"Max" sometimes gives fewer trades than "5Y"'}</b></td>
          <td>${vi ? 'API Yahoo trả về dữ liệu thưa hơn ở khoảng thời gian xa (split-adjusted, thiếu nến). Càng về xa, chất lượng bar càng kém.' : 'The Yahoo API returns sparser data for older periods (split-adjusted, missing bars). Data quality degrades further back in time.'}</td>
          <td>${vi ? 'Dùng "5Y" cho kết quả ổn định nhất. "Max" hữu ích khi mã còn mới (IPO trong 3–4 năm).' : 'Use "5Y" for most stable results. "Max" is useful for recent IPOs (3–4 years old).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Mã trong downtrend cả kỳ' : 'Stock was in a downtrend the whole period'}</b></td>
          <td>${vi ? 'VCP yêu cầu giá > EMA50 và nhịp tăng 30%+ trước đó. Mã đang rơi suốt sẽ không bao giờ kích hoạt điều kiện này.' : 'VCP requires price > EMA50 and a 30%+ prior advance. A stock in a sustained decline never meets these conditions.'}</td>
          <td>${vi ? 'Chọn mã trong bull market (AAPL, NVDA, MSFT trong 2019–2023 là ví dụ tốt).' : 'Pick stocks in bull markets (AAPL, NVDA, MSFT during 2019–2023 are good examples).'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Chiến lược Momentum không entry' : 'Momentum strategy does not enter'}</b></td>
          <td>${vi ? 'Cần điểm momentum ≥65 VÀ giá > EMA50. Mã sideway hay downtrend cho điểm thấp hơn.' : 'Requires momentum score ≥65 AND price > EMA50. Sideways or downtrending stocks score below the threshold.'}</td>
          <td>${vi ? 'Thêm nhiều mã hơn, hoặc chọn giai đoạn khi mã đang tăng mạnh.' : 'Add more symbols, or choose a period when the stock was strongly trending.'}</td>
        </tr>
        <tr>
          <td><b>${vi ? 'Vị thế bị chặn bởi risk limits' : 'Position blocked by risk limits'}</b></td>
          <td>${vi ? 'Ngay cả khi có tín hiệu entry, vị thế bị bỏ qua nếu tính ra 0 cổ phiếu (rủi ro/cổ phiếu quá lớn so với vốn).' : 'Even when entry signals fire, a position is skipped if share count rounds down to 0 (risk per share too large relative to capital).'}</td>
          <td>${vi ? 'Tăng vốn ban đầu hoặc tăng % rủi ro/lệnh.' : 'Increase capital or raise the risk %/trade.'}</td>
        </tr>
      </tbody>
    </table>
    <div class="muted" style="font-size:11px;margin-top:12px">
      ${vi ? 'Gợi ý: thử NVDA, AAPL, MSFT với chiến lược VCP, chu kỳ 5Y — điển hình cho 3–6 giao dịch mỗi mã.' : 'Tip: try NVDA, AAPL, MSFT with VCP strategy, 5Y period — typically 3–6 trades per stock.'}
    </div>
  </div>`;
}

/** Explainer for as-of (point-in-time / historical) screening. */
function asOfGuideHtml(lang: 'en' | 'vi'): string {
  const vi = lang === 'vi';
  const intro = vi
    ? `Mặc định, mọi bộ lọc dùng dữ liệu <b>thời gian thực</b> (nến mới nhất là "hôm nay"). Chế độ <b>Tính đến ngày</b> cho phép bạn chọn một ngày trong quá khứ và coi ngày đó là "hôm nay" — bộ lọc chỉ dùng dữ liệu <i>tới và bao gồm</i> ngày đó. Tuyệt vời để nghiên cứu xem một mẫu hình trông như thế nào tại thời điểm trong quá khứ.`
    : `By default every screen uses <b>real-time</b> data (the latest bar is "today"). <b>As-of-date</b> mode lets you pick a past date and treat it as "now" — the screen uses only data <i>up to and including</i> that date. Ideal for studying what a setup looked like at a moment in the past.`;

  const points = vi
    ? [
        `<b>Có ở đâu:</b> Top Picks, Screener và Sectors — mỗi tab có bộ chọn ngày riêng. Đặt ngày, hoặc bấm <b>Trực tiếp</b> để quay lại dữ liệu thời gian thực.`,
        `<b>Độ sâu lịch sử (2/5/10 năm/Max):</b> chọn lượng dữ liệu tải về <i>trước</i> ngày đã chọn, để các chỉ báo như EMA200 đủ dữ liệu. Đây là lượng dữ liệu tải, không phải giới hạn ngày chọn.`,
        `<b>Cờ "Chế độ lịch sử":</b> khi bật, một nhãn vàng và viền kết quả giúp bạn không nhầm với dữ liệu trực tiếp. Kết quả quét lịch sử được lưu riêng (không lẫn với quét trực tiếp).`,
        `<b>Trang chi tiết mã:</b> mở một mã từ kết quả lịch sử thì biểu đồ, EMA, điểm QM/động lượng, phân tích và các mức mua/dừng/mục tiêu <i>đều</i> tính đến ngày đó. Lưới chỉ số cơ bản dùng số liệu <b>năm gần nhất trước ngày</b> (được ghi rõ).`,
        `<b>Giao dịch mô phỏng:</b> ô ngày trên form Mua/Bán cho phép ghi lệnh trong quá khứ — gợi ý giá sẽ tự lấy giá đóng cửa <i>của ngày đó</i>.`,
      ]
    : [
        `<b>Where:</b> Top Picks, Screener and Sectors — each tab has its own date picker. Set a date, or press <b>Live</b> to return to real-time data.`,
        `<b>History depth (2/5/10y/Max):</b> chooses how much data is fetched <i>before</i> the chosen date so indicators like EMA200 are well-defined. It's the fetch depth, not a limit on which date you can pick.`,
        `<b>"Historical mode" flag:</b> when active, an amber badge and a tinted results edge make sure you never confuse it with live data. Historical scans are cached separately from your live scans.`,
        `<b>Stock detail page:</b> open a name from historical results and the chart, EMAs, QM/momentum score, analysis and entry/stop/target levels are <i>all</i> computed as of that date. The fundamentals stat grid uses the <b>latest annual figures before the date</b> (clearly labeled).`,
        `<b>Paper Trading:</b> the date field on the Buy/Sell form lets you record a past transaction — the price hint auto-fills the close <i>on that date</i>.`,
      ];

  const caveat = vi
    ? `<b>Lưu ý về số liệu cơ bản:</b> Yahoo chỉ cung cấp chỉ số TTM/trực tiếp của <i>hôm nay</i>, nên ở chế độ lịch sử ta dùng báo cáo <b>năm gần nhất trước ngày</b> cho P/E, EPS, biên lợi nhuận… Vốn hóa, ROE và tỷ suất cổ tức không tái dựng được cho quá khứ nên hiển thị "—". Mọi thứ tính từ giá (xu hướng, mẫu hình, mức giao dịch) thì hoàn toàn chính xác theo thời điểm.`
    : `<b>Note on fundamentals:</b> Yahoo only exposes <i>today's</i> live/TTM figures, so historical mode uses the <b>latest annual statement before the date</b> for P/E, EPS, margin, etc. Market cap, ROE and dividend yield can't be reconstructed for the past, so they show "—". Everything price-derived (trend, patterns, trade levels) is exact for the point in time.`;

  return `<div class="card analysis-card" style="margin-bottom:22px">
    <h2 style="font-size:15px;margin:0 0 8px">${vi ? '📅 Lọc theo ngày trong quá khứ (Tính đến ngày)' : '📅 Point-in-time screening (As of date)'}</h2>
    <p class="muted" style="line-height:1.65;margin:0 0 12px">${intro}</p>
    <ul class="analysis-list">${points.map((p) => `<li>${p}</li>`).join('')}</ul>
    <p class="muted" style="line-height:1.65;margin:8px 0 0;font-size:12px">${caveat}</p>
  </div>`;
}

export function renderLearn(): void {
  const root = $('#tab-learn')!;
  const lang = getLang();
  root.innerHTML = `<h1>${lang === 'vi' ? 'Tìm hiểu' : 'Learn'}</h1>
    <p class="subtitle">${lang === 'vi' ? 'Hướng dẫn từng trang, cách tính điểm, cách lọc, và mọi chỉ số — giải thích dễ hiểu.' : 'Page-by-page guide, how the score is computed, how filtering works, and every metric — in plain English.'}</p>`;
  root.appendChild(el(pageGuideHtml(lang)));
  root.appendChild(el(scoreExplainerHtml(lang)));
  root.appendChild(el(asOfGuideHtml(lang)));
  root.appendChild(el(backtestGuideHtml(lang)));
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
