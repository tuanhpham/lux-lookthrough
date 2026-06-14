/**
 * Lightweight in-app form dialog. Replaces window.prompt(), which is unreliable
 * / blocked in the Tauri WKWebView (and ugly everywhere). Returns the entered
 * values, or null if cancelled.
 */
export interface Field {
  key: string;
  label: string;
  type?: 'text' | 'number';
  value?: string;
  placeholder?: string;
}

export function formDialog(title: string, fields: Field[]): Promise<Record<string, string> | null> {
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
              (f) => `
            <label class="field-label">${f.label}</label>
            <input class="field dialog-field" data-key="${f.key}" type="${f.type ?? 'text'}"
              value="${f.value ?? ''}" placeholder="${f.placeholder ?? ''}" ${f.type === 'number' ? 'step="any"' : ''} />`,
            )
            .join('')}
        </div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="cancel">Cancel</button>
          <button class="btn" data-act="ok">Save</button>
        </div>
      </div>`;
    document.body.appendChild(host);

    const inputs = Array.from(host.querySelectorAll<HTMLInputElement>('.dialog-field'));
    inputs[0]?.focus();

    const close = (result: Record<string, string> | null) => {
      host.remove();
      document.removeEventListener('keydown', onKey);
      resolve(result);
    };
    const submit = () => {
      const out: Record<string, string> = {};
      for (const i of inputs) out[i.dataset.key!] = i.value.trim();
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
