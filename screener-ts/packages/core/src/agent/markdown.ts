/**
 * Render the assistant's reply as HTML — the small subset of Markdown a model
 * actually uses, and nothing else.
 *
 * ── WHY NOT A MARKDOWN LIBRARY ──────────────────────────────────────────────
 * Because this text is untrusted. It is written by a model that was reading web
 * pages, tool output and whatever the user pasted, and it lands in `innerHTML`. A
 * full Markdown renderer accepts raw HTML by design, so using one here would mean
 * adding a sanitiser on top and trusting both. Instead: EVERYTHING IS ESCAPED
 * FIRST, and the only tags in the output are the ones this file inserts itself.
 * There is no code path that lets a character the model wrote become markup.
 *
 * ── WHAT IS SUPPORTED, AND WHY ONLY THAT ────────────────────────────────────
 * Paragraphs, bullet and numbered lists, `code`, **bold**, *italic*, and headings
 * flattened to a bold line. That is what a model produces when asked for a short
 * answer with a few positions in it. Deliberately absent:
 *   • Raw HTML — escaped, always.
 *   • Links — the assistant has no web access, so any URL it writes came out of
 *     training data. Rendering it as a clickable link would dress up a guess as a
 *     citation, so `[text](url)` stays visible as text.
 *   • Tables — the panel is a narrow column. A stray table's rows are printed as
 *     plain lines with the separator row dropped, which reads acceptably instead
 *     of leaving `|---|---|` on screen.
 *
 * Pure string → string. Callers assign the result to innerHTML.
 */

/** Escape every character that could start markup. Runs before anything else. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Inline formatting, on already-escaped text.
 *
 * Code spans are lifted out first so that `**` inside `` `code` `` stays literal —
 * a model writing a snippet should see it rendered as written.
 *
 * The placeholder starts with a BARE `&`, which cannot collide with anything the
 * model wrote: `escapeHtml` has already turned every ampersand of its into
 * `&amp;`, so the only unescaped `&` left in the string is one this function put
 * there. A printable sentinel was chosen over a control character because control
 * characters are stripped upstream and invisible in a diff.
 */
function inline(escaped: string): string {
  const codes: string[] = [];
  let s = escaped.replace(/`([^`\n]+)`/g, (_m, code: string) => {
    codes.push(code);
    return `&#!${codes.length - 1}!#;`;
  });

  s = s.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  // Single asterisks only. `_snake_case_` is left alone on purpose — every tool in
  // this app is named that way, and italicising half of `list_positions` is worse
  // than not supporting underscore emphasis at all.
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');

  return s.replace(/&#!(\d+)!#;/g, (_m, i: string) => `<code>${codes[Number(i)] ?? ''}</code>`);
}

const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBERED = /^\s*\d+[.)]\s+(.*)$/;
const HEADING = /^\s{0,3}#{1,6}\s+(.*)$/;
/** A pipe table's separator row: `|---|:--:|`. Dropped, never rendered. */
const TABLE_RULE = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

/** Strip a table row's pipes so it reads as a line rather than as broken markup. */
function detable(line: string): string {
  if (!line.trim().startsWith('|')) return line;
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((c) => c.trim())
    .join(' · ');
}

/**
 * Render assistant text to HTML.
 *
 * Empty input yields an empty string rather than an empty paragraph, so a reply
 * that arrived with no text does not paint a blank bubble.
 */
export function renderAssistantMarkdown(raw: string): string {
  // Control characters go first: they are invisible on screen and a model has no
  // reason to emit one, so dropping them removes a class of confusing output.
  const clean = raw.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '');
  const lines = clean.split('\n');

  const out: string[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;

  const flushPara = (): void => {
    if (!para.length) return;
    out.push(`<p>${inline(escapeHtml(para.join(' ')))}</p>`);
    para = [];
  };
  const flushList = (): void => {
    if (!list) return;
    const items = list.items.map((i) => `<li>${inline(escapeHtml(i))}</li>`).join('');
    out.push(`<${list.tag}>${items}</${list.tag}>`);
    list = null;
  };
  const flush = (): void => {
    flushPara();
    flushList();
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, '');
    if (!line.trim()) {
      flush();
      continue;
    }
    // A table's separator row carries no content — drop it rather than print it.
    if (line.includes('-') && TABLE_RULE.test(line)) continue;

    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      // Flattened to a bold line: the panel is one narrow column and a model's `###`
      // is a label, not a document structure worth six sizes of type.
      out.push(`<p class="chat-h">${inline(escapeHtml(heading[1] ?? ''))}</p>`);
      continue;
    }

    const bullet = BULLET.exec(line);
    const numbered = bullet ? null : NUMBERED.exec(line);
    if (bullet || numbered) {
      flushPara();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      if (!list) list = { tag, items: [] };
      list.items.push((bullet?.[1] ?? numbered?.[1] ?? '').trim());
      continue;
    }

    // Inside a list, an unmarked line continues the previous item rather than
    // starting a paragraph — that is how a model wraps a long bullet.
    if (list && list.items.length) {
      const last = list.items.length - 1;
      list.items[last] = `${list.items[last]!} ${line.trim()}`;
      continue;
    }
    para.push(detable(line).trim());
  }
  flush();
  return out.join('');
}
