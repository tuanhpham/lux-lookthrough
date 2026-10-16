/**
 * Why cash moved in or out of an account (CHAT-106) — the reasons the ± Cash dialog offers.
 *
 * The user asked for "Tax withdrawal, Tax Correction, Dividends, Cash from Bank Account". The
 * reason is not a label only: core's `isCapitalFlow` keeps a dividend, interest and tax OUT of
 * the capital base, so a dividend shows up as money the positions made instead of as money
 * the user put in. A flow filed before this (no `kind`) stays a deposit / withdrawal by its sign.
 */
import type { CashFlow, CashKind } from '@screener/core';

export interface CashKindRow {
  key: CashKind;
  en: string;
  vi: string;
  /** The direction it normally has: +1 in, −1 out, 0 either (a tax correction can go both ways). */
  sign: 1 | -1 | 0;
}

export const CASH_KINDS: readonly CashKindRow[] = [
  { key: 'deposit', en: 'Cash from bank account', vi: 'Nạp tiền từ tài khoản ngân hàng', sign: 1 },
  { key: 'withdraw', en: 'Withdrawal to bank account', vi: 'Rút tiền về tài khoản ngân hàng', sign: -1 },
  { key: 'dividend', en: 'Dividend', vi: 'Cổ tức', sign: 1 },
  { key: 'interest', en: 'Interest', vi: 'Lãi tiền mặt', sign: 1 },
  { key: 'tax', en: 'Tax withdrawal', vi: 'Thuế bị trừ', sign: -1 },
  { key: 'tax_fix', en: 'Tax correction', vi: 'Điều chỉnh thuế', sign: 0 },
];

export function isCashKind(v: unknown): v is CashKind {
  return CASH_KINDS.some((k) => k.key === v);
}

/** The reason of a stored flow; one filed before CHAT-106 is a deposit or a withdrawal by its sign. */
export function kindOf(f: Pick<CashFlow, 'kind' | 'amount'>): CashKind {
  return f.kind ?? (f.amount >= 0 ? 'deposit' : 'withdraw');
}

export function cashKindLabel(kind: CashKind, vi: boolean): string {
  const row = CASH_KINDS.find((k) => k.key === kind);
  return row ? (vi ? row.vi : row.en) : kind;
}

/** The ± direction a reason implies, given what the user picked when it allows both. */
export function signFor(kind: CashKind, picked: 'in' | 'out'): 1 | -1 {
  const s = CASH_KINDS.find((k) => k.key === kind)?.sign ?? 0;
  return s !== 0 ? s : picked === 'out' ? -1 : 1;
}

/** Options for a formDialog select. */
export function cashKindOptions(vi: boolean): { value: string; label: string }[] {
  return CASH_KINDS.map((k) => ({ value: k.key, label: `${k.sign > 0 ? '↓' : k.sign < 0 ? '↑' : '↕'} ${vi ? k.vi : k.en}` }));
}
