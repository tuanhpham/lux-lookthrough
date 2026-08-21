import { describe, it, expect } from 'vitest';
import { matchIntent, type IntentContext } from '../../src/agent/intents.js';
import { findTool, validateToolArgs } from '../../src/agent/tools.js';

const ctx: IntentContext = {
  accountNames: ['Main', 'Main Growth', 'Crypto'],
  knownTickers: ['AAPL', 'NVDA', 'ASML'],
};

const tool = (s: string, c: IntentContext = ctx): string | null => matchIntent(s, c)?.tool ?? null;

describe('the questions Tier 0 answers for nothing', () => {
  it('recognises "what do I own" in its usual phrasings', () => {
    expect(tool('what do I own?')).toBe('list_positions');
    expect(tool('my positions')).toBe('list_positions');
    expect(tool('show me my holdings')).toBe('list_positions');
    expect(tool('open positions please')).toBe('list_positions');
  });

  it('recognises the whole-account questions', () => {
    expect(tool('how much cash do I have?')).toBe('get_account_summary');
    expect(tool('how am I doing?')).toBe('get_account_summary');
    expect(tool('my pnl')).toBe('get_account_summary');
    expect(tool('what is my open risk')).toBe('get_account_summary');
    expect(tool('win rate?')).toBe('get_account_summary');
  });

  it('recognises accounts and history', () => {
    expect(tool('list accounts')).toBe('list_accounts');
    expect(tool('how many accounts do I have')).toBe('list_accounts');
    expect(tool('trade history')).toBe('list_transactions');
    expect(tool('my recent trades')).toBe('list_transactions');
  });

  it('recognises a price question and pulls out the symbol', () => {
    const m = matchIntent('price of nvda', ctx)!;
    expect(m.tool).toBe('get_quote');
    expect(m.args['tickers']).toBe('NVDA');
    expect(matchIntent('what is the price of ASML?', ctx)!.args['tickers']).toBe('ASML');
    expect(matchIntent('aapl quote', ctx)!.args['tickers']).toBe('AAPL');
    expect(matchIntent('how much is nvda', ctx)!.args['tickers']).toBe('NVDA');
  });

  it('takes a bare symbol as a price question', () => {
    expect(matchIntent('NVDA', ctx)!.args['tickers']).toBe('NVDA');
    expect(matchIntent('nvda', ctx)!.args['tickers']).toBe('NVDA'); // held, so known
    expect(matchIntent('TSLA', {})!.args['tickers']).toBe('TSLA'); // caps, so intended
  });

  it('answers Vietnamese, with or without tone marks', () => {
    // The app is bilingual and people type both ways in the same session.
    expect(tool('danh mục của tôi')).toBe('list_positions');
    expect(tool('danh muc cua toi')).toBe('list_positions');
    expect(tool('tôi còn bao nhiêu tiền mặt')).toBe('get_account_summary');
    expect(tool('lịch sử giao dịch')).toBe('list_transactions');
    expect(tool('danh sách tài khoản')).toBe('list_accounts');
    expect(matchIntent('giá của NVDA', ctx)!.args['tickers']).toBe('NVDA');
  });

  it('scopes to an account the user named, longest name winning', () => {
    expect(matchIntent('how much cash in Main Growth', ctx)!.args['account']).toBe('Main Growth');
    expect(matchIntent('positions in Crypto', ctx)!.args['account']).toBe('Crypto');
    // No name mentioned → no scope, and the executor uses the open account.
    expect(matchIntent('my positions', ctx)!.args['account']).toBeUndefined();
  });
});

