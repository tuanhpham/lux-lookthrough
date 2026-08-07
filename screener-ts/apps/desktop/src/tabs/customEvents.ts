/**
 * Hand-entered catalysts — the events no free API covers: biotech PDUFA dates,
 * investor days, court rulings, product launches, conference presentations.
 *
 * Stored via ctx.storage (so they sync to D1 like watchlists) under a single
 * `calendar:custom` key. These are the only events the user owns, so they always
 * count as `confirmed` and always survive a calendar refresh.
 */
import type { CatalystEvent } from '@screener/core';
import type { AppContext } from '../context.js';

const KEY = 'calendar:custom';

export interface CustomEvent {
  id: string;
  date: string;
  symbol: string | null;
  title: string;
  note?: string;
  /** 0–100; defaults to 70 since a manually-tracked event is there for a reason. */
  impact?: number;
}

export async function loadCustom(ctx: AppContext): Promise<CustomEvent[]> {
  return (await ctx.storage.get<CustomEvent[]>(KEY)) ?? [];
}

export async function saveCustom(ctx: AppContext, events: CustomEvent[]): Promise<void> {
  await ctx.storage.set(KEY, events);
}

export async function addCustom(ctx: AppContext, e: Omit<CustomEvent, 'id'>): Promise<void> {
  const id = globalThis.crypto?.randomUUID?.() ?? 'ce-' + Math.random().toString(36).slice(2);
  await saveCustom(ctx, [...(await loadCustom(ctx)), { ...e, id }]);
}

export async function deleteCustom(ctx: AppContext, id: string): Promise<void> {
  await saveCustom(ctx, (await loadCustom(ctx)).filter((e) => e.id !== id));
}

/** Project the stored rows into the shared event shape, clipped to a window. */
export function customToEvents(
  custom: readonly CustomEvent[],
  from: string,
  to: string,
): CatalystEvent[] {
  return custom
    .filter((c) => c.date >= from && c.date <= to)
    .map((c) => ({
      id: `custom:${c.id}:${c.date}`,
      kind: 'custom' as const,
      date: c.date,
      timing: 'unknown' as const,
      confidence: 'confirmed' as const,
      symbol: c.symbol ? c.symbol.toUpperCase() : null,
      title: c.title,
      detail: c.note || undefined,
      impact: c.impact ?? 70,
      source: 'manual' as const,
    }));
}
