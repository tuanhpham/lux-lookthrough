import type { QmRow } from '@screener/core';
import { num, fmtPrice, scoreColor } from './dom.js';
import { setupBadge, SETUP_RANK } from './badges.js';

/** Column keys the QM table can sort by. */
export type QmSortKey =
  | 'symbol' | 'qualityScore' | 'setupType' | 'previousAdvancePct'
  | 'vcpContractions' | 'atrContractionPct' | 'volumeContractionPct'
  | 'pivot' | 'entryPrice' | 'stopLoss' | 'riskPct';

interface Column {
  key: QmSortKey;
  label: string;
  defaultDesc: boolean;
}

// Report columns from Feature 7: Quality Score, Previous Advance %, VCP
// Contractions, ATR Contraction, Volume Contraction, Pivot, Entry, Stop,
// Risk %, Setup Type.
const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Symbol', defaultDesc: false },
  { key: 'qualityScore', label: 'Quality', defaultDesc: true },
  { key: 'setupType', label: 'Setup', defaultDesc: true },
  { key: 'previousAdvancePct', label: 'Prev Adv', defaultDesc: true },
  { key: 'vcpContractions', label: 'VCP', defaultDesc: true },
  { key: 'atrContractionPct', label: 'ATR Contr', defaultDesc: true },
  { key: 'volumeContractionPct', label: 'Vol Contr', defaultDesc: true },
  { key: 'pivot', label: 'Pivot', defaultDesc: true },
  { key: 'entryPrice', label: 'Entry', defaultDesc: true },
  { key: 'stopLoss', label: 'Stop', defaultDesc: true },
  { key: 'riskPct', label: 'Risk %', defaultDesc: false },
];

function cellValue(r: QmRow, key: QmSortKey): number | string | null {
  if (key === 'symbol') return r.symbol;
  if (key === 'setupType') return SETUP_RANK[r.setupType] ?? 0;
  return (r[key] as number | null) ?? null;
}

function compare(a: QmRow, b: QmRow, key: QmSortKey, desc: boolean): number {
  const av = cellValue(a, key);
  const bv = cellValue(b, key);
  // Nulls always sink to the bottom regardless of direction.
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  let c: number;
  if (typeof av === 'string' || typeof bv === 'string') c = String(av).localeCompare(String(bv));
  else c = (av as number) - (bv as number);
  return desc ? -c : c;
}

export interface QmTableOptions {
  sortKey?: QmSortKey;
  sortDesc?: boolean;
  /** Optional extra column with a per-row action button (e.g. remove). */
  action?: { header: string; html: (r: QmRow) => string };
  onRowClick: (sym: string) => void;
  onSortChange?: (key: QmSortKey, desc: boolean) => void;
}

/**
 * Sortable results table for QM (Qullamaggie) scans — Quality, Setup,
 * contractions, pivot, entry/stop, risk. Also used by the Watchlist (with an
 * optional per-row action column for the remove button).
 */
export function qmTable(rows: QmRow[], options: QmTableOptions): HTMLElement {
  let sortKey: QmSortKey = options.sortKey ?? 'qualityScore';
  let sortDesc = options.sortDesc ?? true;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.overflowX = 'auto';

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No QM setups matched.</div>`;
    return wrap;
  }

  const render = () => {
    const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDesc));
    const arrow = (k: QmSortKey) => (k === sortKey ? (sortDesc ? ' ▾' : ' ▴') : '');
    const head =
      COLUMNS.map(
        (c) =>
          `<th class="sortable ${c.key === sortKey ? 'sorted' : ''}" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`,
      ).join('') + (options.action ? `<th>${options.action.header}</th>` : '');

    const body = sorted
      .map(
        (r) => `<tr data-sym="${r.symbol}">
        <td><strong>${r.symbol}</strong></td>
        <td><span class="scorebar"><span style="width:${Math.max(0, r.qualityScore)}%;background:${scoreColor(r.qualityScore)}"></span></span> <span style="color:${scoreColor(r.qualityScore)};font-weight:700">${num(r.qualityScore, 0)}</span></td>
        <td>${setupBadge(r.setupType)}</td>
        <td>${r.previousAdvancePct != null ? num(r.previousAdvancePct, 1) + '%' : '—'}</td>
        <td>${r.vcpContractions ?? '—'}</td>
        <td>${r.atrContractionPct != null ? num(r.atrContractionPct, 1) + '%' : '—'}</td>
        <td>${r.volumeContractionPct != null ? num(r.volumeContractionPct, 1) + '%' : '—'}</td>
        <td>${fmtPrice(r.pivot, r.symbol)}</td>
        <td>${fmtPrice(r.entryPrice, r.symbol)}</td>
        <td class="danger">${fmtPrice(r.stopLoss, r.symbol)}</td>
        <td>${r.riskPct != null ? num(r.riskPct, 1) + '%' : '—'}</td>
        ${options.action ? `<td>${options.action.html(r)}</td>` : ''}
      </tr>`,
      )
      .join('');

    wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll<HTMLElement>('th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort as QmSortKey;
        if (key === sortKey) {
          sortDesc = !sortDesc;
        } else {
          sortKey = key;
          sortDesc = COLUMNS.find((c) => c.key === key)!.defaultDesc;
        }
        options.onSortChange?.(sortKey, sortDesc);
        render();
      }),
    );
    wrap.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) =>
      tr.addEventListener('click', (e) => {
        // Let an action button (e.g. remove) handle its own click.
        if ((e.target as HTMLElement).closest('[data-row-action]')) return;
        options.onRowClick(tr.dataset.sym!);
      }),
    );
  };

  render();
  return wrap;
}
