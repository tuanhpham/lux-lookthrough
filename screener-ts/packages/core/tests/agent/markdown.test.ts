import { describe, it, expect } from 'vitest';
import { renderAssistantMarkdown as md } from '../../src/agent/markdown.js';

describe('nothing the model writes becomes markup', () => {
  // This output goes into innerHTML and the model was reading tool output, web
  // content and whatever the user pasted. Escaping is the whole security model.
  it('escapes a script tag instead of running it', () => {
    const out = md('<script>alert(1)</script>');
    expect(out).not.toContain('<script');
    expect(out).toContain('&lt;script&gt;');
  });

  it('escapes an image with an onerror handler', () => {
    const out = md('<img src=x onerror="alert(1)">');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;img');
    expect(out).toContain('&quot;');
  });

  it('escapes markup smuggled inside a code span or a bullet', () => {
    expect(md('`<b>hi</b>`')).toBe('<p><code>&lt;b&gt;hi&lt;/b&gt;</code></p>');
    expect(md('- <iframe src="evil"></iframe>')).not.toContain('<iframe');
  });

  it('escapes markup inside bold and heading text', () => {
    expect(md('**<b>x</b>**')).toBe('<p><strong>&lt;b&gt;x&lt;/b&gt;</strong></p>');
    expect(md('# <b>x</b>')).toContain('&lt;b&gt;');
  });

  it('emits only the tags this renderer inserts', () => {
    const out = md('# H\n\ntext with <div> and **bold**\n\n- a\n\n1. b\n\n`code`');
    const tags = [...out.matchAll(/<\/?([a-z0-9]+)/g)].map((m) => m[1]);
    expect(new Set(tags)).toEqual(new Set(['p', 'strong', 'ul', 'li', 'ol', 'code']));
  });

  it('cannot be tricked into restoring a fake code placeholder', () => {
    // The placeholder starts with a bare `&`, and every ampersand the model wrote
    // is already `&amp;` by then — so a literal one in its text stays text.
    const out = md('&#!0!#; and `real`');
    expect(out).toContain('&amp;#!0!#;');
    expect(out).toContain('<code>real</code>');
  });
});

describe('the formatting a model actually uses', () => {
  it('renders paragraphs', () => {
    expect(md('First line.\n\nSecond line.')).toBe('<p>First line.</p><p>Second line.</p>');
  });

  it('joins a soft-wrapped paragraph into one', () => {
    expect(md('a sentence\nwrapped by the model')).toBe('<p>a sentence wrapped by the model</p>');
  });

  it('renders bullet lists, in either marker', () => {
    expect(md('- one\n* two\n• three')).toBe('<ul><li>one</li><li>two</li><li>three</li></ul>');
  });

  it('renders numbered lists', () => {
    expect(md('1. one\n2) two')).toBe('<ol><li>one</li><li>two</li></ol>');
  });

  it('continues a wrapped bullet rather than starting a paragraph', () => {
    expect(md('- NVDA 100 shares,\n  up 12%')).toBe('<ul><li>NVDA 100 shares, up 12%</li></ul>');
  });

  it('closes one list before opening a different kind', () => {
    expect(md('- a\n1. b')).toBe('<ul><li>a</li></ul><ol><li>b</li></ol>');
  });

  it('renders bold, italic and code', () => {
    expect(md('**bold** and *italic* and `code`')).toBe(
      '<p><strong>bold</strong> and <em>italic</em> and <code>code</code></p>',
    );
  });

  it('leaves ** inside a code span literal', () => {
    // A model showing a snippet should see it rendered as written.
    expect(md('`a ** b`')).toBe('<p><code>a ** b</code></p>');
  });

  it('leaves snake_case alone', () => {
    // Every tool in this app is named that way; italicising half of
    // `list_positions` is worse than not supporting underscore emphasis.
    expect(md('call list_positions then get_account_summary')).toBe(
      '<p>call list_positions then get_account_summary</p>',
    );
  });

  it('flattens headings to one bold line', () => {
    expect(md('## Positions')).toBe('<p class="chat-h">Positions</p>');
    expect(md('###### deep')).toBe('<p class="chat-h">deep</p>');
  });
});

describe('what it deliberately does not do', () => {
  it('leaves a link as text, because the assistant has no web access', () => {
    // Any URL it writes came out of training data. Making it clickable would dress
    // up a guess as a citation.
    const out = md('see [the filing](https://example.com/10k)');
    expect(out).not.toContain('<a ');
    expect(out).toContain('[the filing](https://example.com/10k)');
  });

  it('prints a stray table as lines and drops its separator row', () => {
    const out = md('| Ticker | Qty |\n|---|---:|\n| NVDA | 100 |');
    expect(out).not.toContain('|---|');
    expect(out).toContain('Ticker · Qty');
    expect(out).toContain('NVDA · 100');
  });

  it('does not mistake a bullet for a table rule', () => {
    expect(md('- a-b\n- c')).toBe('<ul><li>a-b</li><li>c</li></ul>');
  });
});

describe('the edges that would paint a broken bubble', () => {
  it('renders nothing for empty or blank input', () => {
    expect(md('')).toBe('');
    expect(md('   \n\n  ')).toBe('');
  });

  it('normalises CRLF, so a Windows reply is not one long line', () => {
    expect(md('a\r\n\r\nb')).toBe('<p>a</p><p>b</p>');
  });

  it('strips control characters but keeps the newlines', () => {
    // The strip class must exclude 0x0a — the next thing the renderer does is split
    // on it, and a class that ate it would collapse every reply into one paragraph.
    const ctl = (code: number): string => String.fromCharCode(code);
    expect(md(`a${ctl(1)}b\n\nsecond${ctl(7)}line`)).toBe(
      '<p>ab</p><p>secondline</p>',
    );
    expect(md(`a${ctl(127)}b`)).toBe('<p>ab</p>');
  });

  it('survives unbalanced markers without emitting a half-open tag', () => {
    for (const raw of ['**unclosed bold', '`unclosed code', '*one', '###', '|', '- ']) {
      const out = md(raw);
      const open = (out.match(/</g) ?? []).length;
      const close = (out.match(/>/g) ?? []).length;
      expect(open).toBe(close);
    }
  });
});
