/**
 * Turn a Tier-0 tool payload into a sentence.
 *
 * A locally-answered question never reaches a model, so nothing else is going to
 * write the prose. Without this the panel would print raw JSON at the user, which
 * is technically the right numbers and completely the wrong answer.
 *
 * ── WHY IT READS THE PAYLOAD DEFENSIVELY ────────────────────────────────────
 * Every value is pulled through `n()` / `s()` rather than a cast. This is a display
 * path: if a field in `toolExec.ts` is renamed, the honest failure is a dash in one
 * cell, not a thrown TypeError that swallows the whole answer. The numbers
 * themselves are already rounded by the executor — nothing is recomputed here, for
 * the same reason the executor computes nothing itself.
 *
 * Output is the same restricted Markdown `renderAssistantMarkdown` accepts, so a
 * local answer and a model answer look alike in the transcript. They are labelled
 * differently on purpose: one is the app's own data, the other is a model's reading
 * of it.
 */
import { t } from '../ui/i18n.js';

const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const s = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Money with a thousands separator and the account's currency in front. */
function money(v: unknown, ccy: string): string {
  const x = n(v);
  if (x === null) return '—';
  const sign = x < 0 ? '-' : '';
  const body = Math.abs(x).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbolFor(ccy)}${body}`;
}

function symbolFor(ccy: string): string {
  return ccy === 'USD' ? '$' : ccy === 'EUR' ? '€' : ccy ? `${ccy} ` : '';
}

/** Signed percent — the sign is the point, so it is never dropped. */
function pc(v: unknown, digits = 1): string {
  const x = n(v);
  if (x === null) return '—';
  return `${x >= 0 ? '+' : ''}${x.toFixed(digits)}%`;
}

/** The stale-prices warning, verbatim from the executor when it set one. */
function staleLine(d: Record<string, unknown>): string[] {
  return d['PRICES_STALE'] ? [`*${t('chat.local.stale')}*`] : [];
}

function accountsAnswer(d: Record<string, unknown>): string {
  const list = arr(d['accounts']);
  if (!list.length) return t('chat.local.noaccounts');
  const lines = list.map((raw) => {
    const a = rec(raw);
    const open = a['openInApp'] ? ` — **${t('chat.local.open')}**` : '';
    const pos = n(a['openPositions']) ?? 0;
    return `- ${s(a['name'])} (${s(a['currency'])}) · ${money(a['initialCapital'], s(a['currency']))} · ${pos} ${t('chat.local.positions')}${open}`;
  });
  return lines.join('\n');
}

function summaryAnswer(d: Record<string, unknown>): string {
  const ccy = s(d['currency']);
  const lines = [
    `**${s(d['account'])}**`,
    `- ${t('chat.local.equity')}: ${money(d['equity'], ccy)} (${t('chat.local.cash')} ${money(d['cash'], ccy)})`,
    `- ${t('chat.local.totalpnl')}: ${money(d['totalPnL'], ccy)} (${pc(d['totalPnLPct'])})`,
    `- ${t('chat.local.unrealized')}: ${money(d['unrealizedPnL'], ccy)} · ${t('chat.local.realized')}: ${money(d['realizedPnL'], ccy)}`,
    `- ${t('chat.local.risk')}: ${money(d['openRisk'], ccy)} (${pc(d['openRiskPctOfEquity'])} ${t('chat.local.ofequity')})`,
    `- ${t('chat.local.trades')}: ${n(d['openTrades']) ?? 0} ${t('chat.local.open2')}, ${n(d['closedTrades']) ?? 0} ${t('chat.local.closed')} · ${t('chat.local.winrate')} ${(n(d['winRate']) ?? 0).toFixed(0)}%`,
  ];
  // Only worth a line when it is a real warning: every open position unstopped is
  // the single most actionable number on this list.
  const nostop = n(d['positionsWithoutStop']) ?? 0;
  if (nostop > 0) lines.push(`- ${t('chat.local.nostop')}: ${nostop}`);
  return [...lines, ...staleLine(d)].join('\n');
}

function positionsAnswer(d: Record<string, unknown>): string {
  const rows = arr(d['positions']);
  if (!rows.length) return t('chat.local.nopositions');
  const ccy = s(d['currency']);
  const lines = rows.map((raw) => {
    const p = rec(raw);
    const shares = n(p['shares']) ?? 0;
    const bits = [
      `${shares} @ ${money(p['avgCost'], ccy)} → ${money(p['lastPrice'], ccy)}`,
      `${money(p['unrealizedPnL'], ccy)} (${pc(p['unrealizedPnLPct'])})`,
      `${pc(p['weightPct'])} ${t('chat.local.ofequity')}`,
    ];
    // "No stop" is said out loud rather than left as a blank column — it is the one
    // thing on this line the user might need to act on today.
    if (p['stop'] === null) bits.push(`**${t('chat.local.nostop2')}**`);
    else if (p['riskFree']) bits.push(t('chat.local.riskfree'));
    else bits.push(`${t('chat.local.stop')} ${money(p['stop'], ccy)}`);
    return `- **${s(p['ticker'])}** · ${bits.join(' · ')}`;
  });
  return [...lines, ...staleLine(d)].join('\n');
}

function transactionsAnswer(d: Record<string, unknown>): string {
  const rows = arr(d['transactions']);
  if (!rows.length) return t('chat.local.notrades');
  const ccy = s(d['currency']);
  const lines = rows.map((raw) => {
    const x = rec(raw);
    const pnl = n(x['realizedPnL']);
    const tail = pnl === null ? '' : ` · ${money(pnl, ccy)}`;
    return `- ${s(x['date'])} **${s(x['kind'])}** ${s(x['ticker'])} ${n(x['shares']) ?? 0} @ ${money(x['price'], ccy)}${tail}`;
  });
  const total = n(d['total']) ?? rows.length;
  // Says what was left out, so a 25-row list is not read as the whole history.
  if (total > rows.length) lines.push(`*${t('chat.local.showing')} ${rows.length}/${total}*`);
  return lines.join('\n');
}

function quotesAnswer(d: Record<string, unknown>): string {
  const rows = arr(d['quotes']);
  if (!rows.length) return t('chat.local.noquote');
  return rows
    .map((raw) => {
      const q = rec(raw);
      const err = s(q['error']);
      if (err) return `- **${s(q['ticker'])}** — ${t('chat.local.noquote')} (${err})`;
      const price = n(q['price']);
      const parts = [
        price === null ? '—' : `$${price.toFixed(2)}`,
        `${t('chat.local.day')} ${pc(q['dayChangePct'])}`,
        `1M ${pc(q['pctChange1m'])}`,
        `3M ${pc(q['pctChange3m'])}`,
      ];
      const off = n(q['pctBelowHigh']);
      if (off !== null) parts.push(`${off.toFixed(1)}% ${t('chat.local.belowhigh')}`);
      return `- **${s(q['ticker'])}** · ${parts.join(' · ')} *(${s(q['asOf'])})*`;
    })
    .join('\n');
}

/**
 * Render a Tier-0 payload, or null when this tool has no local prose.
 *
 * Returning null is a real answer: the caller then sends the question to the model
 * instead of showing JSON. Adding a read tool without a renderer here degrades to
 * "the model answers it", which is correct behaviour rather than a broken panel.
 */
export function renderLocalAnswer(tool: string, data: unknown): string | null {
  const d = rec(data);
  switch (tool) {
    case 'list_accounts':
      return accountsAnswer(d);
    case 'get_account_summary':
      return summaryAnswer(d);
    case 'list_positions':
      return positionsAnswer(d);
    case 'list_transactions':
      return transactionsAnswer(d);
    case 'get_quote':
      return quotesAnswer(d);
    default:
      return null;
  }
}
