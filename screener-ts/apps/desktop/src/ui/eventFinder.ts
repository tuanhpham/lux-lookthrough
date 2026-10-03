/**
 * "🔎 Find events & catalysts" — the dialog the Trade Station and the Case Study editor open.
 *
 * The user's flow (2026-10-03): pick a buy date, press the button, the assistant searches and
 * comes back with a list; every event starts TICKED and the user unticks what does not matter;
 * the ticked ones are saved as dated events wherever the user chooses (the case study, the
 * plan), and the context the assistant found becomes a note they can edit, and send where they
 * want, before anything is written.
 *
 * Nothing is saved from here: the dialog hands the picked events, the edited note and the
 * chosen destinations back to the caller, which owns the writing.
 */
import { buildEventFinderPrompt, parseEventFinderAnswer, type FoundEvent } from '@screener/core';
import type { AppContext } from '../context.js';
import { getLang } from './i18n.js';
import { askAssistantText } from './chatPanel.js';
import { openLlmSettings } from './llmSettings.js';
import { richEditorHtml, sanitizeNoteHtml, wireRichEditor } from './richNote.js';
import { fetchEarningsReports } from '../adapters/earningsDates.js';
import { catalystOf, KIND_TONE, kindWord, noteHtmlOf } from '../caseStudies/eventNotes.js';
import type { Catalyst } from '../caseStudies/store.js';

export interface FinderTarget {
  id: string;
  /** What gets saved there: the picked events, or the note. */
  what: 'events' | 'note';
  label: string;
  on: boolean;
}

export interface FinderInput {
  symbol: string;
  date: string;
  setup?: string;
  entry?: number | null;
  stop?: number | null;
  currency?: string;
}

