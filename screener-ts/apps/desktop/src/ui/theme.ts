/** Dark/light theme toggle, persisted in localStorage. Charts read CSS vars at
 * creation, so subscribers re-draw any open charts on switch. */
type Theme = 'dark' | 'light';

const subscribers: Array<(t: Theme) => void> = [];

function current(): Theme {
  return document.documentElement.classList.contains('light') ? 'light' : 'dark';
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('light', theme === 'light');
  document.documentElement.classList.toggle('dark', theme !== 'light');
  try {
    localStorage.setItem('theme', theme);
  } catch {
    /* ignore */
  }
  const btn = document.getElementById('theme-toggle');
  if (btn) btn.textContent = theme === 'light' ? '☀️' : '🌙';
  subscribers.forEach((fn) => fn(theme));
}

export function onThemeChange(fn: (t: Theme) => void): void {
  subscribers.push(fn);
}

export function initTheme(): void {
  let saved: Theme = 'dark';
  try {
    saved = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    /* ignore */
  }
  applyTheme(saved);
  document
    .getElementById('theme-toggle')
    ?.addEventListener('click', () => applyTheme(current() === 'light' ? 'dark' : 'light'));
}
