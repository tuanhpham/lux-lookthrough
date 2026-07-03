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

const ALLOWED_TAGS = new Set([
  'B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'DIV', 'SPAN',
  'UL', 'OL', 'LI', 'H3', 'H4', 'A',
]);

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
          const col = elChild.getAttribute('color') || elChild.style.color;
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
        // Scrub attributes: keep safe color styling and http(s) links only.
        // Colour may come from a style property OR a legacy `color` attribute.
        const keepStyle = elChild.style.color
          ? `color:${elChild.style.color}`
          : (elChild.getAttribute('color') ? `color:${elChild.getAttribute('color')}` : '');
        const href = tag === 'A' ? elChild.getAttribute('href') ?? '' : '';
        for (const attr of Array.from(elChild.attributes)) elChild.removeAttribute(attr.name);
        if (keepStyle) elChild.setAttribute('style', keepStyle);
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

const COLORS = ['#e9edf4', '#18d89a', '#ff5266', '#ffb648', '#5b8cff', '#c084fc'];

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
          ${COLORS.map((c) => `<button type="button" class="rn-color" data-cmd="foreColor" data-arg="${c}" style="background:${c}" title="${c}"></button>`).join('')}
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
        editor.focus();
        // Emit inline CSS (<span style="color:…">) instead of legacy <font> tags.
        try { document.execCommand('styleWithCSS', false, 'true'); } catch { /* older engines */ }
        const cmd = b.dataset.cmd!;
        const arg = b.dataset.arg;
        // formatBlock toggles: if already a heading, revert to paragraph.
        if (cmd === 'formatBlock') {
          const isH = document.queryCommandValue('formatBlock').toUpperCase() === 'H3';
          document.execCommand('formatBlock', false, isH ? 'P' : 'H3');
        } else {
          document.execCommand(cmd, false, arg);
        }
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
