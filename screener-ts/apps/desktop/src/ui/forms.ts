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
  options?: { value: string; label: string }[];
}

export interface FormDialogOptions {
  /** Called whenever any field changes. Return a partial record to overwrite
   * specific field values live (e.g. auto-fill price when date changes).
   * 'info' field values are set as innerHTML so they can contain HTML. */
  onChange?: (values: Record<string, string>) => Partial<Record<string, string>> | void;
}

export function formDialog(title: string, fields: Field[], opts: FormDialogOptions = {}): Promise<Record<string, string> | null> {
  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `
      <div class="dialog-backdrop"></div>
      <div class="dialog">
        <div class="dialog-title">${title}</div>
        <div class="dialog-body">
          ${fields
            .map(
              (f) => {
                if (f.type === 'select' && f.options) {
                  const optHtml = f.options.map((o) =>
                    `<option value="${o.value}"${o.value === f.value ? ' selected' : ''}>${o.label}</option>`
                  ).join('');
                  return `<label class="field-label">${f.label}</label>
                    <select class="field dialog-field" data-key="${f.key}">${optHtml}</select>`;
                }
                if (f.type === 'info') {
                  return `${f.label ? `<label class="field-label">${f.label}</label>` : ''}
                    <div class="dialog-info dialog-field" data-key="${f.key}" data-type="info">${f.value ?? ''}</div>`;
                }
                // Use type="text" with inputmode="decimal" for number fields so that
                // iOS WKWebView returns the typed value reliably (type="number" has a
                // known Safari bug where .value can return '' for valid decimal input).
                const isNum = f.type === 'number';
                return `<label class="field-label">${f.label}</label>
                  <input class="field dialog-field" data-key="${f.key}"
                    type="${isNum ? 'text' : (f.type ?? 'text')}"
                    ${isNum ? 'inputmode="decimal" autocorrect="off" autocapitalize="off"' : ''}
                    value="${f.value ?? ''}" placeholder="${f.placeholder ?? ''}" />`;
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
          current[el.dataset.key!] = (el as HTMLInputElement).value.replace(',', '.');
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
        out[el.dataset.key!] = (el as HTMLInputElement).value.trim().replace(',', '.');
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
