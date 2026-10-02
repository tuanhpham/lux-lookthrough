/**
 * Publish the user's watchlist alerts to the scanner bridge (`scanner:alerts`).
 *
 * The rules and the digest shape live in alertRules.ts; this file is the plumbing,
 * the same way positionsFeed.ts is: read the config and the lists, send only when
 * the digest changed, at most once per 10 seconds with a trailing call, refuse
 * before hydration, never throw. It runs after every watchlist save and every
 * alert-settings save, so it must cost nothing when nothing alert-related moved.
 *
 * REFUSES BEFORE HYDRATION: until the first pull lands, the lists on this device
 * may be the empty seed, and publishing that would switch every alert off on the
 * VM until the next edit.
 */
import type { AppContext } from '../context.js';
import { scannerGet, scannerPut } from '../adapters/scannerClient.js';
import { isHydrated } from '../adapters/storage.js';
import { loadIndex, loadItems } from '../ui/watchlists.js';
import { buildAlertsDigest, normalizeConfig, type AlertsConfig, type AlertsDigest } from './alertRules.js';

export const ALERTS_KEY = 'alerts:config';

export async function loadAlertsConfig(ctx: AppContext): Promise<AlertsConfig> {
  return normalizeConfig(await ctx.storage.get(ALERTS_KEY));
}

export async function saveAlertsConfig(ctx: AppContext, cfg: AlertsConfig): Promise<void> {
  await ctx.storage.set(ALERTS_KEY, normalizeConfig(cfg));
  void publishAlerts(ctx);
}

/** The config and every list it can see, as the digest the VM will get. */
export async function currentAlertsDigest(ctx: AppContext, now = new Date()): Promise<AlertsDigest> {
  const cfg = await loadAlertsConfig(ctx);
  const idx = await loadIndex(ctx);
  const lists = [];
  for (const w of idx) {
    // Lists that do not alert are not even read: their tickers never leave the device.
    if (cfg.lists[w.id]?.on) lists.push({ id: w.id, name: w.name, items: await loadItems(ctx, w.id) });
  }
  return buildAlertsDigest(cfg, lists, now);
}

let lastBody = '';
let lastSentAt = 0;
let pending: ReturnType<typeof setTimeout> | null = null;
const MIN_GAP_MS = 10_000;

/** `at` is excluded, or nothing would ever compare equal. */
const bodyOf = (d: AlertsDigest): string => JSON.stringify({ on: d.on, syms: d.syms, warn: d.warn });

export async function publishAlerts(ctx: AppContext): Promise<'off' | 'skip' | 'queued' | 'ok' | 'err'> {
  try {
    if (!isHydrated()) return 'off';
    const digest = await currentAlertsDigest(ctx);
    if (bodyOf(digest) === lastBody) return 'skip';
    const wait = MIN_GAP_MS - (Date.now() - lastSentAt);
    if (wait > 0) {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        void publishAlerts(ctx).catch(() => {});
      }, wait);
      return 'queued';
    }
    const ok = await scannerPut('scanner:alerts', digest);
    if (!ok) return 'err';
    lastBody = bodyOf(digest);
    lastSentAt = Date.now();
    return 'ok';
  } catch {
    return 'err';
  }
}

/** What the VM last said back on `scanner:alerts_seen`: when it read the rules, and what it sent today. */
export interface AlertsSeen {
  at: string;
  /** `updatedAt` (ms) of the `scanner:alerts` it is running on. */
  rules_at: number | null;
  n: number;
  open: string[];
  fired: Array<{ sym: string; kind: string; px: number | null; ts: string; d: string }>;
  warn: string[];
}

export async function readAlertsSeen(): Promise<{ value: AlertsSeen; updatedAt: number } | null> {
  try {
    return await scannerGet<AlertsSeen>('scanner:alerts_seen');
  } catch {
    return null;
  }
}

/** Test seam: forget the throttle and the last-sent body. */
export function _resetAlertsFeed(): void {
  if (pending) clearTimeout(pending);
  pending = null;
  lastBody = '';
  lastSentAt = 0;
}
