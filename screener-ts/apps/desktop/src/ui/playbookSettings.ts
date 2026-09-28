/**
 * The place to change the playbook's numbers.
 *
 * ── WHY IT SAVES ONLY THE DIFFERENCES ───────────────────────────────────────
 * Every input here starts at a shipped default. Writing all 60-odd values back on
 * Save would freeze this version of the table into the user's synced data forever:
 * a later correction to, say, the Surge lookback would never reach them, and there
 * would be no way to tell a number they chose from one they merely saw. So Save
 * stores ONLY the fields that differ, and "Reset" is a delete rather than a write.
 *
 * ── WHY THE TOP OF THE DIALOG IS READ-ONLY ──────────────────────────────────
 * The regime, the closed-trade count and the resulting risk budget are shown but not
 * editable, because they are facts about the market and about the user's own record.
 * Showing them here is the point: the ladder's answer ("0.25%, halved twice, floored")
 * is otherwise invisible, and a number the user cannot see is a number they will
 * override by feel.
 *
 * ── WHY A PINNED PERCENT IS ALLOWED AT ALL ──────────────────────────────────
 * The book is firm that size follows the record, and the automatic ladder is the
 * default. But it is their money, and a rule with no override gets worked around in
 * ways the app cannot see (entering a smaller position by hand and losing the
 * suggestion entirely). An explicit, visible pin is the honest version of that.
 */
import {
  DEFAULT_RISK_LADDER,
  DEFAULT_SETUP_RULES,
  SETUP_KEYS,
  RATING_KEYS,
  closedTradePnls,
  riskBudget,
  riskStageOf,
  type RiskLadderConfig,
  type SetupKey,
  type SetupRule,
  type SetupRuleOverrides,
  type AccountState,
} from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from './i18n.js';
import {
  currentRegime, ladderConfig, loadPlaybookConfig, playbookConfig,
  savePlaybookConfig, regimeStale, type PlaybookConfig,
} from '../portfolio/playbook.js';
// Shared with the Buy form and the Trade Planner, so all three dropdowns spell the
// setups the same way.
import { setupName } from '../portfolio/planWords.js';

/** Editable numeric fields of a setup rule, in column order. */
const NUM_FIELDS = ['lookback', 'padPct', 'atrMult', 'firstTargetR', 'targetEma', 'trailEma', 'maxHoldSessions'] as const;
type NumField = (typeof NUM_FIELDS)[number];

const LADDER_FIELDS: { key: keyof RiskLadderConfig; vi: string; en: string; hint: { vi: string; en: string } }[] = [
  { key: 'learningPct', vi: 'Rủi ro khi đang học (%)', en: 'Risk while learning (%)',
    hint: { vi: 'Dưới số lệnh đã đóng bên dưới, hoặc khi kỳ vọng còn âm.', en: 'Under the closed-trade count below, or while expectancy is negative.' } },
  { key: 'provingPct', vi: 'Rủi ro khi đang chứng minh (%)', en: 'Risk while proving (%)',
    hint: { vi: 'Đã đủ số lệnh và kỳ vọng dương.', en: 'Past the trade count with a positive expectancy.' } },
  { key: 'stablePct', vi: 'Rủi ro khi đã ổn định (%)', en: 'Risk when stable (%)',
    hint: { vi: 'Cẩm nang: không có lý do gì để vượt 1%.', en: 'The book: there is no good reason to exceed 1%.' } },
  { key: 'learningTrades', vi: 'Số lệnh để hết "đang học"', en: 'Trades to leave “learning”',
    hint: { vi: 'Một lệnh = một lô bán hết, không phải một dòng bán.', en: 'One trade = one lot sold out, not one sell row.' } },
  { key: 'stableTrades', vi: 'Số lệnh để lên "ổn định"', en: 'Trades to reach “stable”', hint: { vi: '', en: '' } },
  { key: 'losingStreakTrigger', vi: 'Số lệnh lỗ liên tiếp thì giảm nửa', en: 'Losing streak that halves size', hint: { vi: '', en: '' } },
  { key: 'minRiskPct', vi: 'Sàn rủi ro (%)', en: 'Risk floor (%)',
    hint: { vi: 'Hai lần giảm nửa cộng lại không được về 0 — kế hoạch 0 cổ đọc như lỗi.', en: 'Two stacked halvings must not reach zero; a 0-share plan reads like a bug.' } },
  { key: 'maxPortfolioHeatPct', vi: 'Tổng rủi ro mở tối đa (%)', en: 'Max total open risk (%)',
    hint: { vi: 'Giới hạn không ai để ý: từng lệnh đúng cỡ, năm lệnh cộng lại thì không.', en: 'The limit nobody notices: each trade sized right, five of them not.' } },
  { key: 'maxPositionPct', vi: 'Tỷ trọng tối đa một mã (%)', en: 'Max one position (%)', hint: { vi: '', en: '' } },
  { key: 'minRR', vi: 'R:R tối thiểu', en: 'Minimum R:R',
    hint: { vi: 'Dưới mức này cẩm nang nói bỏ qua, bất kể mẫu hình đẹp đến đâu.', en: 'Below this the book says skip it, however pretty the pattern.' } },
];