export interface FinderResult {
  events: Catalyst[];
  noteHtml: string;
  targets: Set<string>;
}

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function openEventFinder(ctx: AppContext, input: FinderInput, targets: FinderTarget[]): Promise<FinderResult | null> {
  const vi = getLang() === 'vi';
  const L = (en: string, v: string): string => (vi ? v : en);
  const sym = input.symbol.trim().toUpperCase();

  return new Promise((resolve) => {
    const host = document.createElement('div');
    host.className = 'dialog-host';
    host.innerHTML = `<div class="dialog-backdrop"></div>
      <div class="dialog evf" role="dialog" aria-modal="true">
        <div class="dialog-head"><span class="dialog-ic">🔎</span><div>
          <div class="dialog-title">${L('Events & catalysts', 'Sự kiện & catalyst')} · ${esc(sym)}</div>
          <div class="dialog-sub">${L(`Around ${input.date} — 60 days before, 30 after. Untick what does not matter, edit the note, then choose where it goes.`,
            `Quanh ngày ${input.date} — 60 ngày trước, 30 ngày sau. Bỏ tick những gì không quan trọng, sửa ghi chú, rồi chọn nơi lưu.`)}</div>
        </div></div>
        <div class="dialog-body evf-body"><div class="evf-status"><span class="spinner"></span> ${L('Asking the assistant (with web search)…', 'Đang hỏi trợ lý (có tìm web)…')} <small class="evf-n"></small></div></div>
        <div class="dialog-actions">
          <button class="btn-outline" data-act="no">${L('Cancel', 'Huỷ')}</button>
          <button class="btn-outline" data-act="again" hidden>↻ ${L('Search again', 'Tìm lại')}</button>
          <button class="btn" data-act="yes" disabled>${L('Save', 'Lưu')}</button>
        </div>
      </div>`;
    document.body.appendChild(host);
    const body = host.querySelector<HTMLElement>('.evf-body')!;
    const yes = host.querySelector<HTMLButtonElement>('[data-act="yes"]')!;
    const again = host.querySelector<HTMLButtonElement>('[data-act="again"]')!;
    let ctrl: AbortController | null = null;
    let events: FoundEvent[] = [];
    let getNote: (() => string) | null = null;
    let noteDirty = false;
    let noteData: Parameters<typeof noteHtmlOf>[0]['note'] = { summary: '', metrics: [], risks: [] };

    const done = (r: FinderResult | null): void => { ctrl?.abort(); host.remove(); resolve(r); };
    host.querySelector('.dialog-backdrop')!.addEventListener('click', () => done(null));
    host.querySelector('[data-act="no"]')!.addEventListener('click', () => done(null));

    const picked = (): FoundEvent[] => events.filter((_, i) => host.querySelector<HTMLInputElement>(`[data-evf-i="${i}"]`)?.checked);
    const noteNow = (): string => noteHtmlOf({ symbol: sym, date: input.date, note: noteData, picked: picked(), vi, foundOn: new Date().toISOString().slice(0, 10) });

    const paintCount = (): void => {
      const n = picked().length;
      const c = host.querySelector<HTMLElement>('.evf-count');
      if (c) c.textContent = L(`${n} of ${events.length} picked`, `Đã chọn ${n}/${events.length}`);
      yes.textContent = L(`Save${n ? ` · ${n} events` : ''}`, `Lưu${n ? ` · ${n} sự kiện` : ''}`);
      // The note lists the picked events, so it follows the ticks until the user edits it.
      if (!noteDirty) {
        const ed = host.querySelector<HTMLElement>('[data-rn-editor="evf-note"]');
        if (ed) ed.innerHTML = noteNow();
      }
    };

    const paintResult = (): void => {
      const rows = events.map((e, i) => `<label class="evf-row">
          <input type="checkbox" data-evf-i="${i}" checked>
          <span class="evf-date">${esc(e.date)}</span>
          <span class="evf-kind" style="--k:${KIND_TONE[e.kind]}">${esc(kindWord(e.kind, vi))}</span>
          <span class="evf-txt"><b>${esc(e.title)}</b>${e.detail ? `<small>${esc(e.detail)}</small>` : ''}</span>
          ${/^https?:\/\//.test(e.source) ? `<a class="evf-src" href="${esc(e.source)}" target="_blank" rel="noopener" title="${esc(e.source)}">↗</a>`
            : e.source === 'nasdaq' ? '<span class="evf-src evf-src-n">Nasdaq</span>' : '<span></span>'}
        </label>`).join('');
      const tg = (what: FinderTarget['what']): string => targets.filter((t) => t.what === what).map((t) =>
        `<label class="stn-check"><input type="checkbox" data-evf-t="${esc(t.id)}"${t.on ? ' checked' : ''}> ${esc(t.label)}</label>`).join('');
      body.innerHTML = `
        <div class="evf-head"><b class="evf-count"></b>
          <span><button class="stn-link" data-evf-all="1">${L('Tick all', 'Chọn hết')}</button> · <button class="stn-link" data-evf-all="0">${L('Untick all', 'Bỏ hết')}</button></span></div>
        <div class="evf-list">${rows || `<div class="stn-empty">${L('The assistant found no dated events in this window.', 'Trợ lý không tìm thấy sự kiện có ngày nào trong khoảng này.')}</div>`}</div>
        <div class="evf-sec">📝 ${L('Note — edit freely', 'Ghi chú — sửa thoải mái')}</div>
        ${richEditorHtml('evf-note', noteNow(), { lang: vi ? 'vi' : 'en', minHeight: 160 })}
        <div class="evf-dest">
          <div><div class="evf-sec">${L('Save the events to', 'Lưu sự kiện vào')}</div>${tg('events')}</div>
          <div><div class="evf-sec">${L('Save the note to', 'Lưu ghi chú vào')}</div>${tg('note')}</div>
        </div>`;
      getNote = wireRichEditor(body, 'evf-note');
      body.querySelector('[data-rn-editor="evf-note"]')?.addEventListener('input', () => { noteDirty = true; });
      body.querySelectorAll<HTMLInputElement>('[data-evf-i]').forEach((c) => c.addEventListener('change', paintCount));
      body.querySelectorAll<HTMLElement>('[data-evf-all]').forEach((b) => b.addEventListener('click', (e) => {
        e.preventDefault();
        body.querySelectorAll<HTMLInputElement>('[data-evf-i]').forEach((c) => { c.checked = b.dataset.evfAll === '1'; });
        paintCount();
      }));
      yes.disabled = false;
      again.hidden = false;
      paintCount();
    };

    const fail = (html: string): void => {
      body.innerHTML = `<div class="stn-msg err">${html}</div>`;
      again.hidden = false;
    };

    const run = async (): Promise<void> => {
      yes.disabled = true;
      again.hidden = true;
      noteDirty = false;
      body.innerHTML = `<div class="evf-status"><span class="spinner"></span> ${L('Asking the assistant (with web search)…', 'Đang hỏi trợ lý (có tìm web)…')} <small class="evf-n"></small></div>`;
      // The app's own earnings dates go in first: they are facts, the model only confirms them.
      const earn = await fetchEarningsReports(sym).catch(() => []);
      const known = earn.map((r) => ({
        date: r.date,
        text: `${L('Earnings', 'KQKD')} ${r.fiscalQtr}${r.surprisePct === null ? '' : ` (${r.surprisePct >= 0 ? '+' : ''}${r.surprisePct.toFixed(1)}% vs consensus)`}`,
      }));
      const prompt = buildEventFinderPrompt({ ...input, symbol: sym, known }, vi ? 'vi' : 'en');
      ctrl = new AbortController();
      let chars = 0;
      const res = await askAssistantText(ctx, prompt, (c) => {
        chars += c.length;
        const n = host.querySelector<HTMLElement>('.evf-n');
        if (n) n.textContent = `${chars}…`;
      }, ctrl.signal, { web: true }).catch((e: unknown) => ({ kind: 'error' as const, message: String(e).slice(0, 300), tools: [] }));
      if (!host.isConnected) return;
      if (!res) {
        fail(`${L('No assistant is set up yet.', 'Chưa cài đặt trợ lý AI.')} <button class="stn-link" data-evf-llm>${L('Open AI settings', 'Mở cài đặt AI')}</button>`);
        body.querySelector('[data-evf-llm]')?.addEventListener('click', () => void openLlmSettings(ctx));
        return;
      }
      if (res.kind !== 'answer') { fail(esc(res.message)); return; }
      const parsed = parseEventFinderAnswer(res.text);
      if (!parsed) {
        fail(`${L('The answer had no list in it. Try again — or open the chat to see what it said.', 'Câu trả lời không có danh sách. Thử lại — hoặc mở chat để xem trợ lý đã nói gì.')}<details><summary>${L('Answer', 'Câu trả lời')}</summary><pre class="evf-raw">${esc(res.text.slice(0, 3000))}</pre></details>`);
        return;
      }
      // Earnings the model left out are still earnings: add the app's own, marked as such.
      const have = new Set(parsed.events.filter((e) => e.kind === 'earnings').map((e) => e.date));
      const lo = shift(input.date, -60);
      const hi = shift(input.date, 30);
      for (const r of earn) {
        if (r.date < lo || r.date > hi || have.has(r.date)) continue;
        parsed.events.push({ date: r.date, kind: 'earnings', title: `${L('Earnings', 'KQKD')} ${r.fiscalQtr}`, detail: known.find((k) => k.date === r.date)?.text ?? '', source: 'nasdaq' });
      }
      parsed.events.sort((a, b) => (a.date < b.date ? -1 : 1));
      events = parsed.events;
      noteData = parsed.note;
      paintResult();
    };

    again.addEventListener('click', () => void run());
    yes.addEventListener('click', () => {
      const chosen = new Set([...host.querySelectorAll<HTMLInputElement>('[data-evf-t]')].filter((c) => c.checked).map((c) => c.dataset.evfT!));
      const noteHtml = sanitizeNoteHtml(getNote ? getNote() : noteNow());
      const cats = picked().map((e) => {
        const c = catalystOf(e, vi);
        return { ...c, text: sanitizeNoteHtml(c.text) };
      });
      done({ events: cats, noteHtml, targets: chosen });
    });
    void run();
  });
}

function shift(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  if (Number.isNaN(d.getTime())) return date;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
