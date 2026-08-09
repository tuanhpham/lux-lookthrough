/**
 * Fill and submit a prompt that The Professional sent over in the URL.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * ChatGPT's `?q=` parameter pre-fills and auto-submits on the plain chat page, but
 * a custom GPT (`/g/g-…`) ignores it, and OpenAI exposes no API for custom GPTs.
 * So the only way to get a prompt into YOUR GPT and have it run is to do in the
 * page what you would do by hand: put the text in the composer and press send.
 *
 * ── THE RULE THIS FILE OBEYS ────────────────────────────────────────────────
 * It acts ONLY on a URL carrying the `#tp-autorun` fragment, and only once. That
 * marker is the user's opt-in, added by the app when they click "Ask ChatGPT".
 * Without it this script does nothing at all — no reading the composer, no
 * clicking. Submitting a message on any page that happens to carry `?q=` would
 * mean sending something the user was still editing.
 *
 * The marker is stripped from the URL before anything is typed, which makes the
 * action single-shot: a reload, a back-navigation, or a restored session re-opens
 * an ordinary ChatGPT page and re-sends nothing.
 *
 * ── WHAT IT DOES NOT DO ─────────────────────────────────────────────────────
 * No network access, no storage, no credentials, no message history read. It
 * requests no permissions beyond running on ChatGPT's own two hostnames. Its whole
 * job is one paste and one click.
 *
 * If ChatGPT's markup changes, this stops working — which is exactly why the app
 * still copies every prompt to the clipboard. The failure mode is "paste it
 * yourself", not "lost prompt".
 */
(() => {
  'use strict';

  const MARKER = 'tp-autorun';

  /** Guards against the SPA re-running this within one page lifetime. */
  let done = false;

  /**
   * Read the prompt, then immediately remove the marker.
   *
   * Order matters: stripping first means an exception below cannot leave a URL
   * that re-arms on the next reload.
   */
  function claimPrompt() {
    if (done) return null;
    if (location.hash.replace(/^#/, '') !== MARKER) return null;
    const prompt = new URLSearchParams(location.search).get('q');
    done = true;
    // replaceState, not assignment to location.hash — that would add a history
    // entry and make Back walk through the marker again.
    history.replaceState(null, '', location.pathname + location.search);
    return prompt && prompt.trim() ? prompt : null;
  }

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /**
   * Wait for an element, polling rather than observing.
   *
   * ChatGPT mounts the composer well after `document_idle`, and on a custom GPT
   * there is an extra splash step before it appears. Polling to a deadline is
   * simpler than a MutationObserver here and cannot leak a live observer if the
   * element never shows up.
   */
  async function waitFor(selector, timeoutMs) {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = document.querySelector(selector);
      if (found) return found;
      if (Date.now() > deadline) return null;
      await sleep(120);
    }
  }

  /**
   * Put `text` into the composer.
   *
   * A synthetic `paste` is the primary path. The composer is a ProseMirror
   * contenteditable backed by React state, so assigning `textContent` puts glyphs
   * on screen that the framework never sees — the send button stays disabled and a
   * click submits nothing. ProseMirror handles a real `paste` event natively and
   * keeps the blank lines between paragraphs.
   *
   * `insertText` is the fallback. It is NOT the primary because it goes through the
   * browser's own insertion path, and a multi-line string there can be interpreted
   * as Enter presses — which in this composer means submitting the prompt one
   * fragment at a time.
   */
  function fillComposer(el, text) {
    el.focus();

    try {
      const dt = new DataTransfer();
      dt.setData('text/plain', text);
      const pasted = el.dispatchEvent(
        new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
      );
      // dispatchEvent returns false when a handler called preventDefault — which is
      // ProseMirror telling us it took the text. Nothing more to do.
      if (!pasted) return true;
    } catch {
      // ClipboardEvent with a clipboardData init is unsupported here; fall through.
    }

    if (typeof document.execCommand === 'function') {
      // Newlines collapse to spaces deliberately: a stray Enter in this composer
      // sends the message. The prompt's paragraphs are readable either way, and a
      // prompt that arrives whole beats one delivered in pieces.
      return document.execCommand('insertText', false, text.replace(/\s*\n\s*/g, ' '));
    }
    return false;
  }

  /** True once the composer holds something — the send button is gated on it. */
  const hasContent = (el) => (el.textContent ?? '').trim().length > 0;

  async function submit() {
    // Wait for the button to leave its disabled state; React enables it a tick
    // after the composer's content changes.
    const deadline = Date.now() + 4000;
    for (;;) {
      const btn = document.querySelector(
        'button[data-testid="send-button"], button#composer-submit-button',
      );
      if (btn && !btn.disabled && btn.getAttribute('aria-disabled') !== 'true') {
        btn.click();
        return true;
      }
      if (Date.now() > deadline) return false;
      await sleep(120);
    }
  }

  async function run() {
    const prompt = claimPrompt();
    if (!prompt) return;

    const composer = await waitFor(
      'div#prompt-textarea[contenteditable="true"], div.ProseMirror[contenteditable="true"], textarea#prompt-textarea',
      15000,
    );
    // Nothing to do but leave the prompt on the clipboard, where the app put it.
    if (!composer) return;

    if (!fillComposer(composer, prompt)) return;
    // Give React a frame to register the change before looking at the button.
    await sleep(150);
    if (!hasContent(composer)) return;
    await submit();
  }

  void run();
})();
