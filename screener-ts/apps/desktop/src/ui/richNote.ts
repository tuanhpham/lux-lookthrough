/**
 * Rich-text note editor dialog — a lightweight formatting surface for
 * transaction notes (bold / italic / underline, headings, bullet & numbered
 * lists, and text colour). Built on a `contenteditable` div + execCommand,
 * which works reliably in the Tauri WKWebView and every browser.
 *
 * Returns the sanitized HTML string on Save, or null on Cancel. The stored
 * HTML is a safe subset (see sanitizeNoteHtml) so it renders identically in the
 * table, the stock detail, and the exported HTML report — with no scripts.
 */

import { NOTE_COLORS, remapLegacyNoteColor } from '@screener/core';

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'STRIKE', 'BR', 'P', 'DIV', 'SPAN',
  'UL', 'OL', 'LI', 'H3', 'H4', 'A',
]);

/**
 * Apply a formatting command to the current selection inside `editor`.
 *
 * Bold / italic / underline / strikethrough are emitted as SEMANTIC TAGS
 * (`<b> <i> <u> <s>`) by turning `styleWithCSS` OFF — those tags render
 * natively and always survive sanitizeNoteHtml. Only colour needs inline CSS
 * (`<span style="color:…">`), so `styleWithCSS` is enabled just for foreColor.
 * This avoids the fragile round-trip where inline `font-style`/`text-decoration`
 * had to be re-parsed by the sanitizer (which silently dropped some engines'
 * output, so Italic/Underline appeared to "do nothing").
 */
function execFormat(editor: HTMLElement, cmd: string, arg?: string): void {
  editor.focus();
  const useCss = cmd === 'foreColor' || cmd === 'removeColor';
  try { document.execCommand('styleWithCSS', false, useCss ? 'true' : 'false'); } catch { /* older engines */ }
  if (cmd === 'removeColor') {
    // The reset swatch. There is no execCommand for "drop just the colour":
    // removeFormat would also strip bold/italic/lists from the selection. So
    // set the colour to the theme's own foreground, which the sanitizer then
    // recognises as "meant to inherit" and omits entirely — leaving other
    // formatting intact. Reading the variable at click time is what keeps this
    // correct in whichever theme is active.
    const themeText = getComputedStyle(document.documentElement)
      .getPropertyValue('--text')
      .trim();
    if (themeText) document.execCommand('foreColor', false, themeText);
    return;
  }
  if (cmd === 'formatBlock') {
    const isH = document.queryCommandValue('formatBlock').toUpperCase() === 'H3';
    document.execCommand('formatBlock', false, isH ? 'P' : 'H3');
  } else {
    document.execCommand(cmd, false, arg);
  }
}

