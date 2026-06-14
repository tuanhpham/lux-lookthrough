import type { ScreenRow } from '@screener/core';
import { num, scoreColor, signalBadge, stageBadge } from './dom.js';

export function resultsTable(rows: ScreenRow[], onClick: (sym: string) => void): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'card';
  if (!rows.length) {
    wrap.innerHTML = `<div class="muted" style="text-align:center;padding:30px">No matches. Lower the min score or widen filters.</div>`;
    return wrap;
  }
  wrap.style.overflowX = 'auto';
  wrap.innerHTML = `
    <table>
      <thead><tr>
        <th>Symbol</th><th>Score</th><th>Signal</th><th>Stage</th><th>Price</th>
        <th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th><th>Dist</th><th>VCP</th>
      </tr></thead>
      <tbody>
        ${rows
          .map(
            (r) => `<tr data-sym="${r.symbol}">
          <td><strong>${r.symbol}</strong></td>
          <td><span class="scorebar"><span style="width:${Math.max(0, r.score)}%;background:${scoreColor(
            r.score,
          )}"></span></span> <span style="color:${scoreColor(r.score)};font-weight:700">${num(r.score, 0)}</span></td>
          <td>${signalBadge(r.signal)}</td>
          <td>${stageBadge(r.stage, r.stageLabel)}</td>
          <td>$${num(r.price)}</td>
          <td>${r.entryPrice != null ? '$' + num(r.entryPrice) : '—'}</td>
          <td class="danger">${r.stopLoss != null ? '$' + num(r.stopLoss) : '—'}</td>
          <td class="accent">${r.targetPrice != null ? '$' + num(r.targetPrice) : '—'}</td>
          <td>${r.riskReward != null ? num(r.riskReward, 1) + 'R' : '—'}</td>
          <td>${num(r.distanceToPivotPct, 1)}%</td>
          <td>${r.vcpContractions ?? '—'}</td>
        </tr>`,
          )
          .join('')}
      </tbody>
    </table>`;
  wrap.querySelectorAll('tr[data-sym]').forEach((tr) =>
    tr.addEventListener('click', () => onClick((tr as HTMLElement).dataset.sym!)),
  );
  return wrap;
}
