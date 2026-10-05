/**
 * "Set as default" for Appearance (CHAT-103): the user's own default look — light or dark, the
 * accent, the background colour, both brightness sliders — saved once and used everywhere.
 *
 * The look itself lives in localStorage, per device, on purpose (it is read before the first
 * paint, long before sync has answered). The DEFAULT is a synced key, `ui_look_default`, so it
 * reaches every device on the sync code. A device applies a default once, when it first sees it
 * (or a newer one): "set as default" means "make my devices look like this", while a later
 * change on one device stays that device's own. The "back to default" buttons go to this
 * default when there is one, and to the shipped look otherwise.
 */
import type { AppContext } from '../context.js';
import { onHydrated } from '../adapters/storage.js';
import {
  DEFAULT_ACCENT, DEFAULT_BACKDROP, applyAccent, applyBackdrop, applyTheme, applyTone,
  savedAccent, savedBackdrop, savedTone,
} from './theme.js';

export interface LookDefault {
  theme: 'dark' | 'light';
  accent: string;
  backdrop: string;
  toneDark: number;
  toneLight: number;
  /** When it was set (ms) — what tells a device it has a newer default to apply. */
  at: number;
}

const KEY = 'ui_look_default';
const MIRROR = 'ui_look_default';   // raw localStorage copy, readable before sync answers
const APPLIED = 'ui_look_applied';  // the `at` of the default this device last applied

function readMirror(): LookDefault | null {
  try {
    const v = JSON.parse(localStorage.getItem(MIRROR) ?? 'null') as LookDefault | null;
    return v && typeof v.accent === 'string' && typeof v.at === 'number' ? v : null;
  } catch {
    return null;
  }
}
function writeMirror(v: LookDefault | null): void {
  try {
    if (v) localStorage.setItem(MIRROR, JSON.stringify(v));
    else localStorage.removeItem(MIRROR);
  } catch { /* private mode */ }
}
function markApplied(at: number): void {
  try { localStorage.setItem(APPLIED, String(at)); } catch { /* private mode */ }
}

/** The user's default look, or null when they never set one. */
export function lookDefault(): LookDefault | null {
  return readMirror();
}

/** The look on screen now, as a default would record it. */
export function currentLook(): LookDefault {
  return {
    theme: document.documentElement.classList.contains('light') ? 'light' : 'dark',
    accent: savedAccent(), backdrop: savedBackdrop(),
    toneDark: savedTone('dark'), toneLight: savedTone('light'), at: Date.now(),
  };
}

/** What each "back to default" button goes back to. */
export const defaultAccent = (): string => lookDefault()?.accent ?? DEFAULT_ACCENT;
export const defaultBackdrop = (): string => lookDefault()?.backdrop ?? DEFAULT_BACKDROP;
export const defaultTone = (t: 'dark' | 'light'): number => (t === 'dark' ? lookDefault()?.toneDark : lookDefault()?.toneLight) ?? 0;

/** Paint a whole look. The accent last: it re-renders the open page, which then reads the rest. */
export function applyLook(v: LookDefault): void {
  applyTheme(v.theme);
  applyBackdrop(v.backdrop);
  applyTone('dark', v.toneDark);
  applyTone('light', v.toneLight);
  applyAccent(v.accent);
}

export async function saveLookDefault(ctx: AppContext): Promise<LookDefault> {
  const v = currentLook();
  writeMirror(v);
  markApplied(v.at);
  await ctx.storage.set(KEY, v);
  return v;
}

export async function clearLookDefault(ctx: AppContext): Promise<void> {
  writeMirror(null);
  await ctx.storage.set(KEY, null);
}

/** After the first sync: take in a default set on another device, and apply it once. */
export function initLookDefault(ctx: AppContext): void {
  onHydrated(() => {
    void ctx.storage.get<LookDefault | null>(KEY).then((v) => {
      const ok = v && typeof v.accent === 'string' && typeof v.at === 'number' ? v : null;
      writeMirror(ok);
      if (!ok) return;
      const applied = Number(localStorage.getItem(APPLIED) ?? 0);
      if (applied >= ok.at) return;
      markApplied(ok.at);
      applyLook(ok);
    }).catch(() => {});
  });
}
