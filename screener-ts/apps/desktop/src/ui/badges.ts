import type { QmSetupType, MomentumClassification } from '@screener/core';

/** Shared coloured badges for QM setup type and momentum classification, used by
 * the QM/momentum tables and the stock modal so the labels stay consistent. */

const SETUP_LABEL: Record<QmSetupType, string> = {
  BOTH: 'VCP + EP',
  VCP: 'VCP',
  EPISODIC_PIVOT: 'Episodic',
  NONE: '—',
};

const SETUP_COLOR: Record<QmSetupType, string> = {
  BOTH: 'var(--accent)',
  VCP: 'var(--accent)',
  EPISODIC_PIVOT: 'var(--warn)',
  NONE: 'var(--faint)',
};

export const SETUP_RANK: Record<QmSetupType, number> = {
  BOTH: 3,
  VCP: 2,
  EPISODIC_PIVOT: 1,
  NONE: 0,
};

export function setupBadge(s: QmSetupType): string {
  const c = SETUP_COLOR[s];
  return `<span class="badge" style="background:color-mix(in srgb,${c} 14%,transparent);color:${c};border-color:color-mix(in srgb,${c} 35%,transparent)">${SETUP_LABEL[s]}</span>`;
}

const CLASS_COLOR: Record<MomentumClassification, string> = {
  Explosive: 'var(--accent)',
  Strong: 'var(--accent)',
  Building: 'var(--warn)',
  Weak: 'var(--faint)',
};

export const CLASS_RANK: Record<MomentumClassification, number> = {
  Explosive: 4,
  Strong: 3,
  Building: 2,
  Weak: 1,
};

export function classBadge(c: MomentumClassification): string {
  const color = CLASS_COLOR[c];
  return `<span class="badge" style="background:color-mix(in srgb,${color} 14%,transparent);color:${color};border-color:color-mix(in srgb,${color} 35%,transparent)">${c}</span>`;
}