const ANCHORS: { value: SetupRule['anchor']; vi: string; en: string }[] = [
  { value: 'signalBarLow', vi: 'Đáy nến tín hiệu', en: 'Signal bar low' },
  { value: 'lowestLowN', vi: 'Đáy thấp nhất N phiên', en: 'Lowest low of N' },
  { value: 'atr', vi: 'Theo ATR', en: 'By ATR' },
];
const TARGETS: { value: SetupRule['targetKind']; vi: string; en: string }[] = [
  { value: 'rMultiple', vi: 'Bội số R', en: 'R multiple' },
  { value: 'measuredMove', vi: 'Chiều cao nền', en: 'Measured move' },
  { value: 'ema', vi: 'Chạm EMA', en: 'At an EMA' },
];

/** `null` shows as an empty box — "no trail", "never expires" — not as a 0. */
function numVal(v: number | null): string {
  return v === null ? '' : String(v);
}

function numInput(setup: SetupKey, field: NumField, value: number | null): string {
  return `<input class="field" data-setup="${setup}" data-field="${field}" type="text"
    inputmode="decimal" autocorrect="off" autocapitalize="off"
    value="${numVal(value)}" style="width:100%;min-width:52px;padding:4px 6px;font-size:12px;text-align:right" />`;
}

/** The regime + record + budget block, and the reason each cut applied. */
function statusHtml(state: AccountState | null, vi: boolean): string {
  const r = currentRegime();
  const ladder = ladderConfig();
  const regimeLabels: Record<string, [string, string]> = {
    UPTREND: ['Xu hướng tăng', 'Uptrend'],
    UPTREND_UNDER_STRESS: ['Tăng nhưng đang căng', 'Uptrend under stress'],
    RANGE: ['Đi ngang', 'Range'],
    DOWNTREND: ['Xu hướng giảm', 'Downtrend'],
  };
  const regimeLine = r
    ? `<b>${vi ? regimeLabels[r.regime]![0] : regimeLabels[r.regime]![1]}</b>
       <span class="muted">· SPY ${r.close} · MA50 ${r.ma50} · MA200 ${r.ma200}
       · ${vi ? 'độ dốc MA50' : 'MA50 slope'} ${r.slope50Pct > 0 ? '+' : ''}${r.slope50Pct}%
       · ATR ${r.atrRatio === null ? (vi ? 'chưa đo được' : 'not measured') : `${r.atrRatio}×`}
       · ${r.asOf}${regimeStale() ? (vi ? ' ⚠️ đã cũ' : ' ⚠️ stale') : ''}</span>`
    : `<span class="muted">${vi
        ? 'Chưa đủ dữ liệu SPY để xác định trạng thái thị trường — bấm ↻ Cập nhật ở tab Portfolio.'
        : 'Not enough SPY history to name the regime yet — press ↻ Update on the Portfolio tab.'}</span>`;

  if (!state) return `<div style="font-size:12px;line-height:1.7">${regimeLine}</div>`;

  const pnls = closedTradePnls(state);
  const stage = riskStageOf(pnls, ladder);
  const cfg = playbookConfig();
  const budget = riskBudget(stage, { regime: r?.regime ?? null, atrRatio: r?.atrRatio ?? null }, ladder);
  const stageLabel: Record<string, [string, string]> = {
    learning: ['đang học', 'learning'], proving: ['đang chứng minh', 'proving'], stable: ['ổn định', 'stable'],
  };
  const cutText: Record<string, [string, string]> = {
    regimeDowntrend: ['thị trường giảm → không mở lệnh mua mới', 'downtrend → no new longs'],
    volExpanded: ['biến động giãn ra → giảm nửa', 'volatility expanded → halved'],
    regimeStress: ['xu hướng tăng đang căng → giảm nửa', 'uptrend under stress → halved'],
    regimeRange: ['thị trường đi ngang → giảm nửa', 'range → halved'],
    losingStreak: [`${ladder.losingStreakTrigger} lệnh lỗ liên tiếp → giảm nửa`, `${ladder.losingStreakTrigger} losses in a row → halved`],
    // No `rating` entry, and the omission is the point: the conviction grade is no longer
    // one of these cuts. It scales the FINISHED share count in `suggestSize`, because risk
    // percent is only one of the four limits on a position and scaling it did nothing
    // whenever another limit was the binding one. Every cut listed here is something the
    // app decided on the user's behalf; the grade is the user choosing smaller.
    flooredAtMin: ['đã chạm sàn rủi ro', 'hit the risk floor'],
  };
  const cuts = budget.cuts.map((c) => (vi ? cutText[c]![0] : cutText[c]![1]));
  const pinned = cfg.pinnedRiskPct !== null;

  return `<div style="font-size:12px;line-height:1.7">
    ${regimeLine}<br>
    <b>${pnls.length}</b> ${vi ? 'lệnh đã đóng' : 'closed trades'} ·
    ${vi ? 'kỳ vọng' : 'expectancy'} <b>${stage.expectancy > 0 ? '+' : ''}${stage.expectancy}</b>
    ${vi ? 'mỗi lệnh' : 'per trade'} ·
    ${vi ? 'bậc' : 'rung'} <b>${vi ? stageLabel[stage.stage]![0] : stageLabel[stage.stage]![1]}</b>
    ${stage.losingStreak > 0 ? `· ${vi ? 'đang lỗ' : 'currently'} <b>${stage.losingStreak}</b> ${vi ? 'lệnh liên tiếp' : 'in a row'}` : ''}
    <br>
    ${vi ? 'Rủi ro cho lệnh tiếp theo' : 'Risk for the next trade'}:
    <b style="color:var(--accent)">${pinned ? cfg.pinnedRiskPct : budget.pct}%</b>
    ${pinned ? `<span class="muted">(${vi ? 'bạn đã ghim; thang tự động sẽ cho' : 'pinned by you; the ladder would say'} ${budget.pct}%)</span>` : ''}
    · ${vi ? 'tối đa' : 'up to'} <b>${budget.maxPositions}</b> ${vi ? 'vị thế' : 'positions'}
    ${cuts.length ? `<br><span class="muted">${vi ? 'Vì' : 'Because'}: ${cuts.join(' · ')}</span>` : ''}
  </div>`;
}

