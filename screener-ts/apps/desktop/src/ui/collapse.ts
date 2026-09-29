/**
 * Sections that fold, and remember that they were folded.
 *
 * ── WHY ─────────────────────────────────────────────────────────────────────
 * The scanner page is a ten-stage pipeline and prints all ten stages every time.
 * Nine of them are diagnostics — thresholds, the run record, why 4,000 symbols were
 * rejected — and one of them is the answer. There is no reading order that makes a
 * page of tables shorter, so the page has to be foldable instead.
 *
 * ── THE RULE THAT MAKES IT SAFE ─────────────────────────────────────────────
 * The open/closed state is decided while the HTML STRING is built (`openAttr`), not
 * patched on after mount. A `<details open>` that JavaScript closes on the next
 * frame is a visible flinch on every render, and this page re-renders on every poll.
 *
 * State lives in one `localStorage` object, not one key per section: a section is
 * added or renamed often enough that sweeping up orphaned keys would be a chore, and
 * a single JSON blob is deleted in one go. It is deliberately NOT synced — which
 * sections you collapsed on a phone is not a fact about your trading.
 */

const KEY = 'ui_collapsed';

type State = Record<string, boolean>;

function read(): State {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : null;
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as State) : {};
  } catch {
    // A corrupt blob must not take a page down with it: folding is a convenience.
    return {};
  }
}

function write(s: State): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* private mode, or a full quota. Folding still works for this session. */
  }
}

/** True when the user has folded this section before. Unknown sections start open. */
export function isCollapsed(id: string): boolean {
  return read()[id] === true;
}

/** ` open` or `''`, to be dropped straight into a `<details …>` tag. */
export function openAttr(id: string): string {
  return isCollapsed(id) ? '' : ' open';
}

/**
 * The same thing for a fold that should START CLOSED — an explanation beside data, which
 * the reader who already knows should not have to fold away on every visit.
 *
 * Needs `false` to be STORED rather than treated as absent, which is why `setCollapsed`
 * writes both values: "never touched" and "opened once" have to be different states, and
 * for a default-open section they are not.
 */
export function openAttrShut(id: string): string {
  return read()[id] === false ? ' open' : '';
}

export function setCollapsed(id: string, collapsed: boolean): void {
  const s = read();
  // Both values are written, including `false`. It costs a few bytes per section the
  // reader has opened, and it buys `openAttrShut` above — with `false` deleted, a fold
  // that starts closed can never remember having been opened.
  s[id] = collapsed;
  write(s);
}

/**
 * The caret. `<summary>`'s native marker is hidden in CSS and replaced by this,
 * because the native one sits outside the flex row and cannot be aligned with a
 * baseline-aligned header.
 */
export function caretHtml(title: string): string {
  return `<span class="collapse-caret" aria-hidden="true" title="${
    title.replace(/"/g, '&quot;')}">▾</span>`;
}

/**
 * A `sectionHead()` block turned into the handle of the section it names.
 *
 * The head goes INSIDE the `<summary>` — the whole heading is the hit target, so
 * there is one thing to click for one thing to happen, rather than a caret beside a
 * heading that does something the heading does not. `body` may be anything; it is not
 * parsed, only wrapped, so a card, a table or a chart host all work.
 *
 * `id` is the storage key as well as the DOM id, so a section keeps its state across
 * renders and across pages: prefix it (`cal:top`, `scan:cand`) the way the pages do.
 */
export function foldBlock(id: string, head: string, body: string, caretTitle: string): string {
  return `<details class="fold-block" id="fold-${id.replace(/[^a-zA-Z0-9_-]+/g, '-')}"`
    + ` data-collapse="${id}"${openAttr(id)}>`
    + `<summary class="fold-sum">${head}${caretHtml(caretTitle)}</summary>`
    + `<div class="fold-body">${body}</div></details>`;
}

/**
 * Remember every fold under `root`. Idempotent per render: listeners go on the
 * `<details>` elements that this render created, and the old ones died with the old
 * DOM. Returns a dispose function for callers that re-render into the same host.
 */
export function wireCollapse(root: HTMLElement): () => void {
  const nodes = Array.from(root.querySelectorAll<HTMLDetailsElement>('details[data-collapse]'));
  const off: (() => void)[] = [];
  for (const d of nodes) {
    const id = d.dataset.collapse!;
    const onToggle = (): void => setCollapsed(id, !d.open);
    d.addEventListener('toggle', onToggle);
    off.push(() => d.removeEventListener('toggle', onToggle));
  }
  return () => off.forEach((f) => f());
}

/**
 * Open a folded section before scrolling to it. A jump link that lands on a closed
 * section reads as a broken link — the page moves and nothing is there.
 */
export function revealCollapse(el: Element | null | undefined): void {
  let node: Element | null | undefined = el;
  while (node) {
    if (node instanceof HTMLDetailsElement && !node.open) {
      node.open = true;
      if (node.dataset.collapse) setCollapsed(node.dataset.collapse, false);
    }
    node = node.parentElement;
  }
}

/** Fold or unfold every section under `root` at once. */
export function setAllCollapsed(root: HTMLElement, collapsed: boolean): void {
  for (const d of root.querySelectorAll<HTMLDetailsElement>('details[data-collapse]')) {
    d.open = !collapsed;
    if (d.dataset.collapse) setCollapsed(d.dataset.collapse, collapsed);
  }
}
