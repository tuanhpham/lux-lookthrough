/**
 * The Learn tab, bound as a book.
 *
 * The page had all the material and none of the shape: a title, then twenty-five
 * cards in a row, then a very long playbook at the bottom. Nothing told you how
 * much there was, where you were in it, or which parts belonged together — so it
 * read like a pile of reference cards, which is exactly what you do NOT want from
 * the one page meant to be read again and again.
 *
 * So it is a book now, with the three things a book gives a reader for free:
 *
 *   1. A TITLE PAGE that lists its parts, each with an honest reading time — the
 *      reader decides what they are committing to before they scroll.
 *   2. PART DIVIDERS. A full-width rule, a roman numeral and one sentence saying
 *      what the part is for. They are what makes "where am I" answerable at a
 *      glance, and the sticky contents bar groups its rows by them.
 *   3. ORDER. The playbook comes FIRST, because it is the thing that gets reread;
 *      the glossary is back matter, where a glossary belongs. It used to be the
 *      other way round, on the theory that people arrive to look up a term.
 *
 * This module owns only the furniture. The chapters themselves stay where they
 * were (`miscTabs.ts`, `swingPlaybook.ts`, `glossary.ts`) — a book's binding does
 * not hold its prose.
 */

type Lang = 'en' | 'vi';

export interface BookPart {
  /** Anchor id — also what the contents rows point at. */
  id: string;
  /** Roman numeral, shown big. Roman on purpose: it cannot be mistaken for the
   *  playbook's own 1–16 section numbers. */
  numeral: string;
  title: string;
  /** One sentence. What this part is for, not what it contains. */
  blurb: string;
}

/**
 * Words a minute, for the reading-time estimate.
 *
 * 200 is the usual figure for careful non-fiction, and this material is denser
 * than average — it is better for the number to be slightly pessimistic than for
 * a reader to trust "5 min" and still be scrolling fifteen minutes later.
 */
const WPM = 200;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The title page: what this is, and what is in it. */
export function bookCoverHtml(
  lang: Lang,
  title: string,
  lede: string,
  parts: BookPart[],
): string {
  const vi = lang === 'vi';
  return `<div class="lb-cover">
    <div class="lb-eyebrow">${vi ? 'Sổ tay · The Professional Platform' : 'Handbook · The Professional Platform'}</div>
    <h1 class="lb-title">${title}</h1>
    <p class="lb-lede">${lede}</p>
    <div class="lb-contents-h">${vi ? 'Nội dung' : 'Contents'}</div>
    <ol class="lb-contents">${parts
      .map(
        (p) => `<li>
          <button type="button" class="lb-contents-row" data-lb-goto="${p.id}">
            <span class="lb-contents-num">${p.numeral}</span>
            <span class="lb-contents-text">
              <span class="lb-contents-title">${esc(p.title)}</span>
              <span class="lb-contents-blurb">${esc(p.blurb)}</span>
            </span>
            <span class="lb-contents-min" data-lb-min="${p.id}"></span>
          </button>
        </li>`,
      )
      .join('')}</ol>
  </div>`;
}

/**
 * A part divider. Opens a `<section class="lb-wrap">` that the caller fills and
 * closes — the wrapper is what the reading-time count and the contents bar
 * measure, so the part's chapters have to live inside it.
 */
export function bookPartHtml(part: BookPart): string {
  return `<section class="lb-wrap">
    <header class="lb-part" id="${part.id}">
      <span class="lb-part-kicker">${part.numeral}</span>
      <h2 class="lb-part-title">${esc(part.title)}</h2>
      <p class="lb-part-blurb">${esc(part.blurb)}</p>
    </header>
  </section>`;
}

/**
 * Write each part's reading time into the contents rows, measured from the
 * finished DOM.
 *
 * Measured rather than hand-maintained for the same reason the contents bar
 * discovers its own entries: the Learn tab is edited often, and a hand-written
 * "~12 min" would be wrong within a month and nobody would notice.
 */
export function stampReadingTimes(root: HTMLElement, lang: Lang): void {
  const unit = lang === 'vi' ? 'phút' : 'min';
  for (const wrap of Array.from(root.querySelectorAll<HTMLElement>('.lb-wrap'))) {
    const id = wrap.querySelector<HTMLElement>('.lb-part')?.id;
    if (!id) continue;
    const words = (wrap.textContent ?? '').trim().split(/\s+/).filter(Boolean).length;
    const slot = root.querySelector<HTMLElement>(`[data-lb-min="${id}"]`);
    if (slot) slot.textContent = `${Math.max(1, Math.round(words / WPM))} ${unit}`;
  }
}

/** Make the contents rows on the title page scroll to their part. */
export function wireBookContents(root: HTMLElement): void {
  for (const row of Array.from(root.querySelectorAll<HTMLElement>('[data-lb-goto]'))) {
    row.addEventListener('click', () => {
      root.ownerDocument
        .getElementById(row.dataset.lbGoto!)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }
}
