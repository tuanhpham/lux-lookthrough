/**
 * Boot splash:
 * 1. "The Professional" + ring fade in slowly
 * 2. Ring + per-digit iOS-picker counter count 0→100 (ease-in-out, ~10s)
 * 3. Hold at 100%
 * 4. Radial wipe expands from center outward (~16s)
 */

const RING_MS  = window.innerWidth <= 700 ? 1000 : 2000; // ring fill duration
const HOLD_MS  = 700;   // pause at 100% before wipe
const WIPE_MS  = 16000; // radial wipe duration
const DIGIT_MS = 180;   // per-digit flip animation duration (ms)

export function runSplash(): Promise<void> {
  return new Promise((resolve) => {

    // ── Overlay ────────────────────────────────────────────────────────
    const overlay = document.createElement('div');
    overlay.id = 'splash-overlay';
    overlay.innerHTML = `
      <div class="splash-inner">
        <div class="splash-ring-wrap">
          <svg class="splash-ring" viewBox="0 0 64 64" fill="none">
            <circle cx="32" cy="32" r="28"
              stroke="rgba(255,255,255,.10)" stroke-width="1"/>
            <circle class="splash-ring-fill" cx="32" cy="32" r="28"
              stroke="rgba(255,255,255,.65)" stroke-width="1"
              stroke-linecap="round"
              stroke-dasharray="175.93" stroke-dashoffset="175.93"
              transform="rotate(-90 32 32)"/>
          </svg>
          <div class="splash-pct-wrap">
            <div class="splash-digits" id="splash-digits"></div>
            <span class="splash-pct-sign">%</span>
          </div>
        </div>
        <div class="splash-divider"></div>
        <p class="splash-name">The&nbsp;Professional</p>
      </div>`;
    document.body.appendChild(overlay);

    // ── Build digit slots ──────────────────────────────────────────────
    const digitsEl = overlay.querySelector<HTMLElement>('#splash-digits')!;

    // Each slot tracks its own settled element so rapid flips never grab
    // a mid-flight span via querySelector.
    interface Slot { el: HTMLElement; cur: HTMLElement }

    const makeSlot = (char: string): Slot => {
      const el = document.createElement('div');
      el.className = 'splash-dslot';
      const cur = document.createElement('span');
      cur.className = 'splash-dchar';
      cur.textContent = char;
      el.appendChild(cur);
      return { el, cur };
    };

    // Three slots: hundreds | tens | units
    const sH = makeSlot('0'); sH.el.setAttribute('data-hidden', '1');
    const sT = makeSlot('0'); sT.el.setAttribute('data-hidden', '1');
    const sU = makeSlot('0');
    [sH, sT, sU].forEach((s) => digitsEl.appendChild(s.el));

    const revealSlot = (s: Slot) => s.el.removeAttribute('data-hidden');

    // iOS-picker flip: new digit enters from above, old exits downward.
    // We set transform BEFORE appending so the browser's first layout of
    // the element already places it off-screen; a double-rAF then starts
    // the transition only after that position has been painted at least once.
    const flip = (s: Slot, newChar: string) => {
      if (s.cur.textContent === newChar) return;

      const old  = s.cur;
      const next = document.createElement('span');
      next.className = 'splash-dchar';
      next.textContent = newChar;
      // Place off-screen BEFORE entering the DOM — browser sees it there first
      next.style.transform  = 'translateY(-100%)';
      next.style.transition = 'none';
      s.cur = next;          // track new settled target immediately
      s.el.appendChild(next);

      // Double rAF: first frame commits initial styles, second starts transition.
      // This is more reliable than a single reflow-flush in Tauri's WebKit.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          const ease = `transform ${DIGIT_MS}ms cubic-bezier(.4,0,.2,1)`;
          old.style.transition  = ease;
          next.style.transition = ease;
          old.style.transform   = 'translateY(100%)';
          next.style.transform  = 'translateY(0)';
          setTimeout(() => old.remove(), DIGIT_MS + 80);
        });
      });
    };

    let prev = -1;
    let lastFlipAt = 0; // timestamp of the last accepted flip
    const updateCounter = (n: number) => {
      if (n === prev) return;
      const now = performance.now();
      // Skip intermediate values if the previous flip hasn't finished yet
      if (n !== 100 && now - lastFlipAt < DIGIT_MS) return;
      lastFlipAt = now;

      const ph = Math.floor(n / 100);
      const pt = Math.floor((n % 100) / 10);
      const pu = n % 10;
      const oh = prev < 0 ? 0 : Math.floor(prev / 100);
      const ot = prev < 0 ? 0 : Math.floor((prev % 100) / 10);

      if ((prev < 10  || prev < 0) && n >= 10)  revealSlot(sT);
      if ((prev < 100 || prev < 0) && n >= 100) revealSlot(sH);

      if (ph !== oh) flip(sH, String(ph));
      if (pt !== ot) flip(sT, String(pt));
      flip(sU, String(pu));

      prev = n;
    };

    // ── Phase 1: ring + counter ────────────────────────────────────────
    const fill  = overlay.querySelector<SVGCircleElement>('.splash-ring-fill')!;
    const CIRCUM = 175.93;
    let t0: number | null = null;

    const ringStep = (ts: number) => {
      if (!t0) t0 = ts;
      const raw   = Math.min((ts - t0) / RING_MS, 1);
      const eased = raw < 0.5 ? 4 * raw ** 3 : 1 - (-2 * raw + 2) ** 3 / 2;
      fill.style.strokeDashoffset = String(CIRCUM * (1 - eased));
      updateCounter(Math.round(eased * 100));

      if (raw < 1) { requestAnimationFrame(ringStep); return; }
      updateCounter(100);

      // ── Phase 2: hold → radial wipe ─────────────────────────────────
      setTimeout(() => {
        let w0: number | null = null;
        const wipeStep = (wt: number) => {
          if (!w0) w0 = wt;
          const p  = Math.min((wt - w0) / WIPE_MS, 1);
          // ease-out quart: fast burst, gentle coast to edges
          const ew = 1 - (1 - p) ** 4;
          const r  = ew * 165; // 165% reaches all four corners
          const mask = `radial-gradient(circle at center, transparent ${r}%, black ${r + 1.5}%)`;
          overlay.style.maskImage = mask;
          (overlay.style as CSSStyleDeclaration & { webkitMaskImage: string }).webkitMaskImage = mask;
          if (p < 1) requestAnimationFrame(wipeStep);
          else { overlay.remove(); resolve(); }
        };
        requestAnimationFrame(wipeStep);
      }, HOLD_MS);
    };

    requestAnimationFrame(ringStep);
  });
}
