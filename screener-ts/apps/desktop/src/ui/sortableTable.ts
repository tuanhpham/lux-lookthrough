import type { ScreenRow } from '@screener/core';
import { num, scoreColor, signalBadge, stageBadge } from './dom.js';

/** Column keys a result table can sort by. */
export type SortKey =
  | 'symbol' | 'score' | 'signal' | 'stage' | 'price'
  | 'entryPrice' | 'stopLoss' | 'targetPrice' | 'riskReward'
  | 'distanceToPivotPct' | 'vcpContractions';

interface Column {
  key: SortKey;
  label: string;
  /** Default sort direction when the column is first clicked. */
  defaultDesc: boolean;
}

const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Symbol', defaultDesc: false },
  { key: 'score', label: 'Score', defaultDesc: true },
  { key: 'signal', label: 'Signal', defaultDesc: true },
  { key: 'stage', label: 'Stage', defaultDesc: false },
  { key: 'price', label: 'Price', defaultDesc: true },
  { key: 'entryPrice', label: 'Entry', defaultDesc: true },
  { key: 'stopLoss', label: 'Stop', defaultDesc: true },
  { key: 'targetPrice', label: 'Target', defaultDesc: true },
  { key: 'riskReward', label: 'R:R', defaultDesc: true },
  { key: 'distanceToPivotPct', label: 'Dist', defaultDesc: false },
  { key: 'vcpContractions', label: 'VCP', defaultDesc: true },
];

// Signals ranked so "stronger" sorts higher when descending.
const SIGNAL_RANK: Record<string, number> = { BREAKOUT_IMMINENT: 2, CONSOLIDATING: 1, NO_SIGNAL: 0 };

function cellValue(r: ScreenRow, key: SortKey): number | string | null {
  switch (key) {
    case 'symbol':
      return r.symbol;
    case 'signal':
      return SIGNAL_RANK[r.signal] ?? 0;
    default:
      return (r[key] as number | null) ?? null;
  }
}

function compare(a: ScreenRow, b: ScreenRow, key: SortKey, desc: boolean): number {
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

export interface SortableTableOptions {
  /** Persisted/initial sort. */
  sortKey?: SortKey;
  sortDesc?: boolean;
  /** Optional extra column with a per-row action button (e.g. remove). */
  action?: { header: string; html: (r: ScreenRow) => string };
  onRowClick: (sym: string) => void;
  /** Called when the user changes the sort, so the caller can remember it. */
  onSortChange?: (key: SortKey, desc: boolean) => void;
}

/**
 * A results table with clickable, sortable column headers (asc/desc toggle).
 * Shared by Screener, Top Picks, and Watchlists so sorting behaves identically.
 */
export function sortableTable(rows: ScreenRow[], options: SortableTableOptions): HTMLElement {
  let sortKey: SortKey = options.sortKey ?? 'score';
  let sortDesc = options.sortDesc ?? true;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.overflowX = 'auto';

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No matches.</div>`;
    return wrap;
  }

  const render = () => {
    const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDesc));
    const arrow = (k: SortKey) => (k === sortKey ? (sortDesc ? ' ▾' : ' ▴') : '');
    const head =
      COLUMNS.map(
        (c) =>
          `<th class="sortable ${c.key === sortKey ? 'sorted' : ''}" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`,
      ).join('') + (options.action ? `<th>${options.action.header}</th>` : '');

    const body = sorted
      .map(
        (r) => `<tr data-sym="${r.symbol}">
        <td><strong>${r.symbol}</strong></td>
        <td><span class="scorebar"><span style="width:${Math.max(0, r.score)}%;background:${scoreColor(r.score)}"></span></span> <span style="color:${scoreColor(r.score)};font-weight:700">${num(r.score, 0)}</span></td>
        <td>${signalBadge(r.signal)}</td>
        <td>${stageBadge(r.stage, r.stageLabel)}</td>
        <td>${r.price ? '$' + num(r.price) : '—'}</td>
        <td>${r.entryPrice != null ? '$' + num(r.entryPrice) : '—'}</td>
        <td class="danger">${r.stopLoss != null ? '$' + num(r.stopLoss) : '—'}</td>
        <td class="accent">${r.targetPrice != null ? '$' + num(r.targetPrice) : '—'}</td>
        <td>${r.riskReward != null ? num(r.riskReward, 1) + 'R' : '—'}</td>
        <td>${r.distanceToPivotPct != null ? num(r.distanceToPivotPct, 1) + '%' : '—'}</td>
        <td>${r.vcpContractions ?? '—'}</td>
        ${options.action ? `<td>${options.action.html(r)}</td>` : ''}
      </tr>`,
      )
      .join('');

    wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll<HTMLElement>('th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort as SortKey;
        if (key === sortKey) {
          sortDesc = !sortDesc; // same column → flip direction
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