/** Strip everything except a safe formatting subset; keep inline color + links. */
export function sanitizeNoteHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
  const walk = (node: Node): void => {
    const children = Array.from(node.childNodes);
    for (const child of children) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        let elChild = child as HTMLElement;
        let tag = elChild.tagName;
        // execCommand('foreColor') without styleWithCSS emits <font color="…">.
        // Convert it to an allowed <span style="color:…"> so the colour survives.
        if (tag === 'FONT') {
          const span = doc.createElement('span');
          const col = remapLegacyNoteColor(elChild.getAttribute('color') || elChild.style.color);
          if (col) span.style.color = col;
          while (elChild.firstChild) span.appendChild(elChild.firstChild);
          node.replaceChild(span, elChild);
          elChild = span;
          tag = 'SPAN';
        }
        if (!ALLOWED_TAGS.has(tag)) {
          // Unwrap disallowed elements — keep their text/children, drop the tag.
          while (elChild.firstChild) node.insertBefore(elChild.firstChild, elChild);
          node.removeChild(elChild);
          continue;
        }
        // Scrub attributes but PRESERVE safe inline formatting. execCommand with
        // styleWithCSS emits italic/underline/bold as inline styles (font-style,
        // text-decoration, font-weight) rather than tags, so we must keep those
        // — plus colour (from style or a legacy `color` attribute).
        const styleParts: string[] = [];
        // remapLegacyNoteColor rewrites colours saved from the OLD palette,
        // which included each theme's own --text. Baked into the HTML, those
        // turned invisible when the theme flipped (near-white note text on the
        // light theme's cream card). Doing it here — in the sanitizer every
        // render path already calls — means existing notes are fixed on sight,
        // with no migration pass and no edit required from the user. It returns
        // null for "should inherit", so the colour is simply omitted.
        const color = remapLegacyNoteColor(elChild.style.color || elChild.getAttribute('color'));
        if (color) styleParts.push(`color:${color}`);
        if (/italic/i.test(elChild.style.fontStyle)) styleParts.push('font-style:italic');
        if (/underline|line-through/i.test(elChild.style.textDecoration || elChild.style.textDecorationLine)) {
          const decos: string[] = [];
          const src = `${elChild.style.textDecoration} ${elChild.style.textDecorationLine}`;
          if (/underline/i.test(src)) decos.push('underline');
          if (/line-through/i.test(src)) decos.push('line-through');
          if (decos.length) styleParts.push(`text-decoration:${decos.join(' ')}`);
        }
        if (/^(bold|[6-9]00)$/i.test(elChild.style.fontWeight)) styleParts.push('font-weight:bold');
        const href = tag === 'A' ? elChild.getAttribute('href') ?? '' : '';
        for (const attr of Array.from(elChild.attributes)) elChild.removeAttribute(attr.name);
        if (styleParts.length) elChild.setAttribute('style', styleParts.join(';'));
        if (tag === 'A' && /^https?:\/\//i.test(href)) {
          elChild.setAttribute('href', href);
          elChild.setAttribute('target', '_blank');
          elChild.setAttribute('rel', 'noopener noreferrer');
        }
        walk(elChild);
      } else if (child.nodeType !== Node.TEXT_NODE) {
        node.removeChild(child);
      }
    }
  };
  walk(doc.body);
  return doc.body.innerHTML.trim();
}

/** True when the HTML has no visible content (empty / whitespace / bare <br>). */
export function isNoteEmpty(html: string | undefined | null): boolean {
  if (!html) return true;
  const text = html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim();
  return text.length === 0;
}

/**
 * Colour swatches for the toolbar. NOTE_COLORS[0] is null — the RESET swatch,
 * which strips the colour so the text follows the active theme. It replaces the
 * old first swatch (`#e9edf4`, the dark theme's --text): that one looked like
 * "default" in dark mode but was saved as a literal hex, so the note became
 * unreadable in light mode. "Default" must mean *inherit*, not a colour.
 */
function colorSwatches(vi: boolean): string {
  return NOTE_COLORS.map((c) =>
    c === null
      ? `<button type="button" class="rn-color rn-color-reset" data-cmd="removeColor" title="${
          vi ? 'Màu mặc định (theo giao diện)' : 'Default colour (follows the theme)'
        }"></button>`
      : `<button type="button" class="rn-color" data-cmd="foreColor" data-arg="${c}" style="background:${c}" title="${c}"></button>`,
  ).join('');
}

/** Toolbar + contenteditable HTML for an inline rich editor. `idPrefix` keeps
 * multiple editors on one page independent. Wire it with `wireRichEditor`. */
export function richEditorHtml(idPrefix: string, initialHtml: string, opts: { lang?: 'en' | 'vi'; minHeight?: number } = {}): string {
  const vi = opts.lang === 'vi';
  const mh = opts.minHeight ?? 90;
  const btn = (cmd: string, arg: string, label: string, tip: string): string =>
    `<button type="button" class="rn-tool" data-cmd="${cmd}"${arg ? ` data-arg="${arg}"` : ''} title="${tip}">${label}</button>`;
  return `<div class="rn-inline" data-rn="${idPrefix}">
    <div class="rn-toolbar">
      ${btn('bold', '', '<b>B</b>', vi ? 'Đậm' : 'Bold')}
      ${btn('italic', '', '<i>I</i>', vi ? 'Nghiêng' : 'Italic')}
      ${btn('underline', '', '<u>U</u>', vi ? 'Gạch dưới' : 'Underline')}
      ${btn('strikeThrough', '', '<s>S</s>', vi ? 'Gạch ngang' : 'Strikethrough')}
      <span class="rn-sep"></span>
      ${btn('formatBlock', 'H3', 'H', vi ? 'Tiêu đề' : 'Heading')}
      ${btn('insertUnorderedList', '', '• ', vi ? 'Danh sách' : 'Bullet list')}
      ${btn('insertOrderedList', '', '1.', vi ? 'Danh sách số' : 'Numbered list')}
      <span class="rn-sep"></span>
      ${colorSwatches(vi)}
      <span class="rn-sep"></span>
      ${btn('removeFormat', '', '⌫', vi ? 'Xóa định dạng' : 'Clear formatting')}
    </div>
    <div class="rn-editor field" data-rn-editor="${idPrefix}" contenteditable="true" spellcheck="false" style="min-height:${mh}px">${sanitizeNoteHtml(initialHtml || '')}</div>
  </div>`;
}

