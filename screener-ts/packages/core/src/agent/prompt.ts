/**
 * What the assistant is told before it sees the first question, and what gets
 * handed to ChatGPT when the user would rather not spend tokens.
 *
 * ── WHY THE PROMPT IS BUILT, NOT WRITTEN ────────────────────────────────────
 * Three of the facts in it change per call — today's date, which accounts exist,
 * which one is open — and every one of them is something a model will otherwise
 * invent. A model with no date states last year's prices as current; a model with
 * no account list guesses a name and the tool call fails. So the prompt is a
 * function of the app's actual state, and the tool list it describes is the same
 * array that was sent in the request. A hand-written prompt would drift from the
 * catalogue the first time a tool was added.
 *
 * ── THE RULE THE PROMPT EXISTS TO ENFORCE ───────────────────────────────────
 * NO NUMBER IS EVER THE MODEL'S OWN. Prices come from `get_quote`, positions from
 * `list_positions`, PnL from `get_account_summary`. This is not tidiness: a
 * plausible-looking price that came out of training data is indistinguishable from
 * a real one on screen, and the user may act on it. Everything below is either that
 * rule, a fact needed to follow it, or a limit on what the model may do.
 *
 * Pure string building: no clock (the date is passed in), no fetch, no DOM.
 */

import type { AgentToolDef } from './tools.js';

export interface AccountFact {
  name: string;
  currency: string;
  /** The account the app currently has open — the default for every tool. */
  isOpen: boolean;
}

export interface AssistantFacts {
  /** Today, `YYYY-MM-DD`. Core has no clock; the app supplies this. */
  today: string;
  accounts: readonly AccountFact[];
  /** Reply language. The app is bilingual and the user may switch mid-session. */
  lang: 'en' | 'vi';
}

const LANG_NAME: Record<'en' | 'vi', string> = { en: 'English', vi: 'Vietnamese' };

/** The account lines, or an honest note that there are none yet. */
function accountSection(accounts: readonly AccountFact[]): string {
  if (!accounts.length) {
    return 'The user has no accounts yet. If they ask about positions or cash, say there is nothing to report and offer to create an account.';
  }
  const lines = accounts.map(
    (a) => `- "${a.name}" (${a.currency})${a.isOpen ? ' — CURRENTLY OPEN' : ''}`,
  );
  const open = accounts.find((a) => a.isOpen);
  return [
    'Accounts:',
    ...lines,
    open
      ? `Omit the "account" argument to act on "${open.name}". Only pass one when the user names a different account, and pass the name EXACTLY as spelled above.`
      : 'No single account is open, so pass the "account" argument explicitly, spelled exactly as above.',
  ].join('\n');
}

/**
 * What the model may change, phrased for whichever tools it was actually given.
 *
 * The read-only wording matters more than it looks: an assistant that believes it
 * recorded a trade will confirm it did, and the user will find out days later that
 * their portfolio never had it. Saying plainly what it cannot do is the fix.
 */
function powersSection(tools: readonly AgentToolDef[]): string {
  const writes = tools.filter((t) => t.kind === 'write');
  if (!writes.length) {
    return [
      'YOU CANNOT CHANGE ANYTHING. You have read-only tools. If the user asks you to record a buy or sell, create an account, move a stop or log a transfer, say clearly that you cannot do it yet and that they should use the Portfolio tab. Never reply as though you had recorded something.',
    ].join('\n');
  }
  return [
    'You can record changes, with one condition: every write is shown to the user as an approval card and NOTHING happens until they accept it. So propose the action by calling the tool, then report what the user decided — never claim a trade is booked before the tool result says so.',
    'Never invent a price, a share count or a date to fill a required argument. If the user did not say, ask.',
    'You cannot delete anything, and you cannot undo. Deletions happen in the app.',
  ].join('\n');
}

/**
 * The system prompt for one turn.
 *
 * `tools` must be the same list sent in the request: the prompt describes what the
 * model can do, and describing a tool it was not given is how you get a model
 * apologising for a capability it actually has (or claiming one it does not).
 */
