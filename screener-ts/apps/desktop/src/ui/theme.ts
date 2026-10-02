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

/** No red: that is loss (`--down`). Jade is the one green, asked for in request 75, and is
 * kept apart from the mint gain colour (`--up` #18d89a / #0b8f69) by being deeper and
 * yellower on dark and forest-dark on cream; the panel still says so when it is picked. */
export const ACCENTS: readonly AccentPreset[] = [
  { id: 'violet', name: { en: 'Violet (default)', vi: 'Tím (mặc định)' }, dark: ['#8b6cff', '#5b8cff'], light: ['#6a3de8', '#3a6fe0'] },
  { id: 'indigo', name: { en: 'Indigo', vi: 'Chàm' }, dark: ['#6d7cff', '#a78bfa'], light: ['#4048d6', '#7c3aed'] },
  { id: 'allianz', name: { en: 'Allianz blue', vi: 'Xanh Allianz' }, dark: ['#4a7dff', '#7ea6ff'], light: ['#003781', '#1d5fd1'] },
  { id: 'sky', name: { en: 'Sky', vi: 'Xanh da trời' }, dark: ['#38bdf8', '#4d9bff'], light: ['#0369a1', '#1d5fd1'] },
  { id: 'fuchsia', name: { en: 'Fuchsia', vi: 'Hồng tím' }, dark: ['#e062d8', '#8b6cff'], light: ['#b02aa6', '#6a3de8'] },
  { id: 'jade', name: { en: 'Jade green', vi: 'Xanh ngọc bích' }, dark: ['#2fb36d', '#1fa39a'], light: ['#0d6b3f', '#0f6f6a'] },
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

// ── background brightness ────────────────────────────────────────────────────
// One slider per theme, kept on this device. 0 is the shipped look. Dark only goes up
// (the shipped canvas is already the darkest it should be); light goes both ways —
// dimmer for less glare, or brighter. Two things move together: the opaque tokens
// (`--bg`, `--card`, `--border`…) are mixed towards the target, and a fixed veil sits
// over the glowing canvas (`body::before`) but under the app (`z-index: 1`), so the
// many translucent glass panels drawn with literal rgba() lift with it for free.

export type ToneTheme = Theme;
export const TONE_RANGE: Record<ToneTheme, readonly [number, number]> = { dark: [0, 100], light: [-50, 50] };
const TONE_KEY: Record<ToneTheme, string> = { dark: 'ui_tone_dark', light: 'ui_tone_light' };

function clampTone(theme: ToneTheme, v: number): number {
  const [lo, hi] = TONE_RANGE[theme];
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : 0;
}

export function savedTone(theme: ToneTheme): number {
  try {
    return clampTone(theme, Number(localStorage.getItem(TONE_KEY[theme]) ?? 0));
  } catch {
    return 0;
  }
}

const mix = (base: string, to: string, pct: number): string => `color-mix(in srgb, ${base}, ${to} ${pct.toFixed(1)}%)`;

/** The CSS for a pair of slider values; empty when both are at the shipped look. */
export function toneCss(dark: number, light: number): string {
  let css = '';
  if (dark > 0) {
    const t = dark / 100;
    css +=
      `html:not(.light){--bg:${mix('#0d0d12', '#fff', 14 * t)};--surface:${mix('#121219', '#fff', 13 * t)};--card:${mix('#16161e', '#fff', 13 * t)};` +
      `--cardhover:${mix('#1e1e28', '#fff', 14 * t)};--border:${mix('#2d2d3b', '#fff', 16 * t)};--border-soft:${mix('#23232e', '#fff', 14 * t)};` +
      `--subtext:${mix('#b4b3c8', '#fff', 12 * t)};--faint:${mix('#8584a0', '#fff', 18 * t)}}` +
      `html:not(.light) body{background:${mix('#09090f', '#fff', 18 * t)}}` +
      `html:not(.light) body::after{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(170,168,210,${(0.2 * t).toFixed(3)})}`;
  }
  if (light < 0) {
    const t = -light / 50;
    css +=
      `html.light{--bg:${mix('#eae4db', '#8a7f70', 18 * t)};--surface:${mix('#f5f1ea', '#8a7f70', 12 * t)};--card:${mix('#fffdf9', '#8a7f70', 11 * t)}}` +
      `html.light body::after{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(70,58,40,${(0.28 * t).toFixed(3)})}`;
  } else if (light > 0) {
    const t = light / 50;
    css +=
      `html.light{--bg:${mix('#eae4db', '#fff', 45 * t)};--surface:${mix('#f5f1ea', '#fff', 50 * t)}}` +
      `html.light body::after{content:'';position:fixed;inset:0;z-index:0;pointer-events:none;background:rgba(255,255,255,${(0.45 * t).toFixed(3)})}`;
  }
  return css;
}

function paintTone(dark = savedTone('dark'), light = savedTone('light')): void {
  document.getElementById('tone-css')?.remove();
  const css = toneCss(dark, light);
  if (!css) return;
  const el = document.createElement('style');
  el.id = 'tone-css';
  el.textContent = css;
  document.head.appendChild(el);
}

/** While a slider is dragged: paint, do not save. */
export function previewTone(theme: ToneTheme, v: number): void {
  const other: ToneTheme = theme === 'dark' ? 'light' : 'dark';
  const pair = { [theme]: clampTone(theme, v), [other]: savedTone(other) } as Record<ToneTheme, number>;
  paintTone(pair.dark, pair.light);
}

/** Save one theme's value and repaint. No subscriber run: that re-renders the open page,
 *  which would yank the slider out from under the pointer; a chart picks the new
 *  tokens up the next time its page draws. */
export function applyTone(theme: ToneTheme, v: number): void {
  const val = clampTone(theme, v);
  try {
    if (val === 0) localStorage.removeItem(TONE_KEY[theme]);
    else localStorage.setItem(TONE_KEY[theme], String(val));
  } catch {
    /* ignore */
  }
  paintTone();
}

export function initTheme(): void {
  paintAccent(savedAccent());
  paintTone();
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
