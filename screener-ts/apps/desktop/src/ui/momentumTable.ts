import type { MomentumRow, MomentumClassification } from '@screener/core';
import { num, pct, fmtPrice, scoreColor } from './dom.js';

/** Column keys the momentum table can sort by. */
export type MomentumSortKey =
  | 'symbol' | 'momentumScore' | 'momentumPercentile' | 'classification'
  | 'return1m' | 'return3m' | 'return6m' | 'relativeStrength'
  | 'distanceFrom52wHighPct' | 'atrPct' | 'sectorRank';

interface Column {
  key: MomentumSortKey;
  label: string;
  defaultDesc: boolean;
}

// F5/F6 columns: ticker, momentum_score, percentile, classification, 1M/3M/6M,
// RS, sector, dist-from-52w-high %, ATR%, sector_rank (+ hot-sector flag inline).
const COLUMNS: Column[] = [
  { key: 'symbol', label: 'Symbol', defaultDesc: false },
  { key: 'momentumScore', label: 'Momentum', defaultDesc: true },
  { key: 'momentumPercentile', label: 'Pctl', defaultDesc: true },
  { key: 'classification', label: 'Class', defaultDesc: true },
  { key: 'return1m', label: '1M', defaultDesc: true },
  { key: 'return3m', label: '3M', defaultDesc: true },
  { key: 'return6m', label: '6M', defaultDesc: true },
  { key: 'relativeStrength', label: 'RS', defaultDesc: true },
  { key: 'distanceFrom52wHighPct', label: '% off 52wH', defaultDesc: false },
  { key: 'atrPct', label: 'ATR%', defaultDesc: true },
  { key: 'sectorRank', label: 'Sector', defaultDesc: false },
];

const CLASS_RANK: Record<MomentumClassification, number> = {
  Explosive: 4,
  Strong: 3,
  Building: 2,
  Weak: 1,
};

const CLASS_COLOR: Record<MomentumClassification, string> = {
  Explosive: 'var(--accent)',
  Strong: 'var(--accent)',
  Building: 'var(--warn)',
  Weak: 'var(--faint)',
};

function classBadge(c: MomentumClassification): string {
  const color = CLASS_COLOR[c];
  return `<span class="badge" style="background:color-mix(in srgb,${color} 16%,transparent);color:${color}">${c}</span>`;
}

/** Sector cell: rank + a flame when it's a hot sector. */
function sectorCell(r: MomentumRow): string {
  if (r.sectorRank == null) return r.sector ? `${r.sector}` : '—';
  const hot = r.isHotSector ? ' 🔥' : '';
  const name = r.sector ? ` ${r.sector}` : '';
  return `#${r.sectorRank}${name}${hot}`;
}

function cellValue(r: MomentumRow, key: MomentumSortKey): number | string | null {
  if (key === 'symbol') return r.symbol;
  if (key === 'classification') return CLASS_RANK[r.classification] ?? 0;
  return (r[key] as number | null) ?? null;
}

function compare(a: MomentumRow, b: MomentumRow, key: MomentumSortKey, desc: boolean): number {
  const av = cellValue(a, key);
  const bv = cellValue(b, key);
  if (av == null && bv == null) return 0;
  if (av == null) return 1;
  if (bv == null) return -1;
  let c: number;
  if (typeof av === 'string' || typeof bv === 'string') c = String(av).localeCompare(String(bv));
  else c = (av as number) - (bv as number);
  return desc ? -c : c;
}

export interface MomentumTableOptions {
  sortKey?: MomentumSortKey;
  sortDesc?: boolean;
  onRowClick: (sym: string) => void;
  onSortChange?: (key: MomentumSortKey, desc: boolean) => void;
}

/**
 * Sortable results table for the Momentum exploration scan (F5/F6). A sibling of
 * `qmTable`/`sortableTable` — kept separate so existing tables are untouched and
 * the momentum-specific columns (returns, RS, percentile, sector rank) render
 * cleanly. A signed-return cell is colored green/red via `pct`.
 */
export function momentumTable(rows: MomentumRow[], options: MomentumTableOptions): HTMLElement {
  let sortKey: MomentumSortKey = options.sortKey ?? 'momentumScore';
  let sortDesc = options.sortDesc ?? true;

  const wrap = document.createElement('div');
  wrap.className = 'card';
  wrap.style.overflowX = 'auto';

  if (!rows.length) {
    wrap.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No momentum movers found.</div>`;
    return wrap;
  }

  const retCell = (v: number | null): string => {
    if (v == null) return '—';
    const color = v >= 0 ? 'var(--accent)' : 'var(--danger)';
    return `<span style="color:${color}">${pct(v)}</span>`;
  };

  const render = () => {
    const sorted = [...rows].sort((a, b) => compare(a, b, sortKey, sortDesc));
    const arrow = (k: MomentumSortKey) => (k === sortKey ? (sortDesc ? ' ▾' : ' ▴') : '');
    const head = COLUMNS.map(
      (c) =>
        `<th class="sortable ${c.key === sortKey ? 'sorted' : ''}" data-sort="${c.key}">${c.label}${arrow(c.key)}</th>`,
    ).join('');

    const body = sorted
      .map(
        (r) => `<tr data-sym="${r.symbol}">
        <td><strong>${r.symbol}</strong></td>
        <td><span class="scorebar"><span style="width:${Math.max(0, r.momentumScore)}%;background:${scoreColor(r.momentumScore)}"></span></span> <span style="color:${scoreColor(r.momentumScore)};font-weight:700">${num(r.momentumScore, 0)}</span></td>
        <td>${num(r.momentumPercentile, 0)}</td>
        <td>${classBadge(r.classification)}</td>
        <td>${retCell(r.return1m)}</td>
        <td>${retCell(r.return3m)}</td>
        <td>${retCell(r.return6m)}</td>
        <td>${num(r.relativeStrength, 1)}</td>
        <td>${num(r.distanceFrom52wHighPct, 1)}%</td>
        <td>${num(r.atrPct, 1)}%</td>
        <td>${sectorCell(r)}</td>
      </tr>`,
      )
      .join('');

    wrap.innerHTML = `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;

    wrap.querySelectorAll<HTMLElement>('th.sortable').forEach((th) =>
      th.addEventListener('click', () => {
        const key = th.dataset.sort as MomentumSortKey;
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
      tr.addEventListener('click', () => options.onRowClick(tr.dataset.sym!)),
    );
  };

  render();
  return wrap;
}
