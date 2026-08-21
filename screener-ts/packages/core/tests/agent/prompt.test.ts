import { describe, it, expect } from 'vitest';
import {
  buildHandoffPrompt,
  buildSystemPrompt,
  type AssistantFacts,
} from '../../src/agent/prompt.js';
import { readTools, writeTools, AGENT_TOOLS } from '../../src/agent/tools.js';

const facts: AssistantFacts = {
  today: '2026-08-21',
  accounts: [
    { name: 'Main', currency: 'EUR', isOpen: true },
    { name: 'Crypto', currency: 'USD', isOpen: false },
  ],
  lang: 'en',
};

describe('the facts the prompt has to carry', () => {
  it("states today's date", () => {
    // A model with no date quotes last year's prices as current.
    expect(buildSystemPrompt(facts, readTools())).toContain('2026-08-21');
  });

  it('lists the accounts with their currencies and says which is open', () => {
    const p = buildSystemPrompt(facts, readTools());
    expect(p).toContain('"Main" (EUR)');
    expect(p).toContain('"Crypto" (USD)');
    expect(p).toContain('CURRENTLY OPEN');
    // …and tells it to leave the argument off for that one, so the common case
    // cannot fail on a misspelled name.
    expect(p).toContain('Omit the "account" argument');
  });

  it('handles a first run with no accounts without pretending otherwise', () => {
    const p = buildSystemPrompt({ ...facts, accounts: [] }, readTools());
    expect(p).toContain('no accounts yet');
    expect(p).not.toContain('CURRENTLY OPEN');
  });

  it('asks for the argument explicitly when no single account is open', () => {
    const closed = facts.accounts.map((a) => ({ ...a, isOpen: false }));
    const p = buildSystemPrompt({ ...facts, accounts: closed }, readTools());
    expect(p).toContain('pass the "account" argument explicitly');
  });

  it('names the reply language', () => {
    expect(buildSystemPrompt(facts, readTools())).toContain('Reply in English');
    expect(buildSystemPrompt({ ...facts, lang: 'vi' }, readTools())).toContain(
      'Reply in Vietnamese',
    );
  });
});

describe('the rule the prompt exists to enforce', () => {
  it('forbids stating a price from memory', () => {
    // A remembered price looks exactly like a real one on screen, and the user acts
    // on it. This is the single most important line in the prompt.
    const p = buildSystemPrompt(facts, readTools());
    expect(p).toContain('NEVER state a share price from memory');
    expect(p).toContain('get_quote');
  });

  it('forbids doing the portfolio arithmetic itself', () => {
    expect(buildSystemPrompt(facts, readTools())).toContain('Do not compute PnL');
  });

  it('tells it to report a tool error rather than answer around it', () => {
    expect(buildSystemPrompt(facts, readTools())).toContain('say what it said');
  });
});

describe('the prompt describes only the powers it was given', () => {
  it('says plainly that it cannot change anything when given read tools', () => {
    // An assistant that believes it booked a trade will say it did, and the user
    // finds out days later that the portfolio never had it.
    const p = buildSystemPrompt(facts, readTools());
    expect(p).toContain('YOU CANNOT CHANGE ANYTHING');
    expect(p).toContain('Never reply as though you had recorded something');
    expect(p).not.toContain('approval card');
  });

  it('explains the approval card once write tools exist', () => {
    const p = buildSystemPrompt(facts, AGENT_TOOLS);
    expect(writeTools().length).toBeGreaterThan(0);
    expect(p).toContain('approval card');
    expect(p).toContain('NOTHING happens until they accept');
    expect(p).not.toContain('YOU CANNOT CHANGE ANYTHING');
  });

  it('never claims a delete it does not have', () => {
    expect(buildSystemPrompt(facts, AGENT_TOOLS)).toContain('cannot delete anything');
  });
});

describe('the Ask ChatGPT handoff', () => {
  const question = 'Is this base tight enough to buy the breakout?';

  it('carries the question and the data', () => {
    const out = buildHandoffPrompt({ question, context: ['NVDA 100 @ 180.00', 'Cash 4,200 EUR'] });
    expect(out).toContain(question);
    expect(out).toContain('NVDA 100 @ 180.00');
    // ChatGPT has no tools here, so it is told the pasted figures are the source.
    expect(out).toContain('use them rather than asking me for them');
  });

  it('sends the question alone when there is nothing to attach', () => {
    const out = buildHandoffPrompt({ question });
    expect(out).toContain(question);
    expect(out).not.toContain('My data');
  });

  it('truncates the data and NEVER the question', () => {
    // A cut-off question gets a confident answer to something else entirely.
    const rows = Array.from({ length: 200 }, (_, i) => `ROW${i} 100 shares @ 12.34`);
    const out = buildHandoffPrompt({ question, context: rows, maxChars: 600 });
    expect(out.length).toBeLessThanOrEqual(600);
    expect(out).toContain(question);
    expect(out).toContain('ROW0');
    expect(out).not.toContain('ROW199');
  });

  it('marks what it dropped, so a short list is not read as a small portfolio', () => {
    const rows = Array.from({ length: 50 }, (_, i) => `ROW${i} 100 shares @ 12.34`);
    const out = buildHandoffPrompt({ question, context: rows, maxChars: 700 });
    expect(out).toMatch(/… and \d+ more line\(s\), omitted for length\./);
    // The marker's own length counts toward the cap — the bug this test pins.
    expect(out.length).toBeLessThanOrEqual(700);
  });

  it('drops the data entirely rather than exceed the cap with an apology', () => {
    const out = buildHandoffPrompt({ question, context: ['a'.repeat(500)], maxChars: 120 });
    expect(out).toContain(question);
    expect(out).not.toContain('aaaa');
  });

  it('ignores blank context lines', () => {
    const out = buildHandoffPrompt({ question, context: ['', '   ', 'Cash 100 EUR'] });
    expect(out).toContain('Cash 100 EUR');
    expect(out.split('\n').filter((l) => !l.trim())).toHaveLength(3);
  });
});
