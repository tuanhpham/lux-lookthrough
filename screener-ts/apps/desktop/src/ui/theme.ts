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
/**
 * Light and dark can each have their own colour and background (CHAT-104). The original keys
 * (`accent`, `ui_backdrop`) stay what they always were — the choice, used by both themes — and
 * the light theme reads its own key first when one exists. A device that never chose separately
 * is unchanged.
 */
const ACCENT_LIGHT_KEY = 'accent_light';

/** Which theme(s) a choice is saved for. */
export type LookScope = 'both' | Theme;

function readChoice(key: string, ok: (v: string) => boolean): string | null {
  try {
    const v = localStorage.getItem(key) ?? '';
    return ok(v) ? v : null;
  } catch {
    return null;
  }
}
function writeChoice(key: string, v: string | null): void {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v);
  } catch {
    /* ignore */
  }
}
const isAccent = (v: string): boolean => /^#[0-9a-f]{6}$/i.test(v) || ACCENTS.some((a) => a.id === v);

/** A preset id or a `#rrggbb` the user picked; anything else reads as the default. */
export function savedAccent(theme: Theme = 'dark'): string {
  const both = readChoice(ACCENT_KEY, isAccent) ?? DEFAULT_ACCENT;
  return theme === 'light' ? readChoice(ACCENT_LIGHT_KEY, isAccent) ?? both : both;
}

