/**
 * The soft gate in front of the Buy button.
 *
 * ── WHAT THE USER ASKED FOR, AND WHY IT IS SOFT ─────────────────────────────
 * "khi chon mot co phieu de buy thi no phai thong qua trade plan de danh gia truoc roi xac
 * nhan xem co ok khong thi moi buy" — choosing a stock to buy should go through the trade
 * plan, be graded, be confirmed, and only then bought. Offered the choice between a hard
 * gate (a D grade cannot be bought) and a soft one, the user picked soft: acknowledge, then
 * buy. That is the right call and not merely the lenient one. A hard gate on a grade the app
 * computes from its own bars would make the app the risk manager, and the first time it
 * refused a trade the user believed in, they would stop using the Buy form — and the
 * portfolio would then be wrong, which is worse than a badly graded lot in it. The gate's
 * job is to make sure the plan was READ, not to make the decision.
 *
 * It also has to stay openable when there is no plan at all: this form is how a trade gets
 * recorded, including one taken months ago or for a reason the playbook has no row for. So
 * the single unlock is the acknowledgement, and what the acknowledgement SAYS changes — an
 * ungraded buy is confirmed in those words, so the tick never claims a plan was read when
 * none existed.
 *
 * This module is the gate's logic with no DOM in it, because the app's vitest has no DOM and
 * "when exactly does the Buy button unlock" is the one part of this feature that must not be
 * verified by eye.
 */
import type { ConvictionRating } from '@screener/core';

/** Why the Buy button is not available — or null when it is. */
export type BuyBlock = 'fields' | 'planning' | 'ack' | null;

export interface GateInput {
  /** Ticker, share count and price all present and positive. */
  hasFields: boolean;
  /** An evaluation is in flight for the fields currently on screen. */
  planning: boolean;
  /** A grade was computed for this symbol, setup and price. False = no plan to read. */
  graded: boolean;
  /** The user has ticked the box AGAINST the plan as it now stands (`reviewCurrent`). */
  acknowledged: boolean;
}

/**
 * What is standing between the user and the Buy button.
 *
 * The order is the order of the user's attention. Nagging about an unread plan while the
 * share count box is still empty teaches them to ignore the message, so the incomplete
 * form wins; and `planning` comes before `ack` because a tick made against a half-built
 * plan is the one thing the gate exists to prevent.
 */
export function buyGate(i: GateInput): BuyBlock {
  if (!i.hasFields) return 'fields';
  if (i.planning) return 'planning';
  if (!i.acknowledged) return 'ack';
  return null;
}

/** The label on the acknowledgement box — which says what is actually being confirmed. */
export function ackLabel(graded: boolean, grade: ConvictionRating | null, vi: boolean): string {
  if (!graded) {
    return vi
      ? 'Mua mà không có kế hoạch được chấm điểm'
      : 'Buy with no graded plan';
  }
  // The letter goes in the label on purpose. A tick that reads "I have read this plan" next
  // to a D is a weaker thing to click than one that reads "I have read this plan — grade D".
  const g = grade ? ` — ${vi ? 'hạng' : 'grade'} ${grade}` : '';
  return (vi ? 'Tôi đã xem kế hoạch này' : 'I have read this plan') + g;
}

/** The line under the Buy button explaining the block, in the user's language. */
export function gateWords(block: BuyBlock, graded: boolean, vi: boolean): string {
  switch (block) {
    case 'fields':
      return vi
        ? 'Nhập mã, số cổ và giá để kế hoạch được chấm điểm.'
        : 'Enter the symbol, share count and price to get the plan graded.';
    case 'planning':
      return vi ? 'Đang chấm điểm kế hoạch…' : 'Grading the plan…';
    case 'ack':
      return graded
        ? (vi
          ? 'Xem kế hoạch ở trên, rồi tích vào ô xác nhận để mở nút Mua.'
          : 'Read the plan above, then tick the box to unlock Buy.')
        : (vi
          ? 'Chọn <b>Loại thiết lập</b> để chấm điểm — hoặc tích vào ô để ghi lệnh mua không có kế hoạch.'
          : 'Pick a <b>Setup</b> to get a grade — or tick the box to record a buy with no plan.');
    case null:
      return '';
  }
}