/** Wire an inline rich editor's toolbar. Returns a getter for its sanitized HTML. */
export function wireRichEditor(root: ParentNode, idPrefix: string): () => string {
  const editor = root.querySelector<HTMLElement>(`[data-rn-editor="${idPrefix}"]`)!;
  const wrap = root.querySelector<HTMLElement>(`[data-rn="${idPrefix}"]`)!;
  wrap.querySelectorAll<HTMLElement>('.rn-tool, .rn-color').forEach((b) => {
    b.addEventListener('mousedown', (e) => {
      e.preventDefault();
      execFormat(editor, b.dataset.cmd!, b.dataset.arg);
    });
  });
  return () => sanitizeNoteHtml(editor.innerHTML);
}

export function richNoteDialog(
  title: string,
  initialHtml: string,
  opts: { lang?: 'en' | 'vi' } = {},
): Promise<string | null> {
  const vi = opts.lang === 'vi';
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    const btn = (cmd: string, arg: string, label: string, tip: string): string =>
      `<button type="button" class="rn-tool" data-cmd="${cmd}"${arg ? ` data-arg="${arg}"` : ''} title="${tip}">${label}</button>`;
    host.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog rn-dialog">
        <div class="dialog-title">${title}</div>
        <div class="rn-toolbar">
          ${btn('bold', '', '<b>B</b>', vi ? 'Đậm' : 'Bold')}
          ${btn('italic', '', '<i>I</i>', vi ? 'Nghiêng' : 'Italic')}
          ${btn('underline', '', '<u>U</u>', vi ? 'Gạch dưới' : 'Underline')}
          ${btn('strikeThrough', '', '<s>S</s>', vi ? 'Gạch ngang' : 'Strikethrough')}
          <span class="rn-sep"></span>
          ${btn('formatBlock', 'H3', 'H', vi ? 'Tiêu đề' : 'Heading')}
          ${btn('insertUnorderedList', '', '• ', vi ? 'Danh sách' : 'Bullet list')}
          ${btn('insertOrderedList', '', '1.', vi ? 'Danh sách số' : 'Numbered list')}
          <span class="rn-sep"></span>
          ${colorSwatches(vi)}
          <span class="rn-sep"></span>
          ${btn('removeFormat', '', '⌫', vi ? 'Xóa định dạng' : 'Clear formatting')}
        </div>
        <div id="rn-editor" class="rn-editor field" contenteditable="true" spellcheck="false"></div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="cancel">${vi ? 'Hủy' : 'Cancel'}</button>
          <button class="btn" data-act="ok">${vi ? 'Lưu' : 'Save'}</button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const editor = host.querySelector<HTMLElement>('#rn-editor')!;
    editor.innerHTML = sanitizeNoteHtml(initialHtml || '');

    // Toolbar commands operate on the current selection inside the editor.
    host.querySelectorAll<HTMLElement>('.rn-tool, .rn-color').forEach((b) => {
      // mousedown (not click) so the editor keeps its selection/focus.
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        execFormat(editor, b.dataset.cmd!, b.dataset.arg);
      });
    });

    const close = (result: string | null): void => {
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const save = (): void => {
      const html = sanitizeNoteHtml(editor.innerHTML);
      close(isNoteEmpty(html) ? '' : html);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') close(null);
      // Ctrl/Cmd+Enter saves; plain Enter stays in the editor for new lines.
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    };

    host.querySelector('[data-act="cancel"]')!.addEventListener('click', () => close(null));
    host.querySelector('[data-act="ok"]')!.addEventListener('click', save);
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKey);
    requestAnimationFrame(() => editor.focus());
  });
}
