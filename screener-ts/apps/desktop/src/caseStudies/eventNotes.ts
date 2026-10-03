/**
 * The event finder's results as the things the app stores: dated catalysts and a note.
 *
 * Pure strings, no DOM, so the tests can read them. The HTML only uses what the note
 * sanitiser keeps (h4, p, ul/li, b, i, a, span colour) — no tables, which it would unwrap.
 */
import type { FoundEvent, FoundEventKind, FoundNote } from '@screener/core';
import type { Catalyst } from './store.js';

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export const KIND_WORDS: Record<FoundEventKind, [string, string]> = {
  earnings: ['Earnings', 'KQKD'],
  guidance: ['Guidance', 'Dự báo'],
  analyst: ['Analyst', 'Phân tích'],
  product: ['Product', 'Sản phẩm'],
  corporate: ['Corporate', 'Doanh nghiệp'],
  macro: ['Macro', 'Vĩ mô'],
  sector: ['Sector', 'Ngành'],
  news: ['News', 'Tin tức'],
  other: ['Other', 'Khác'],
};

/** One colour per kind, the same in the picker and in the saved catalyst. */
export const KIND_TONE: Record<FoundEventKind, string> = {
  earnings: '#a855f7', guidance: '#8b5cf6', analyst: '#5b8cff', product: '#22c1a5',
  corporate: '#f59e0b', macro: '#ef8354', sector: '#14b8a6', news: '#94a3b8', other: '#94a3b8',
};

export const kindWord = (k: FoundEventKind, vi: boolean): string => KIND_WORDS[k]?.[vi ? 1 : 0] ?? k;

/** A picked event as a catalyst: "[KQKD] **Q4 beat** — EPS +12% · source". */
export function catalystOf(e: FoundEvent, vi: boolean): Catalyst {
  const tag = `<span style="color:${KIND_TONE[e.kind]}">[${esc(kindWord(e.kind, vi))}]</span>`;
  const src = e.source === 'nasdaq'
    ? ' · <i>Nasdaq</i>'
    : /^https?:\/\//i.test(e.source) ? ` · <a href="${esc(e.source)}">${vi ? 'nguồn' : 'source'}</a>` : '';
  return {
    date: e.date,
    text: `${tag} <b>${esc(e.title)}</b>${e.detail ? ` — ${esc(e.detail)}` : ''}${src}`,
    kind: e.kind,
    ...(e.source ? { source: e.source } : {}),
  };
}

/** Adds what is new: same date and the same title (case-blind, tags ignored) is the same event. */
export function mergeCatalysts(have: readonly Catalyst[], add: readonly Catalyst[]): Catalyst[] {
  const key = (c: Catalyst): string => `${c.date}|${c.text.replace(/<[^>]+>/g, '').replace(/\[[^\]]*\]/g, '').replace(/[—·].*$/, '').trim().toLowerCase()}`;
  const seen = new Set(have.map(key));
  const out = have.map((c) => ({ ...c }));
  for (const c of add) {
    const k = key(c);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ ...c });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** The context the model found, as a note the user can edit before it is saved anywhere. */
export function noteHtmlOf(o: {
  symbol: string; date: string; note: FoundNote; picked: readonly FoundEvent[]; vi: boolean; foundOn: string;
}): string {
  const { note, vi } = o;
  const L = (en: string, v: string): string => (vi ? v : en);
  const parts: string[] = [`<h4>📅 ${esc(o.symbol.toUpperCase())} — ${L('context around', 'bối cảnh quanh ngày')} ${esc(o.date)}</h4>`];
  if (note.summary) parts.push(`<p>${esc(note.summary)}</p>`);
  if (note.metrics.length) {
    parts.push(`<h4>${L('Numbers', 'Chỉ số')}</h4><ul>${note.metrics.map((m) => `<li><b>${esc(m.label)}:</b> ${esc(m.value)}</li>`).join('')}</ul>`);
  }
  if (o.picked.length) {
    parts.push(`<h4>${L('Events', 'Sự kiện')}</h4><ul>${o.picked.map((e) =>
      `<li><b>${esc(e.date)}</b> <span style="color:${KIND_TONE[e.kind]}">${esc(kindWord(e.kind, vi))}</span> — ${esc(e.title)}</li>`).join('')}</ul>`);
  }
  if (note.risks.length) {
    parts.push(`<h4>${L('Risks', 'Rủi ro')}</h4><ul>${note.risks.map((r) => `<li>${esc(r)}</li>`).join('')}</ul>`);
  }
  parts.push(`<p><i>${L(`Found by the assistant on ${o.foundOn} — check the sources before relying on it.`, `Trợ lý tìm ngày ${o.foundOn} — kiểm tra nguồn trước khi dựa vào.`)}</i></p>`);
  return parts.join('');
}