/**
 * Open the dialog. `state` is the active account, used only for the read-only
 * status block — the dialog still works (and still saves) without one.
 */
export async function openPlaybookSettings(
  ctx: AppContext,
  state: AccountState | null,
  onSaved?: () => void,
): Promise<void> {
  await loadPlaybookConfig(ctx);
  const vi = getLang() === 'vi';
  const cfg = playbookConfig();
  const ladder = ladderConfig();

  /** The rule as it currently stands: default merged with the user's override. */
  const eff = (k: SetupKey): SetupRule => ({ ...DEFAULT_SETUP_RULES[k], ...(cfg.setups[k] ?? {}) });

  const head = (vLabel: string, eLabel: string, title = ''): string =>
    `<th style="text-align:right;padding:4px 6px;font-weight:500;white-space:nowrap" ${title ? `title="${title}"` : ''}>${vi ? vLabel : eLabel}</th>`;

  const host = document.createElement('div');
  host.className = 'modal';
  host.innerHTML = `
    <div class="modal-backdrop"></div>
    <div class="modal-panel" style="max-width:920px">
      <div class="modal-head">
        <div>${vi ? '📖 Cấu hình cẩm nang' : '📖 Playbook settings'}</div>
        <button class="pb-x" style="background:0;border:0;color:var(--faint);font-size:22px;cursor:pointer">×</button>
      </div>
      <div class="modal-body" style="padding:16px;max-height:76vh;overflow:auto">

        <div class="card" style="padding:10px 12px;margin-bottom:14px">
          ${statusHtml(state, vi)}
        </div>

        <p class="muted" style="font-size:12px;line-height:1.6;margin:0 0 14px">
          ${vi
            ? 'Mọi con số ở đây là một điểm khởi đầu hợp lý để bạn tự kiểm chứng, không phải hằng số thiêng. Ô để trống nghĩa là “không có” (không kéo theo EMA, không hết hạn) — khác với số 0.'
            : 'Every number here is a reasonable starting point for you to verify, not a sacred constant. An empty box means “none” (no trail, never expires) — which is not the same as 0.'}
        </p>

        <div class="section-title" style="margin-top:0">${vi ? 'Cỡ vị thế' : 'Position size'}</div>
        <div class="grid" style="grid-template-columns:1fr 1fr;gap:10px 18px">
          ${LADDER_FIELDS.map((f) => `
            <div>
              <label class="field-label" style="margin-bottom:2px">${vi ? f.vi : f.en}</label>
              <input class="field" data-ladder="${f.key}" type="text" inputmode="decimal"
                autocorrect="off" autocapitalize="off" value="${ladder[f.key as 'minRR']}"
                style="width:100%;padding:5px 7px;font-size:12px" />
              ${(vi ? f.hint.vi : f.hint.en)
                ? `<div class="muted" style="font-size:11px;line-height:1.4;margin-top:2px">${vi ? f.hint.vi : f.hint.en}</div>`
                : ''}
            </div>`).join('')}
        </div>

        <div style="margin-top:14px">
          <label class="field-label" style="margin-bottom:2px">
            ${vi ? 'Ghim rủi ro mỗi lệnh (%) — để trống để dùng thang tự động' : 'Pin risk per trade (%) — empty to use the automatic ladder'}
          </label>
          <input class="field" id="pb-pinned" type="text" inputmode="decimal" autocorrect="off" autocapitalize="off"
            value="${cfg.pinnedRiskPct ?? ''}" placeholder="${vi ? 'tự động' : 'automatic'}"
            style="width:160px;padding:5px 7px;font-size:12px" />
          <div class="muted" style="font-size:11px;line-height:1.4;margin-top:2px">
            ${vi
              ? 'Ghim vẫn không mở lệnh mua mới khi thị trường ở xu hướng giảm: đó là luật “có giao dịch hay không”, không phải luật “to bao nhiêu”.'
              : 'A pin still refuses new longs in a downtrend: that rule is about whether to trade, not about how big.'}
          </div>
        </div>

        <div class="section-title">${vi ? 'Cỡ theo xếp hạng' : 'Size by grade'}</div>
        <p class="muted" style="font-size:12px;line-height:1.6;margin:0 0 10px">
          ${vi
            ? 'Phần cỡ vị thế mà mỗi hạng được lấy, tính theo % của cỡ đầy đủ. A là 100 vì A nghĩa là “đúng cái lệnh mà thang rủi ro được viết cho”. Ba hạng còn lại là số của app, không phải của cẩm nang — nên mới cho sửa. Trong Trade Planner, hạng do bảng tiêu chí tự tính ra, không phải tự chọn; chưa đủ dữ liệu để xếp hạng thì lệnh vẫn được cỡ đầy đủ.'
            : 'The share of the FINISHED position each grade gets, as a percent of full size. A is 100 because A <i>means</i> “the trade the ladder was written for”. The other three are the app’s numbers, not the book’s — which is exactly why they are editable. In the Trade Planner the grade is scored from a criteria checklist rather than chosen; when too little can be measured to name a letter, the trade is planned at full size.'}
        </p>
        <div class="row" style="gap:10px;flex-wrap:wrap">
          ${RATING_KEYS.map((k) => `
            <div style="width:110px">
              <label class="field-label" style="margin-bottom:2px">${vi ? 'Hạng' : 'Grade'} ${k} (%)</label>
              <input class="field" data-rating="${k}" type="text" inputmode="decimal"
                autocorrect="off" autocapitalize="off" value="${ladder.ratingPct[k]}"
                style="width:100%;padding:5px 7px;font-size:12px;text-align:right" />
            </div>`).join('')}
        </div>
        <div class="muted" style="font-size:11px;line-height:1.4;margin-top:4px">
          ${vi
            ? 'Phần này nhân vào số cổ đã tính xong, chứ không nằm trong chồng giảm nửa vì thị trường: % rủi ro chỉ là một trong bốn giới hạn, nên nếu giới hạn tập trung 25% đang quyết định cỡ thì giảm % rủi ro sẽ không đổi được gì. Sàn rủi ro vì thế không chặn phần này — nó để chặn app tự bóp lệnh, không phải để chặn bạn. Nhưng hạng thấp nhất vẫn luôn còn ít nhất 1 cổ.'
            : 'This multiplies the finished share count rather than sitting in the stack of market halvings: risk percent is only one of four limits, so cutting it changed nothing whenever the 25% concentration cap was the binding one. The risk floor therefore does not catch this cut — the floor exists to stop the APP whittling a position away, not to stop you. The lowest grade still never falls below 1 share.'}
        </div>

        <div class="section-title">${vi ? 'Luật theo từng thiết lập' : 'Rules per setup'}</div>
        <div style="overflow-x:auto">
          <table style="width:100%;border-collapse:collapse;font-size:12px;min-width:820px">
            <thead><tr style="border-bottom:1px solid var(--border,#2a2a2a);color:var(--faint)">
              <th style="text-align:left;padding:4px 6px;font-weight:500">${vi ? 'Thiết lập' : 'Setup'}</th>
              ${head('Neo cắt lỗ', 'Stop anchor')}
              ${head('N phiên', 'N sessions', vi ? 'Số phiên cho đáy thấp nhất và chiều cao nền' : 'Sessions for the lowest low and the base height')}
              ${head('Đệm %', 'Pad %', vi ? 'Nới thêm dưới đáy: cắt lỗ đặt đúng ngay đáy sẽ bị chính cái bóng nến đó quét' : 'Room below the low: a stop sitting on it is swept by the wick that made it')}
              ${head('× ATR', '× ATR', vi ? 'Cắt lỗ khi neo theo ATR, và là thước đo “cắt lỗ này có xa bất thường không”' : 'The stop when anchored on ATR, and the yardstick for “is this stop unusually wide?”')}
              ${head('Mục tiêu', 'Target')}
              ${head('R đầu', 'First R', vi ? 'Chốt một nửa ở bội số R này' : 'Take half off at this R multiple')}
              ${head('EMA chốt', 'Exit EMA')}
              ${head('EMA kéo', 'Trail EMA', vi ? 'Kéo phần còn lại theo EMA này. Trống = không kéo.' : 'Trail the runner against this EMA. Empty = no trail.')}
              ${head('Hạn (phiên)', 'Expiry', vi ? 'Quá số phiên này thì luận điểm hết hiệu lực dù giá thế nào. Trống = không hết hạn.' : 'After this many sessions the thesis has expired regardless of price. Empty = never.')}
              <th></th>
            </tr></thead>
            <tbody>
              ${SETUP_KEYS.map((k) => {
                const r = eff(k);
                const changed = Object.keys(cfg.setups[k] ?? {}).length > 0;
                return `<tr data-row="${k}" style="border-bottom:1px solid var(--border,#1f1f1f)">
                  <td style="padding:5px 6px;white-space:nowrap">
                    <b>${setupName(k, vi)}</b>
                    ${DEFAULT_SETUP_RULES[k].source === 'derived'
                      ? `<span class="badge" style="border-color:var(--warn,#ffb648);color:var(--warn,#ffb648)"
                           title="${vi
                             ? 'Cẩm nang không có dòng nào cho thiết lập này; những con số này là suy ra từ nguyên tắc của nó. Nên xem lại trước khi tin.'
                             : 'The book has no row for this setup; these numbers are extrapolated from its principles. Worth reviewing before trusting.'}">${vi ? 'suy ra' : 'derived'}</span>`
                      : ''}
                    ${changed ? `<span class="badge" style="border-color:var(--accent);color:var(--accent)">${vi ? 'đã sửa' : 'edited'}</span>` : ''}
                  </td>
                  <td style="padding:3px 6px"><select class="field" data-setup="${k}" data-field="anchor"
                    style="width:100%;min-width:130px;padding:4px 6px;font-size:12px">
                    ${ANCHORS.map((a) => `<option value="${a.value}"${a.value === r.anchor ? ' selected' : ''}>${vi ? a.vi : a.en}</option>`).join('')}
                  </select></td>
                  ${NUM_FIELDS.slice(0, 3).map((f) => `<td style="padding:3px 6px">${numInput(k, f, r[f])}</td>`).join('')}
                  <td style="padding:3px 6px"><select class="field" data-setup="${k}" data-field="targetKind"
                    style="width:100%;min-width:120px;padding:4px 6px;font-size:12px">
                    ${TARGETS.map((a) => `<option value="${a.value}"${a.value === r.targetKind ? ' selected' : ''}>${vi ? a.vi : a.en}</option>`).join('')}
                  </select></td>
                  <td style="padding:3px 6px">${numInput(k, 'firstTargetR', r.firstTargetR)}</td>
                  <td style="padding:3px 6px">${numInput(k, 'targetEma', r.targetEma)}</td>
                  <td style="padding:3px 6px">${numInput(k, 'trailEma', r.trailEma)}</td>
                  <td style="padding:3px 6px">${numInput(k, 'maxHoldSessions', r.maxHoldSessions)}</td>
                  <td style="padding:3px 6px;white-space:nowrap">
                    <a href="#" data-reset="${k}" class="muted" style="font-size:11px">${vi ? 'về mặc định' : 'reset'}</a>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>

        <div id="pb-msg" class="muted" style="font-size:12px;min-height:18px;margin:10px 0"></div>
        <div class="row" style="justify-content:flex-end;gap:8px">
          <button id="pb-reset-all" class="btn-outline" style="margin-right:auto">${vi ? 'Về mặc định toàn bộ' : 'Reset everything'}</button>
          <button id="pb-cancel" class="btn-outline">${vi ? 'Hủy' : 'Cancel'}</button>
          <button id="pb-save" class="btn">${vi ? 'Lưu' : 'Save'}</button>
        </div>
      </div>
    </div>`;

  document.body.appendChild(host);
  const close = (): void => host.remove();
  const msg = host.querySelector('#pb-msg') as HTMLElement;

  host.querySelector('.modal-backdrop')!.addEventListener('click', close);
  host.querySelector('.pb-x')!.addEventListener('click', close);
  host.querySelector('#pb-cancel')!.addEventListener('click', close);

  // Per-setup reset: put the shipped defaults back in the boxes. Nothing is stored
  // until Save, so this is undoable by cancelling.
  host.querySelectorAll<HTMLAnchorElement>('[data-reset]').forEach((a) =>
    a.addEventListener('click', (e) => {
      e.preventDefault();
      const k = a.dataset.reset as SetupKey;
      const d = DEFAULT_SETUP_RULES[k];
      host.querySelectorAll<HTMLElement>(`[data-setup="${k}"]`).forEach((el) => {
        const f = el.dataset.field as keyof SetupRule;
        const v = d[f];
        (el as HTMLInputElement).value = typeof v === 'number' ? String(v) : v === null ? '' : String(v);
      });
      msg.textContent = vi ? `Đã đưa ${setupName(k, vi)} về mặc định (chưa lưu).` : `${setupName(k, vi)} back to defaults (not saved yet).`;
    }),
  );

  host.querySelector('#pb-reset-all')!.addEventListener('click', async () => {
    await savePlaybookConfig(ctx, { setups: {}, ladder: {}, pinnedRiskPct: null });
    onSaved?.();
    close();
  });

  host.querySelector('#pb-save')!.addEventListener('click', async () => {
    const next: PlaybookConfig = { setups: {}, ladder: {}, pinnedRiskPct: null };

    // Ladder: keep only what differs from the default, and reject nonsense rather
    // than storing it — a blank or negative risk floor would come back as a plan.
    for (const f of LADDER_FIELDS) {
      const el = host.querySelector<HTMLInputElement>(`[data-ladder="${f.key}"]`);
      const raw = (el?.value ?? '').trim().replace(',', '.');
      const v = Number(raw);
      if (!raw || !Number.isFinite(v) || v < 0) continue;
      if (v !== DEFAULT_RISK_LADDER[f.key]) (next.ladder as Record<string, number>)[f.key] = v;
    }

    // ── WHY ALL FOUR GRADES GO IN OR NONE DO ────────────────────────────────
    // `ladderConfig()` merges one level deep (`{...DEFAULT_RISK_LADDER, ...cfg.ladder}`),
    // so a stored `ratingPct` REPLACES the default record wholesale instead of being
    // merged into it. Save only the differing letters and the other three come back
    // `undefined` — `ratingScale` would read them as "no grade" and quietly plan a C at
    // full size. So: if any letter differs, write the complete record.
    const gradePct: Record<string, number> = {};
    let gradeChanged = false;
    for (const k of RATING_KEYS) {
      const raw = (host.querySelector<HTMLInputElement>(`[data-rating="${k}"]`)?.value ?? '').trim().replace(',', '.');
      const v = Number(raw);
      // Nonsense keeps the default for that letter rather than storing a 0 that would
      // read as "plan no shares" — which must be a decision, never a typo.
      const use = raw && Number.isFinite(v) && v > 0 ? v : DEFAULT_RISK_LADDER.ratingPct[k];
      gradePct[k] = use;
      if (use !== DEFAULT_RISK_LADDER.ratingPct[k]) gradeChanged = true;
    }
    if (gradeChanged) next.ladder.ratingPct = gradePct as RiskLadderConfig['ratingPct'];

    const pinnedRaw = (host.querySelector<HTMLInputElement>('#pb-pinned')?.value ?? '').trim().replace(',', '.');
    const pinned = Number(pinnedRaw);
    next.pinnedRiskPct = pinnedRaw && Number.isFinite(pinned) && pinned > 0 ? pinned : null;

    const setups: SetupRuleOverrides = {};
    for (const k of SETUP_KEYS) {
      const d = DEFAULT_SETUP_RULES[k];
      const diff: Partial<SetupRule> = {};
      for (const el of host.querySelectorAll<HTMLElement>(`[data-setup="${k}"]`)) {
        const field = el.dataset.field as keyof SetupRule;
        const raw = (el as HTMLInputElement).value.trim().replace(',', '.');
        if (field === 'anchor' || field === 'targetKind') {
          if (raw && raw !== d[field]) (diff as Record<string, string>)[field] = raw;
          continue;
        }
        // Empty means null ("no trail", "never expires") for the fields that allow it,
        // and "leave the default alone" for the ones that do not.
        if (!raw) {
          if (d[field] !== null && (field === 'targetEma' || field === 'trailEma' || field === 'maxHoldSessions')) {
            (diff as Record<string, null>)[field] = null;
          }
          continue;
        }
        const v = Number(raw);
        if (!Number.isFinite(v) || v < 0) continue;
        if (v !== d[field]) (diff as Record<string, number>)[field] = v;
      }
      if (Object.keys(diff).length) setups[k] = diff;
    }
    next.setups = setups;

    await savePlaybookConfig(ctx, next);
    onSaved?.();
    close();
  });
}
