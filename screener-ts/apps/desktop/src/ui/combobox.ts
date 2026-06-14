/**
 * Styled ticker combobox: a text input with a filtered, scrollable suggestion
 * panel. Replaces the native <datalist>, which is unstylable and (on some
 * webviews) only surfaces a few prefix matches. Substring-matches the symbol
 * list, keyboard-navigable, and calls `onPick` on selection.
 */
export interface ComboboxOptions {
  input: HTMLInputElement;
  options: string[];
  onPick?: (value: string) => void;
  max?: number;
}

export function attachCombobox({ input, options, onPick, max = 50 }: ComboboxOptions): void {
  const wrap = document.createElement('div');
  wrap.className = 'combo';
  input.parentNode!.insertBefore(wrap, input);
  wrap.appendChild(input);
  const panel = document.createElement('div');
  panel.className = 'combo-panel hidden';
  wrap.appendChild(panel);

  let active = -1;
  let matches: string[] = [];

  const render = () => {
    const q = input.value.trim().toUpperCase();
    matches = (q ? options.filter((o) => o.includes(q)) : options).slice(0, max);
    if (!matches.length) {
      panel.classList.add('hidden');
      return;
    }
    panel.innerHTML = matches
      .map((o, i) => `<div class="combo-item ${i === active ? 'active' : ''}" data-v="${o}">${o}</div>`)
      .join('');
    panel.classList.remove('hidden');
    panel.querySelectorAll<HTMLElement>('.combo-item').forEach((it) =>
      it.addEventListener('mousedown', (e) => {
        e.preventDefault(); // keep focus / fire before blur
        pick(it.dataset.v!);
      }),
    );
  };

  const pick = (v: string) => {
    input.value = v;
    panel.classList.add('hidden');
    active = -1;
    onPick?.(v);
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  input.addEventListener('focus', render);
  input.addEventListener('input', () => {
    active = -1;
    render();
  });
  input.addEventListener('blur', () => setTimeout(() => panel.classList.add('hidden'), 120));
  input.addEventListener('keydown', (e) => {
    if (panel.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      active = Math.min(active + 1, matches.length - 1);
      render();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      active = Math.max(active - 1, 0);
      render();
    } else if (e.key === 'Enter' && active >= 0) {
      e.preventDefault();
      pick(matches[active]!);
    }
  });
}