export function buildSystemPrompt(
  facts: AssistantFacts,
  tools: readonly AgentToolDef[],
): string {
  return [
    "You are the assistant inside a stock-screening and paper-trading app. The user is a swing trader following Qullamaggie-style momentum methodology: VCP bases, episodic pivots, breakouts held for weeks with a stop under the entry.",
    '',
    `Today is ${facts.today}. Use this date whenever a date is needed, and never assume it is any other year — your training data ends before today.`,
    '',
    accountSection(facts.accounts),
    '',
    'HOW TO GET FACTS:',
    '- Every number you state must come from a tool call in this conversation. Not from memory, not from arithmetic on other numbers you were given.',
    '- NEVER state a share price from memory. Call get_quote. A price you remember is from training data and is wrong by definition.',
    '- Do not compute PnL, position value, risk or returns yourself. The tools return them already computed from the recorded trades; your arithmetic on top would disagree with the app the user is looking at.',
    '- Money figures are in the account currency shown above. Say the currency when it could be ambiguous.',
    '- If a tool returns an error, say what it said. Do not retry the same call unchanged, and do not answer around it as though the data had arrived.',
    '',
    powersSection(tools),
    '',
    'HOW TO ANSWER:',
    `- Reply in ${LANG_NAME[facts.lang]}.`,
    '- Be brief and concrete. A number and a sentence beats a paragraph. Use short bullet lists for several positions, never a wall of prose.',
    '- The app already shows a "not financial advice" disclaimer on every screen. Do not repeat it in your messages.',
    '- When the user asks what to do, you may give a clear opinion grounded in the data you fetched — say what the data shows and what it does not. Do not hedge every sentence, and do not pretend to certainty about the future.',
    "- If you do not have enough information, ask one specific question rather than guessing.",
  ].join('\n');
}

// ── Ask ChatGPT handoff ───────────────────────────────────────────────────────

export interface HandoffInput {
  /** The user's question, verbatim. Never truncated. */
  question: string;
  /**
   * Portfolio facts the app already has, as lines of text. Sent so the question
   * arrives answerable: ChatGPT has no tools here, so anything not pasted in is
   * something it will either ask for or invent.
   */
  context?: readonly string[];
  /**
   * Cap for the whole prompt. Beyond `MAX_URL_PROMPT_LENGTH` the ask needs the
   * browser extension to carry it, so the default keeps a typical handoff on the
   * plain-URL path that works without one.
   */
  maxChars?: number;
}

const DEFAULT_HANDOFF_CHARS = 2400;

/**
 * Pack a question and the portfolio data behind it into one prompt for ChatGPT.
 *
 * ── WHY THIS EXISTS ALONGSIDE A WORKING API CLIENT ──────────────────────────
 * A ChatGPT subscription is flat-rate; API calls are metered. For a question that
 * needs thinking rather than data — "is this base tight enough", "talk me through
 * this setup" — the app can gather the facts for free and let the subscription do
 * the reasoning. That is the cheapest possible route to an answer and the reason
 * Ask ChatGPT is not being replaced by the assistant.
 *
 * THE CONTEXT IS TRUNCATED, THE QUESTION NEVER IS. A cut-off question produces a
 * confident answer to something the user did not ask, which is worse than an answer
 * based on partial data — and the truncation is marked, so the reader can see that
 * rows are missing rather than concluding the portfolio is small.
 */
export function buildHandoffPrompt(input: HandoffInput): string {
  const limit = input.maxChars ?? DEFAULT_HANDOFF_CHARS;
  const question = input.question.trim();
  const head = 'I trade momentum breakouts (Qullamaggie style). My question:';
  const lines = (input.context ?? []).map((l) => l.trim()).filter(Boolean);

  const base = `${head}\n\n${question}`;
  if (!lines.length) return base;

  const preamble =
    '\n\nMy data, from my own tracker (these figures are correct — use them rather than asking me for them):\n';
  const tail =
    '\n\nAnswer from the data above. If something you need is missing, say which one thing it is.';

  // Assemble, then drop lines from the end until it fits. Done by re-measuring
  // rather than by budgeting up front because the "N lines omitted" marker only
  // exists once something HAS been dropped, and its own length counts.
  const assemble = (kept: readonly string[]): string => {
    const omitted = lines.length - kept.length;
    const body = omitted ? [...kept, `… and ${omitted} more line(s), omitted for length.`] : kept;
    return `${base}${preamble}${body.join('\n')}${tail}`;
  };

  const kept = [...lines];
  for (;;) {
    const out = assemble(kept);
    if (out.length <= limit) return out;
    kept.pop();
    // Every line dropped and it still does not fit: the question alone is over the
    // cap, so send it bare rather than a prompt that is all apology and no data.
    if (!kept.length) return base;
  }
}
