/** Dark/light theme toggle, persisted in localStorage. Charts read CSS vars at
 * creation, so subscribers re-draw any open charts on switch. */
import { pageTransition } from './transition.js';
export type Theme = 'dark' | 'light';

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

// ── accent colour ────────────────────────────────────────────────────────────
// The brand colour is two tokens per theme (`--accent`, `--accent2`); every wash, line,
// ring and gradient is mixed from them in styles.css, so overriding the pair repaints
// the whole app. Kept on this device like the theme itself.

export interface AccentPreset {
  id: string;
  name: { en: string; vi: string };
  /** [accent, accent2] on the near-black theme, then on cream. Light values are deeper
   * because the accent is also a TEXT colour there and must stay ≥4:1 on the card. */
  dark: [string, string];
  light: [string, string];
}

/** No green and no red: those are gain (`--up`) and loss (`--down`) and must stay unmistakable. */
export const ACCENTS: readonly AccentPreset[] = [
  { id: 'violet', name: { en: 'Violet (default)', vi: 'Tím (mặc định)' }, dark: ['#8b6cff', '#5b8cff'], light: ['#6a3de8', '#3a6fe0'] },
  { id: 'indigo', name: { en: 'Indigo', vi: 'Chàm' }, dark: ['#6d7cff', '#a78bfa'], light: ['#4048d6', '#7c3aed'] },
  { id: 'allianz', name: { en: 'Allianz blue', vi: 'Xanh Allianz' }, dark: ['#4a7dff', '#7ea6ff'], light: ['#003781', '#1d5fd1'] },
  { id: 'sky', name: { en: 'Sky', vi: 'Xanh da trời' }, dark: ['#38bdf8', '#4d9bff'], light: ['#0369a1', '#1d5fd1'] },
  { id: 'fuchsia', name: { en: 'Fuchsia', vi: 'Hồng tím' }, dark: ['#e062d8', '#8b6cff'], light: ['#b02aa6', '#6a3de8'] },
  { id: 'graphite', name: { en: 'Graphite', vi: 'Than chì' }, dark: ['#a3acc2', '#7d8ba8'], light: ['#3d4657', '#5b6b85'] },
];

export const DEFAULT_ACCENT = 'violet';
const ACCENT_KEY = 'accent';

/** A preset id or a `#rrggbb` the user picked; anything else reads as the default. */
export function savedAccent(): string {
  try {
    const v = localStorage.getItem(ACCENT_KEY) ?? '';
    if (/^#[0-9a-f]{6}$/i.test(v) || ACCENTS.some((a) => a.id === v)) return v;
  } catch {
    /* ignore */
  }
  return DEFAULT_ACCENT;
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, '0')).join('');
}

/** WCAG relative luminance. */
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** White text on the fill unless the fill is pale (sky, graphite on the dark theme). */
function inkFor(hex: string): string {
  return luminance(hex) > 0.36 ? '#0d0d12' : '#ffffff';
}

/** Hue in degrees, or null for a grey. Used to warn that a picked colour looks like gain/loss. */
export function hueOf(hex: string): number | null {
  const [r, g, b] = rgb(hex).map((c) => c / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  if (d < 0.08) return null;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

/** True when the colour would read as a gain (green) or a loss (red). */
export function clashesWithPnl(hex: string): boolean {
  const h = hueOf(hex);
  return h !== null && ((h >= 85 && h <= 170) || h <= 12 || h >= 348);
}

/**
 * The [accent, accent2] pair a choice resolves to in one theme. A picked colour is used
 * as-is on dark; on cream it is darkened until it clears 4:1 as text, and its partner
 * is the colour leaned towards the default blue so gradients keep two tones.
 */
export function accentPair(choice: string, theme: Theme): [string, string] {
  const preset = ACCENTS.find((a) => a.id === choice);
  if (preset) return theme === 'light' ? preset.light : preset.dark;
  let base = choice;
  if (theme === 'light') {
    // #fffdf9 card: 4:1 needs luminance ≤ ~0.22.
    for (let i = 0; i < 12 && luminance(base) > 0.2; i++) base = toHex(rgb(base).map((c) => c * 0.85) as [number, number, number]);
  }
  const partner = theme === 'light' ? [58, 111, 224] : [91, 140, 255];
  const mixed = rgb(base).map((c, i) => c * 0.6 + partner[i]! * 0.4) as [number, number, number];
  return [base, toHex(mixed)];
}

/** Paint a choice: one <style> that outranks both theme blocks (`:root:root` beats `html.light`). */
function paintAccent(choice: string): void {
  document.getElementById('accent-css')?.remove();
  if (choice === DEFAULT_ACCENT) return;
  const [d1, d2] = accentPair(choice, 'dark');
  const [l1, l2] = accentPair(choice, 'light');
  const el = document.createElement('style');
  el.id = 'accent-css';
  el.textContent =
    `:root:root{--accent:${d1};--accent2:${d2};--accent-ink:${inkFor(d1)}}` +
    `:root:root.light{--accent:${l1};--accent2:${l2};--accent-ink:${inkFor(l1)}}`;
  document.head.appendChild(el);
}

/** Save and apply a choice everywhere. Theme subscribers re-run so open charts repaint in it. */
export function applyAccent(choice: string): void {
  try {
    if (choice === DEFAULT_ACCENT) localStorage.removeItem(ACCENT_KEY);
    else localStorage.setItem(ACCENT_KEY, choice);
  } catch {
    /* ignore */
  }
  paintAccent(choice);
  const theme = current();
  subscribers.forEach((fn) => fn(theme));
}

export function initTheme(): void {
  paintAccent(savedAccent());
  let saved: Theme = 'dark';
  try {
    saved = localStorage.getItem('theme') === 'light' ? 'light' : 'dark';
  } catch {
    /* ignore */
  }
  applyTheme(saved);
  document
    .getElementById('theme-toggle')
    ?.addEventListener('click', (e) => {
      const next = current() === 'light' ? 'dark' : 'light';
      pageTransition(e.currentTarget as Element, () => applyTheme(next));
    });
}