/** Whether the light theme has a colour of its own. */
export function accentSplit(): boolean {
  return readChoice(ACCENT_LIGHT_KEY, isAccent) !== null;
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

/** Paint the choices: one <style> that outranks both theme blocks (`:root:root` beats `html.light`). */
function paintAccent(dark = savedAccent('dark'), light = savedAccent('light')): void {
  document.getElementById('accent-css')?.remove();
  if (dark === DEFAULT_ACCENT && light === DEFAULT_ACCENT) return;
  const [d1, d2] = accentPair(dark, 'dark');
  const [l1, l2] = accentPair(light, 'light');
  const el = document.createElement('style');
  el.id = 'accent-css';
  el.textContent =
    (dark !== DEFAULT_ACCENT ? `:root:root{--accent:${d1};--accent2:${d2};--accent-ink:${inkFor(d1)}}` : '') +
    (light !== DEFAULT_ACCENT ? `:root:root.light{--accent:${l1};--accent2:${l2};--accent-ink:${inkFor(l1)}}` : '');
  document.head.appendChild(el);
}

/**
 * Save `choice` for one theme or both. Choosing for dark alone first freezes light on what it
 * shows now, so changing one theme never drags the other along.
 */
function saveSplit(keyBoth: string, keyLight: string, choice: string, isDefault: boolean, scope: LookScope, lightNow: string): void {
  if (scope === 'both') {
    writeChoice(keyBoth, isDefault ? null : choice);
    writeChoice(keyLight, null);
  } else if (scope === 'dark') {
    writeChoice(keyLight, lightNow);
    writeChoice(keyBoth, isDefault ? null : choice);
  } else {
    writeChoice(keyLight, choice);
  }
}

/** Save and apply a choice. Theme subscribers re-run so open charts repaint in it. */
export function applyAccent(choice: string, scope: LookScope = 'both'): void {
  saveSplit(ACCENT_KEY, ACCENT_LIGHT_KEY, choice, choice === DEFAULT_ACCENT, scope, savedAccent('light'));
  paintAccent();
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

// ── Background colour (CHAT-101: "Background color hien khong change duoc") ───────
//
// The brightness sliders above lift or dim the room; this changes its COLOUR — the six glows of
// the liquid canvas (`body::before`) and its base. A preset is a pair: glows for the dark room
// and for the light one, so one choice reads right in both themes. "Your own" builds both from
// one colour (the glows in that hue, a neighbour hue for depth). Panels are glass over the room,
// so they pick the tint up without being touched.

export interface BackdropPreset {
  id: string;
  name: { en: string; vi: string };
  /** Six glow colours as "r,g,b,alpha", in the canvas's fixed glow order, then the base pair. */
  dark: { glows: readonly string[]; base: readonly [string, string] };
  light: { glows: readonly string[]; base: readonly [string, string] };
}

export const BACKDROPS: readonly BackdropPreset[] = [
  { id: 'aurora', name: { en: 'Aurora (default)', vi: 'Cực quang (mặc định)' },
    dark: { glows: ['132,96,255,.46', '52,128,255,.34', '110,70,230,.16', '20,200,176,.26', '226,70,168,.24', '255,150,80,.12'], base: ['#0e0c1a', '#07070c'] },
    light: { glows: ['255,196,150,.92', '176,226,196,.88', '216,204,255,.55', '180,206,252,.92', '250,190,214,.78', '255,255,255,.6'], base: ['#f3e9de', '#e6ddd2'] } },
  { id: 'ocean', name: { en: 'Ocean', vi: 'Đại dương' },
    dark: { glows: ['40,120,255,.44', '20,190,230,.32', '60,90,230,.18', '20,180,170,.26', '90,80,240,.2', '80,170,255,.12'], base: ['#0a1020', '#05070d'] },
    light: { glows: ['180,210,255,.92', '186,236,240,.88', '210,220,255,.6', '170,214,246,.92', '200,206,255,.75', '255,255,255,.6'], base: ['#e8eef6', '#dbe4ee'] } },
  { id: 'forest', name: { en: 'Jade forest', vi: 'Rừng ngọc' },
    dark: { glows: ['30,190,120,.4', '20,160,170,.3', '60,140,90,.16', '120,200,80,.22', '20,120,140,.22', '200,190,80,.1'], base: ['#08140f', '#050a08'] },
    light: { glows: ['190,234,200,.92', '186,226,222,.86', '214,236,200,.6', '206,236,184,.9', '180,220,214,.78', '255,255,255,.6'], base: ['#ecf2e8', '#dfe8dc'] } },
  { id: 'sunset', name: { en: 'Sunset', vi: 'Hoàng hôn' },
    dark: { glows: ['255,120,60,.36', '230,70,120,.3', '180,60,120,.16', '255,170,60,.22', '150,60,200,.24', '255,200,120,.12'], base: ['#160c0c', '#0a0607'] },
    light: { glows: ['255,200,160,.94', '255,184,196,.86', '255,214,190,.6', '255,220,170,.92', '236,196,236,.76', '255,255,255,.6'], base: ['#f6ebe2', '#ecdfd4'] } },
  { id: 'rose', name: { en: 'Rose', vi: 'Hồng' },
    dark: { glows: ['236,72,153,.38', '168,85,247,.3', '200,60,120,.16', '244,114,182,.22', '120,70,230,.22', '255,160,180,.12'], base: ['#150a12', '#09060a'] },
    light: { glows: ['252,196,222,.92', '226,200,250,.86', '250,210,226,.6', '250,206,230,.9', '214,204,252,.76', '255,255,255,.6'], base: ['#f6eaef', '#ecdfe6'] } },
  { id: 'graphite', name: { en: 'Graphite', vi: 'Than chì' },
    dark: { glows: ['150,150,170,.18', '120,130,150,.14', '100,100,120,.08', '130,140,150,.12', '140,130,150,.1', '170,170,180,.06'], base: ['#0f0f12', '#08080a'] },
    light: { glows: ['226,224,220,.9', '218,220,222,.85', '230,228,232,.5', '214,218,222,.88', '226,222,226,.7', '255,255,255,.6'], base: ['#efedea', '#e4e2de'] } },
];
export const DEFAULT_BACKDROP = 'aurora';
const BACKDROP_KEY = 'ui_backdrop';
const BACKDROP_LIGHT_KEY = 'ui_backdrop_light';

/** The canvas's fixed glow geometry, the same six spots as the shipped room. */
const GLOW_AT: Record<'dark' | 'light', readonly string[]> = {
  dark: ['42% 38% at 12% 8%', '36% 34% at 88% 12%', '30% 30% at 56% 40%', '44% 40% at 82% 92%', '38% 36% at 8% 88%', '26% 24% at 40% 96%'],
  light: ['44% 40% at 10% 6%', '40% 38% at 90% 10%', '34% 32% at 58% 42%', '46% 42% at 78% 94%', '40% 40% at 6% 92%', '28% 26% at 36% 70%'],
};

function hueShift(hex: string, deg: number): string {
  const [r, g, b] = rgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  let h = 0;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  if (d) h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h = (h * 60 + deg + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return toHex([Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)]);
}

/** A whole preset from one colour: glows in its hue and a neighbour's, bases tinted by it. */
export function backdropFromColour(hex: string): BackdropPreset {
  const a = rgb(hex).join(','), b = rgb(hueShift(hex, 40)).join(','), c = rgb(hueShift(hex, -35)).join(',');
  const pale = (h: string, k: number): string => rgb(toHex(rgb(h).map((v) => Math.round(v + (255 - v) * k)) as [number, number, number])).join(',');
  return {
    id: hex, name: { en: 'Your own', vi: 'Màu riêng' },
    dark: { glows: [`${a},.42`, `${b},.3`, `${a},.15`, `${c},.24`, `${b},.2`, `${c},.1`],
      base: [toHex(rgb(hex).map((v) => Math.round(v * 0.1 + 8)) as [number, number, number]), '#07070c'] },
    light: { glows: [`${pale(hex, 0.62)},.92`, `${pale(hueShift(hex, 40), 0.66)},.86`, `${pale(hex, 0.75)},.55`, `${pale(hueShift(hex, -35), 0.64)},.9`, `${pale(hueShift(hex, 40), 0.72)},.75`, '255,255,255,.6'],
      base: [toHex(rgb(hex).map((v) => Math.round(242 + (v - 242) * 0.06)) as [number, number, number]), toHex(rgb(hex).map((v) => Math.round(228 + (v - 228) * 0.08)) as [number, number, number])] },
  };
}

const isBackdrop = (v: string): boolean => BACKDROPS.some((b) => b.id === v) || /^#[0-9a-f]{6}$/i.test(v);

export function savedBackdrop(theme: Theme = 'dark'): string {
  const both = readChoice(BACKDROP_KEY, isBackdrop) ?? DEFAULT_BACKDROP;
  return theme === 'light' ? readChoice(BACKDROP_LIGHT_KEY, isBackdrop) ?? both : both;
}

export function backdropSplit(): boolean {
  return readChoice(BACKDROP_LIGHT_KEY, isBackdrop) !== null;
}

export function backdropOf(choice: string): BackdropPreset {
  return BACKDROPS.find((b) => b.id === choice) ?? (/^#[0-9a-f]{6}$/i.test(choice) ? backdropFromColour(choice) : BACKDROPS[0]!);
}

/** The CSS for a choice per theme; empty for the shipped room. */
export function backdropCss(dark: string, light: string = dark): string {
  const layer = (choice: string, t: 'dark' | 'light'): string => {
    const p = backdropOf(choice);
    return [...p[t].glows.map((g, i) => `radial-gradient(${GLOW_AT[t][i]}, rgba(${g}), transparent 70%)`), `linear-gradient(160deg, ${p[t].base[0]}, ${p[t].base[1]})`].join(',');
  };
  // `:root` doubled the way the accent block does, so this outranks the stylesheet's own room
  // whichever order the two land in <head>.
  return (dark !== DEFAULT_BACKDROP ? `html:root:not(.light) body::before{background:${layer(dark, 'dark')}}` : '')
    + (light !== DEFAULT_BACKDROP ? `html:root.light body::before{background:${layer(light, 'light')}}` : '');
}

function paintBackdrop(dark = savedBackdrop('dark'), light = savedBackdrop('light')): void {
  document.getElementById('backdrop-css')?.remove();
  const css = backdropCss(dark, light);
  if (!css) return;
  const el = document.createElement('style');
  el.id = 'backdrop-css';
  el.textContent = css;
  // Before the tone veil, so the brightness sliders still lay over whichever colour is chosen.
  const tone = document.getElementById('tone-css');
  if (tone) document.head.insertBefore(el, tone); else document.head.appendChild(el);
}

/** Paint without saving (a colour being dragged), for the scope being edited. */
export function previewBackdrop(choice: string, scope: LookScope = 'both'): void {
  paintBackdrop(scope === 'light' ? savedBackdrop('dark') : choice, scope === 'dark' ? savedBackdrop('light') : choice);
}

export function applyBackdrop(choice: string, scope: LookScope = 'both'): void {
  saveSplit(BACKDROP_KEY, BACKDROP_LIGHT_KEY, choice, choice === DEFAULT_BACKDROP, scope, savedBackdrop('light'));
  paintBackdrop();
}

export function initTheme(): void {
  paintAccent();
  paintBackdrop();
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
