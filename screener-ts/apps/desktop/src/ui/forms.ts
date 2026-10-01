/**
 * Lightweight in-app form dialog. Replaces window.prompt(), which is unreliable
 * / blocked in the Tauri WKWebView (and ugly everywhere). Returns the entered
 * values, or null if cancelled.
 */
export interface Field {
  key: string;
  label: string;
  /** 'info' renders a read-only display div — excluded from the returned values. */
  type?: 'text' | 'number' | 'date' | 'select' | 'info';
  value?: string;
  placeholder?: string;
  /**
   * Choices for a 'select'.
   *
   * `group` is optional and, when present, wraps consecutive same-group options in an
   * `<optgroup>` — added for the exit-reason vocabulary, which is thirty-odd rows in seven
   * groups and unreadable as one flat list. Rows with no `group` render at the top level, so
   * every existing caller is unaffected and a "— none —" row can sit above the groups.
   */
  options?: { value: string; label: string; group?: string }[];
  /**
   * Return the text exactly as typed. Every other field has its FIRST comma turned into a
   * dot, which suits "185,50" and breaks "250,000,000" into "250.000,000" — so a field whose
   * caller parses separators itself (a VND balance) opts out.
   */
  raw?: boolean;
}

/** Option labels are user text (custom exit reasons), so they are escaped rather than trusted. */
function escOpt(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function optionsHtml(f: Field): string {
  const one = (o: { value: string; label: string }): string =>
    `<option value="${escOpt(o.value)}"${o.value === f.value ? ' selected' : ''}>${escOpt(o.label)}</option>`;
  let html = '';
  let open = '';
  for (const o of f.options ?? []) {
    const g = o.group ?? '';
    if (g !== open) {
      if (open) html += '</optgroup>';
      if (g) html += `<optgroup label="${escOpt(g)}">`;
      open = g;
    }
    html += one(o);
  }
  if (open) html += '</optgroup>';
  return html;
}

export interface FormDialogOptions {
  /** Called whenever any field changes. Return a partial record to overwrite
   * specific field values live (e.g. auto-fill price when date changes).
   * 'info' field values are set as innerHTML so they can contain HTML. */
  onChange?: (values: Record<string, string>) => Partial<Record<string, string>> | void;
  /** Extra class on `.dialog`, for a dialog that lays its fields out itself. */
  className?: string;
  /** An icon tile and a one-line sub under the title (both trusted HTML). */
  icon?: string;
  sub?: string;
}

export function formDialog(title: string, fields: Field[], opts: FormDialogOptions = {}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog${opts.className ? ' ' + opts.className : ''}">
        ${
          opts.icon || opts.sub
            ? `<div class="dialog-head">${opts.icon ? `<span class="dialog-ic">${opts.icon}</span>` : ''}<div>
                <div class="dialog-title">${title}</div>${opts.sub ? `<div class="dialog-sub">${opts.sub}</div>` : ''}
              </div></div>`
            : `<div class="dialog-title">${title}</div>`
        }
        <div class="dialog-body">
          ${fields
            .map(
              (f) => {
                if (f.type === 'select' && f.options) {
                  return `<div class="dialog-f" data-f="${f.key}"><label class="field-label">${f.label}</label>
                    <select class="field dialog-field" data-key="${f.key}">${optionsHtml(f)}</select></div>`;
                }
                if (f.type === 'info') {
                  return `<div class="dialog-f dialog-f--info" data-f="${f.key}">${f.label ? `<label class="field-label">${f.label}</label>` : ''}
                    <div class="dialog-info dialog-field" data-key="${f.key}" data-type="info">${f.value ?? ''}</div></div>`;
                }
                // Use type="text" with inputmode="decimal" for number fields so that
                // iOS WKWebView returns the typed value reliably (type="number" has a
                // known Safari bug where .value can return '' for valid decimal input).
                const isNum = f.type === 'number';
                return `<div class="dialog-f" data-f="${f.key}"><label class="field-label">${f.label}</label>
                  <input class="field dialog-field" data-key="${f.key}"${f.raw ? ' data-raw="1"' : ''}
                    type="${isNum ? 'text' : (f.type ?? 'text')}"
                    ${isNum ? 'inputmode="decimal" autocorrect="off" autocapitalize="off"' : ''}
                    value="${f.value ?? ''}" placeholder="${f.placeholder ?? ''}" /></div>`;
              }
            )
            .join('')}
        </div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="cancel">Cancel</button>
          <button class="btn" data-act="ok">Save</button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const allFields = Array.from(host.querySelectorAll<HTMLElement>('.dialog-field'));
    // Focusable inputs (not info divs)
    const inputs = allFields.filter((el) => el.dataset.type !== 'info') as HTMLInputElement[];
    inputs[0]?.focus();

    if (opts.onChange) {
      const onChange = opts.onChange;
      const handleChange = () => {
        const current: Record<string, string> = {};
        for (const el of allFields) {
          if (el.dataset.type === 'info') continue;
          // Normalize comma decimal separator so onChange receives parseable values
          // on locales/keyboards that produce "185,50" instead of "185.50".
          const v = (el as HTMLInputElement).value;
          current[el.dataset.key!] = el.dataset.raw ? v : v.replace(',', '.');
        }
        const overrides = onChange(current);
        if (overrides) {
          for (const el of allFields) {
            const key = el.dataset.key!;
            if (!(key in overrides)) continue;
            const val = overrides[key] ?? '';
            if (el.dataset.type === 'info') {
              el.innerHTML = val;
            } else {
              (el as HTMLInputElement).value = val;
            }
          }
        }
      };
      // Fire on both 'input' (every keystroke) and 'change' (blur / select change).
      for (const el of allFields) {
        if (el.dataset.type === 'info') continue;
        el.addEventListener('input', handleChange);
        el.addEventListener('change', handleChange);
      }
    }

    const close = (result: Record<string, string> | null) => {
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const submit = () => {
      const out: Record<string, string> = {};
      for (const el of allFields) {
        if (el.dataset.type === 'info') continue; // exclude display-only fields
        // Normalize comma decimal separator (iOS/European keyboards send "185,50")
        const v = (el as HTMLInputElement).value.trim();
        out[el.dataset.key!] = el.dataset.raw ? v : v.replace(',', '.');
      }
      close(out);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close(null);
      if (e.key === 'Enter') submit();
    };

    host.querySelector('[data-act="cancel"]')!.addEventListener('click', () => close(null));
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => close(null));
    host.querySelector('[data-act="ok"]')!.addEventListener('click', submit);
    document.addEventListener('keydown', onKey);
  });
}