describe('what Tier 0 refuses to touch', () => {
  it('never matches an utterance containing a write verb', () => {
    // THE POINT: a regex cannot tell "sell 100 AAPL" from "I nearly sold AAPL".
    // "sell my winners" must not be answered with a positions table.
    expect(tool('sell 100 AAPL at 195')).toBeNull();
    expect(tool('sell my winners')).toBeNull();
    expect(tool('buy 10 NVDA')).toBeNull();
    expect(tool('add a new account called Test')).toBeNull();
    expect(tool('deposit 5000')).toBeNull();
    expect(tool('raise my stop on AAPL to 190')).toBeNull();
    expect(tool('record my trades from yesterday')).toBeNull();
    expect(tool('mua 10 NVDA')).toBeNull();
    expect(tool('bán hết AAPL')).toBeNull();
  });

  it('hands anything asking for judgement to the model', () => {
    expect(tool('should I sell AAPL?')).toBeNull();
    expect(tool('is my portfolio too concentrated?')).toBeNull();
    expect(tool('why is my pnl down')).toBeNull();
    expect(tool('what do you think of my positions')).toBeNull();
    expect(tool('compare my accounts')).toBeNull();
    expect(tool('có nên mua NVDA không')).toBeNull();
    expect(tool('đánh giá danh mục của tôi')).toBeNull();
  });

  it('hands over a long, multi-part message even when it starts like a lookup', () => {
    expect(
      tool(
        'my positions and also the cash balance and then tell me which ones are closest to their stops today',
      ),
    ).toBeNull();
  });

  it('does not turn an ordinary word into a ticker', () => {
    // A lower-case unheld word is not a symbol, or "cash" would quote CASH.
    expect(tool('cash')).toBeNull();
    expect(tool('risk')).toBeNull();
    expect(tool('hello')).toBeNull();
    // Even in caps, the common ones are excluded.
    expect(tool('ALL')).toBeNull();
    expect(tool('CASH')).toBeNull();
    expect(tool('OK')).toBeNull();
  });

  it('returns null for an empty or meaningless message', () => {
    expect(tool('')).toBeNull();
    expect(tool('   ')).toBeNull();
    expect(tool('???')).toBeNull();
    expect(tool('thanks!')).toBeNull();
  });

  it('answers "what is it worth" with the summary, not a table of rows', () => {
    // A value question wants one number. The positions rule also matches the word
    // "portfolio", so the summary rule is checked first on purpose.
    expect(tool('what is my portfolio worth')).toBe('get_account_summary');
    expect(tool('portfolio value')).toBe('get_account_summary');
    expect(tool('tổng giá trị danh mục')).toBe('get_account_summary');
    // …while a plain "my portfolio" still wants the rows.
    expect(tool('my portfolio')).toBe('list_positions');
  });
});

describe('the guarantees, not the phrasings', () => {
  const UTTERANCES = [
    'what do I own?',
    'how much cash do I have?',
    'price of nvda',
    'trade history',
    'list accounts',
    'danh muc cua toi',
    'NVDA',
    'positions in Crypto',
    'my recent trades in Main Growth',
  ];

  it('only ever returns a read tool', () => {
    // Tier 0 runs with no approval card in front of it, so a write reached from
    // here would execute unreviewed. This is the assertion that forbids it.
    for (const u of UTTERANCES) {
      const m = matchIntent(u, ctx);
      if (m) expect(findTool(m.tool)?.kind).toBe('read');
    }
  });

  it('returns arguments the tool itself accepts', () => {
    // A Tier-0 call and a model call reach the executor in the same shape, so a
    // rule that produced something invalid would fail at execution instead of here.
    for (const u of UTTERANCES) {
      const m = matchIntent(u, ctx);
      if (m) expect(validateToolArgs(m.tool, m.args).ok).toBe(true);
    }
  });

  it('names the rule that fired, for when one misbehaves', () => {
    expect(matchIntent('price of nvda', ctx)!.rule).toBe('price-of');
    expect(matchIntent('NVDA', ctx)!.rule).toBe('bare-ticker');
    expect(matchIntent('my positions', ctx)!.rule).toBe('positions');
  });

  it('works with no context at all, for a first-run app', () => {
    expect(tool('what do I own?', {})).toBe('list_positions');
    expect(matchIntent('price of nvda', {})!.args['tickers']).toBe('NVDA');
  });
});
