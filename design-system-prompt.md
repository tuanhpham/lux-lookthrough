# Design-system prompt — "The Professional" look (Kraken-dark + liquid glass)

> **Cách dùng:** copy TOÀN BỘ phần từ `--- PROMPT START ---` đến `--- PROMPT END ---`, rồi dán vào
> Claude Code / Copilot / Cursor ở repo khác. Repo dùng React/Tailwind/Vue thì giữ nguyên các con số;
> chỉ cách viết (class, component, token config) là đổi.
>
> **Nguồn:** mọi giá trị lấy thẳng từ `screener-ts/apps/desktop/src/styles.css`, `ui/transition.ts`,
> `ui/pageHero.ts`, `ui/sectionHead.ts`, `ui/pages.ts`, `ui/theme.ts`, `tabs/stationTab.ts`,
> `index.html`. Bản viết lại ngày 2026-10-05, cập nhật 2026-10-06 (mục 2b Appearance): gồm hiệu ứng chuyển trang "vén màn", ngôn ngữ nút kính
> duy nhất, thanh các bước, nút cuối hàng có màu theo nghĩa, và các bẫy di động đã gặp.
>
> **Giữ đồng bộ:** đổi `styles.css` ở phần nào thì sửa mục tương ứng ở đây.

--- PROMPT START ---

You are restyling this application to match a design system I love. Apply it everywhere: the
header, navigation, page heads, cards, tables, buttons, forms, dialogs, motion, both themes,
desktop and phone. Use the values below exactly. Where this repo has a component I did not
describe, derive it from the closest recipe here; never invent a sixth button style or a second
dropdown look. Plain CSS custom properties are enough. Do not add a UI library for this; if
the repo already uses Tailwind, map these tokens into its theme config.

## 0. The idea

A precision trading-terminal UI, calm and expensive-looking:

- **Dark (default) follows Kraken Pro.** A near-black canvas, ONE brand colour (violet by
  default and user-selectable), green/red reserved for up/down, hairline borders, tabular
  numbers.
- **Both themes are liquid glass.** Behind everything sits a softly lit room of drifting
  colour glows. On top float panels of frosted glass with a bright 1px top edge.
- **Light is its own design**, not dark mode with the lights on: white frost over a warm pastel
  room, warm brown-grey ink.
- **Text always sits on a panel**, never directly on a glow.
- **Only layers that float over content get a real `backdrop-filter`.** That means the top bar,
  dropdowns, palette, dialogs, the phone dock and the sticky steps bar. Cards on the static
  canvas fake the glass with translucent gradients, which looks identical and costs nothing.
- **Movement is cinematic but quick.** A page change lifts a curtain from the exact point you
  clicked. Everything else rises a few pixels and fades in, staggered, in under half a second.

## 1. Tokens

The theme switch is class `light` on `<html>`; dark is `:root`. Persist the choice in localStorage
`theme`, respect `prefers-color-scheme` on the first visit, and set the class before first
paint (an inline script in `<head>`) so nothing flashes.

```css
:root {
  /* surfaces */
  --bg: #0d0d12;  --surface: #121219;  --card: #16161e;  --cardhover: #1e1e28;
  --border: #2d2d3b;  --border-soft: #23232e;
  /* ink */
  --text: #f2f2f8;  --subtext: #b4b3c8;  --faint: #8584a0;
  /* meaning */
  --accent: #8b6cff;   /* BRAND. Never means "gain". */
  --accent-ink: #fff;  --accent2: #5b8cff;  --blue: #5b8cff;  --violet: #c084fc;
  --up: #18d89a;  --danger: #ff5266;  --down: var(--danger);  --warn: #ffb648;
  --accent-wash: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-line: color-mix(in srgb, var(--accent) 42%, transparent);
  --ring:        color-mix(in srgb, var(--accent) 30%, transparent);
  /* shape */
  --radius: 10px; --radius-sm: 7px; --radius-xs: 5px; --ctl-radius: 999px;
  --shadow:    0 1px 0 rgba(255,255,255,.02) inset, 0 6px 18px -14px rgba(0,0,0,.8);
  --shadow-lg: 0 1px 0 rgba(255,255,255,.03) inset, 0 32px 64px -24px rgba(0,0,0,.8);
  /* type: the emoji font LAST in every stack, so icons look the same on Windows and macOS */
  --font-emoji: 'Noto Color Emoji';
  --font-ui:   'IBM Plex Sans', 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif, var(--font-emoji);
  --font-num:  'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif;   /* every datum, tabular */
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace, var(--font-emoji);
  --font-serif:'Source Serif 4', Georgia, serif;   /* ONLY the wordmark + marketing/story pages */

  /* ── glass controls (one button language, §7) ── */
  --glass-bg:       linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,.035));
  --glass-bg-hover: linear-gradient(180deg, rgba(255,255,255,.15), rgba(255,255,255,.06));
  --glass-line: rgba(255,255,255,.15);
  --glass-hi:   inset 0 1px 0 rgba(255,255,255,.13);
  --glass-drop: 0 10px 24px -18px rgba(0,0,0,.85);
  --cta-bg: linear-gradient(135deg, color-mix(in srgb, var(--accent) 88%, #fff) 0%, var(--accent) 45%,
                                    color-mix(in srgb, var(--accent) 60%, var(--blue)) 100%);
  --cta-line: color-mix(in srgb, var(--accent) 50%, #fff);
  --cta-shadow:       inset 0 1px 0 rgba(255,255,255,.4), inset 0 -10px 20px -12px rgba(0,0,0,.35),
                      0 12px 28px -14px color-mix(in srgb, var(--accent) 80%, transparent);
  --cta-shadow-hover: inset 0 1px 0 rgba(255,255,255,.45), inset 0 -10px 20px -12px rgba(0,0,0,.35),
                      0 18px 38px -14px color-mix(in srgb, var(--accent) 90%, transparent);
  --track-bg: rgba(255,255,255,.045);  --track-line: rgba(255,255,255,.11);
  --thumb-bg: linear-gradient(180deg, rgba(255,255,255,.16), rgba(255,255,255,.07));
  --thumb-shadow: inset 0 1px 0 rgba(255,255,255,.18), 0 4px 12px -6px rgba(0,0,0,.7), 0 0 0 1px var(--accent-line);
  --buy-bg: var(--cta-bg);  --buy-shadow: var(--cta-shadow);      /* "Buy" = the primary action */
  --sell-bg: linear-gradient(135deg, color-mix(in srgb, var(--down) 78%, #fff), color-mix(in srgb, var(--down) 88%, #000));
  /* fields */
  --field-bg: rgba(255,255,255,.075);  --field-bg-focus: rgba(255,255,255,.11);
  --field-line: rgba(255,255,255,.18); --field-line-hover: rgba(255,255,255,.3);
  /* table header band */
  --th-bg:   linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.03)), rgb(23,21,35);
  --th-edge: color-mix(in srgb, var(--accent) 38%, rgba(255,255,255,.1));
  --th-hi:   inset 0 1px 0 rgba(255,255,255,.07);
}
html.light {
  --bg: #eae4db; --surface: #f5f1ea; --card: #fffdf9; --cardhover: rgba(110,88,60,.07);
  --border: rgba(92,72,46,.17); --border-soft: rgba(92,72,46,.10);
  --text: #191510; --subtext: #5d564a; --faint: #827a6b;          /* warm ink on warm paper */
  --accent: #6a3de8; --accent2: #3a6fe0; --blue: #3a6fe0; --violet: #9333ea;
  --up: #0b8f69; --danger: #cf1f38; --warn: #a86500;               /* ≥ 4.5:1 on cream */
  --accent-wash: color-mix(in srgb, var(--accent) 9%, transparent);
  --accent-line: color-mix(in srgb, var(--accent) 55%, transparent);
  --ring:        color-mix(in srgb, var(--accent) 38%, transparent);
  --shadow:    0 1px 1px rgba(58,46,28,.05), 0 2px 4px rgba(58,46,28,.05), 0 10px 24px -12px rgba(58,46,28,.16);
  --shadow-lg: 0 1px 2px rgba(58,46,28,.06), 0 4px 10px rgba(58,46,28,.06), 0 30px 60px -22px rgba(58,46,28,.22);
  --glass-bg: linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.64));
  --glass-bg-hover: linear-gradient(180deg, #fff, rgba(255,255,255,.82));
  --glass-line: rgba(255,255,255,.98); --glass-hi: inset 0 1px 0 #fff;
  --glass-drop: 0 6px 16px -12px rgba(60,45,25,.35), 0 0 0 1px rgba(92,72,46,.08);
  --track-bg: rgba(255,255,255,.5); --track-line: rgba(92,72,46,.12);
  --thumb-bg: #fff; --thumb-shadow: 0 1px 3px rgba(40,30,60,.16), 0 0 0 1px var(--accent-line);
  --field-bg: rgba(255,255,255,.78); --field-bg-focus: #fff;
  --field-line: rgba(60,45,25,.24); --field-line-hover: rgba(60,45,25,.38);
  --th-bg: linear-gradient(180deg, #fffdfa, #f3eee6);
  --th-edge: color-mix(in srgb, var(--accent) 30%, rgba(60,45,25,.12)); --th-hi: inset 0 1px 0 #fff;
}
```

**Colour rules (non-negotiable)**
- **`--accent` is the brand.** Use it for the active nav item, links, focus rings, the primary
  button, ticker/ID cells, the sorted column, counts and the current step.
- **Meaning colours:** `--up` = gain, `--danger` = loss/destructive, `--warn` = caution or "changed
  since you confirmed". A positive number is NEVER coloured with the accent.
- **Buy follows the accent; Sell is a calmer red.** Buy is the primary action, not a gain.
- **Light mode stays warm and readable.** Check every new light-mode colour against `--card`
  (#fffdf9) at ≥ 4.5:1 for text. Keep it warm all the way through: no cool blue-grey ink on
  cream.
- **Accent picker** (Settings › Appearance; the whole Appearance system is §2b):
  - Presets are pairs of `[accent, accent2]` for dark and for light:

    | Preset | Dark | Light |
    |---|---|---|
    | violet (default) | `#8b6cff / #5b8cff` | `#6a3de8 / #3a6fe0` |
    | jade (owner's pick) | `#2fb36d / #1fa39a` | `#0d6b3f / #0f6f6a` |
    | indigo | `#6d7cff / #a78bfa` | `#4048d6 / #7c3aed` |
    | brand blue | `#4a7dff / #7ea6ff` | `#003781 / #1d5fd1` |
    | sky | `#38bdf8 / #4d9bff` | `#0369a1 / #1d5fd1` |
    | fuchsia | `#e062d8 / #8b6cff` | `#b02aa6 / #6a3de8` |
    | graphite | `#a3acc2 / #7d8ba8` | `#3d4657 / #5b6b85` |

  - Apply a preset by injecting `<style id="accent-css">:root:root{…} :root:root.light{…}</style>`.
    The doubled `:root` beats the base tokens without `!important`.
  - Because buy/primary are built on `--cta-bg`, every CTA follows the user's colour.
- **Background colour and brightness** are the user's too: see §2b.

**Fonts** (Google Fonts, `display=swap`): IBM Plex Sans 400/500/600/700, JetBrains Mono 400–700,
Source Serif 4 300/400 (+ italic 300), Hanken Grotesk 300–800 as a fallback, and
**Noto Color Emoji**, the last family in every stack. Without it, Windows draws 🎯 💼 ⭐ ✍️ with
Segoe UI Emoji and a Mac with Apple Color Emoji, so the same screen looks different on the two.
Arrows, ✕ and ✓ are text glyphs, not emoji; for those, prefer inline SVG icons.

## 2. Base and the liquid canvas

```css
* { box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  margin: 0; overflow-x: clip;          /* clip, not hidden: keeps position:sticky working */
  background: var(--bg); color: var(--text);
  font: 14px var(--font-ui); letter-spacing: -0.011em;
  font-feature-settings: 'cv05' 1, 'ss03' 1;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
body, button, input, select, textarea { font-family: var(--font-ui); }
html:not(.light) body { background: #09090f; }
html.light body { background: #ece5db; }
.num, table td, .stat .v, .badge {
  font-family: var(--font-num); font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'zero' 1;
}
::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
#app > * { position: relative; z-index: 1; }   /* everything above the canvas */

/* the room: oversized so the drift never shows an edge; only transform animates */
body::before {
  content: ''; position: fixed; inset: -12%; z-index: 0; pointer-events: none;
  will-change: transform; animation: liquidDrift 46s ease-in-out infinite alternate;
}
@keyframes liquidDrift {
  0%   { transform: translate3d(0,0,0) scale(1); }
  35%  { transform: translate3d(2.5%,-1.8%,0) scale(1.04); }
  70%  { transform: translate3d(-2%,2.2%,0) scale(1.02); }
  100% { transform: translate3d(1.4%,1%,0) scale(1.06) rotate(.6deg); }
}
html:not(.light) body::before { background:
  radial-gradient(42% 38% at 12% 8%,  rgba(132,96,255,.46), transparent 70%),
  radial-gradient(36% 34% at 88% 12%, rgba(52,128,255,.34), transparent 70%),
  radial-gradient(30% 30% at 56% 40%, rgba(110,70,230,.16), transparent 70%),
  radial-gradient(44% 40% at 82% 92%, rgba(20,200,176,.26), transparent 70%),
  radial-gradient(38% 36% at 8% 88%,  rgba(226,70,168,.24), transparent 70%),
  radial-gradient(26% 24% at 40% 96%, rgba(255,150,80,.12), transparent 70%),
  linear-gradient(160deg, #0e0c1a, #07070c); }
html.light body::before { background:
  radial-gradient(44% 40% at 10% 6%,  rgba(255,196,150,.92), transparent 70%),
  radial-gradient(40% 38% at 90% 10%, rgba(176,226,196,.88), transparent 70%),
  radial-gradient(34% 32% at 58% 42%, rgba(216,204,255,.55), transparent 70%),
  radial-gradient(46% 42% at 78% 94%, rgba(180,206,252,.92), transparent 70%),
  radial-gradient(40% 40% at 6% 92%,  rgba(250,190,214,.78), transparent 70%),
  radial-gradient(28% 26% at 36% 70%, rgba(255,255,255,.6),  transparent 70%),
  linear-gradient(160deg, #f3e9de, #e6ddd2); }
```

## 2b. Appearance settings — the user owns the look

One Settings section ("Appearance & colours") lets the user change four things:
- light or dark
- the accent colour
- the background colour (the room behind the glass)
- the brightness of that room

Each can be set for **both themes at once, or for dark and light separately**. The whole look
can also be saved as **the user's own default**. Everything below is painted by injected
`<style>` blocks, so no component ever reads a setting.

**Layering.** Three injected blocks, always in this order in `<head>`, after the stylesheet:
```
<style id="accent-css">    :root:root{--accent…}  :root:root.light{--accent…}
<style id="backdrop-css">  html:root:not(.light) body::before{…}  html:root.light body::before{…}
<style id="tone-css">      brightness: token mixes + a veil (must come LAST so it lays over any colour)
```
- Each block is removed and rebuilt on change; an empty choice (the shipped look) writes nothing.
- `:root:root` and `html:root` double the specificity, so the blocks beat the base tokens and
  the stylesheet's own room whatever order `<head>` ends up in. No `!important`.
- Read every choice from localStorage and paint all three in the boot script, BEFORE first
  paint, so a reload never flashes the default.

**"Apply to" (scope).** A segmented control at the top of the section:
**Both themes · 🌙 Dark · ☀️ Light**.
- Picking Dark or Light **switches the screen to that theme** (with the curtain), so what is
  being chosen is what is seen.
- The brightness area then shows only that theme's slider.
- A one-line note under the control says what will happen:
  - Both, while the two differ: "Dark and light differ now — picking here sets both to the same."
  - Dark: "Only the dark theme changes; light keeps its own."
  - Light: "Only the light theme changes; dark keeps its own."

**Storage (per device, localStorage).** Backwards compatible: the original key is "both",
and light reads its own key first.

| Setting | Both / dark | Light override | Default |
|---|---|---|---|
| theme | `theme` = dark/light | — | `prefers-color-scheme` |
| accent | `accent` = preset id or `#rrggbb` | `accent_light` | `violet` |
| background | `ui_backdrop` = preset id or `#rrggbb` | `ui_backdrop_light` | `aurora` |
| brightness | `ui_tone_dark` (0…100) | `ui_tone_light` (−50…+50) | 0 |

Saving for a scope:
- **both:** write the shared key, delete the light key.
- **dark:** FIRST copy what light shows now into the light key, then write the shared key.
  Changing one theme must never drag the other along.
- **light:** write the light key only.

**Accent: presets and "your own".**
- **Swatches:** one per preset (table in §1), each a 22px dot painted
  `linear-gradient(135deg, accent, accent2)` in the theme on screen, with an "in use" tag on
  the saved one.
- **"Your own":** a native `<input type=color>`.
- **Preview first:** picks update a live preview strip (a primary button, a secondary button, a
  chip, a ticker in the accent and a progress bar) through inline CSS variables. Nothing changes
  until **Save colour**; "Back to default" sits beside it.
- **How a custom colour becomes a pair:**
  - Dark uses it as typed.
  - Light darkens it in steps of ×0.85 until its WCAG luminance is ≤ 0.2, i.e. ≥ 4:1 as text
    on the cream card.
  - `accent2` = 60% the colour + 40% the theme's blue (`#5b8cff` dark / `#3a6fe0` light), so
    gradients keep two tones.
  - `--accent-ink` (text on an accent fill) is `#0d0d12` when the fill's luminance > 0.36,
    else white.
- **P&L clash:** warn when the hue sits inside 85–170° (reads as gain) or ≤ 12° / ≥ 348° (reads
  as loss).

**Background colour: six rooms and "your own".**
- **The rooms:** the canvas in §2 is six radial glows at fixed spots plus a 160° base
  gradient. A preset only swaps their colours; the geometry stays:
  - **dark spots:** `42% 38% at 12% 8%`, `36% 34% at 88% 12%`, `30% 30% at 56% 40%`,
    `44% 40% at 82% 92%`, `38% 36% at 8% 88%`, `26% 24% at 40% 96%`
  - **light spots:** `44% 40% at 10% 6%`, `40% 38% at 90% 10%`, `34% 32% at 58% 42%`,
    `46% 42% at 78% 94%`, `40% 40% at 6% 92%`, `28% 26% at 36% 70%`
  - each glow is `radial-gradient(<spot>, rgba(<r,g,b,a>), transparent 70%)`
- **Six glows (r,g,b,alpha) + base, per theme:**

| Preset | Dark glows | Dark base | Light glows | Light base |
|---|---|---|---|---|
| Aurora (default) | 132,96,255,.46 · 52,128,255,.34 · 110,70,230,.16 · 20,200,176,.26 · 226,70,168,.24 · 255,150,80,.12 | #0e0c1a → #07070c | 255,196,150,.92 · 176,226,196,.88 · 216,204,255,.55 · 180,206,252,.92 · 250,190,214,.78 · 255,255,255,.6 | #f3e9de → #e6ddd2 |
| Ocean | 40,120,255,.44 · 20,190,230,.32 · 60,90,230,.18 · 20,180,170,.26 · 90,80,240,.2 · 80,170,255,.12 | #0a1020 → #05070d | 180,210,255,.92 · 186,236,240,.88 · 210,220,255,.6 · 170,214,246,.92 · 200,206,255,.75 · 255,255,255,.6 | #e8eef6 → #dbe4ee |
| Jade forest | 30,190,120,.4 · 20,160,170,.3 · 60,140,90,.16 · 120,200,80,.22 · 20,120,140,.22 · 200,190,80,.1 | #08140f → #050a08 | 190,234,200,.92 · 186,226,222,.86 · 214,236,200,.6 · 206,236,184,.9 · 180,220,214,.78 · 255,255,255,.6 | #ecf2e8 → #dfe8dc |
| Sunset | 255,120,60,.36 · 230,70,120,.3 · 180,60,120,.16 · 255,170,60,.22 · 150,60,200,.24 · 255,200,120,.12 | #160c0c → #0a0607 | 255,200,160,.94 · 255,184,196,.86 · 255,214,190,.6 · 255,220,170,.92 · 236,196,236,.76 · 255,255,255,.6 | #f6ebe2 → #ecdfd4 |
| Rose | 236,72,153,.38 · 168,85,247,.3 · 200,60,120,.16 · 244,114,182,.22 · 120,70,230,.22 · 255,160,180,.12 | #150a12 → #09060a | 252,196,222,.92 · 226,200,250,.86 · 250,210,226,.6 · 250,206,230,.9 · 214,204,252,.76 · 255,255,255,.6 | #f6eaef → #ecdfe6 |
| Graphite | 150,150,170,.18 · 120,130,150,.14 · 100,100,120,.08 · 130,140,150,.12 · 140,130,150,.1 · 170,170,180,.06 | #0f0f12 → #08080a | 226,224,220,.9 · 218,220,222,.85 · 230,228,232,.5 · 214,218,222,.88 · 226,222,226,.7 · 255,255,255,.6 | #efedea → #e4e2de |

- **"Your own"** builds a room from one colour C. Let A = C rotated +40° in hue and B = C
  rotated −35°.
  - **dark glows:** C .42 · A .3 · C .15 · B .24 · A .2 · B .1; base = (C × 0.1 + 8) → `#07070c`.
  - **light glows:** pastel versions, each channel moved towards 255 by k: C k=.62 at .92 ·
    A k=.66 at .86 · C k=.75 at .55 · B k=.64 at .9 · A k=.72 at .75 · white .6. The base is
    `242 + (C − 242) × 0.06` → `228 + (C − 228) × 0.08`.
- **Swatch dot:** three of the preset's glows over its base, so a dot looks like its room.
- **No Save step:** a tap applies and saves at once, because the whole page is the preview.
  Dragging the custom picker previews without saving and saves on `change`. A "Default
  background" button appears once a non-default room is chosen.

**Brightness (one slider per theme).**
- **Dark, 0…100** (only lighter; the shipped room is the darkest it should be). With t = v/100:
  - mix toward `#fff`: `--bg` 14%·t, `--surface` 13%·t, `--card` 13%·t, `--cardhover` 14%·t,
    `--border` 16%·t, `--border-soft` 14%·t, `--subtext` 12%·t, `--faint` 18%·t, body 18%·t
  - veil: `body::after { content: ''; position: fixed; inset: 0; z-index: 0; pointer-events: none;
    background: rgba(170,168,210,.2·t) }` — over the canvas, under the app (`#app > *` is
    z-index 1), so every translucent glass panel lifts with it for free
- **Light, −50…+50, both ways:**
  - **dimmer** (t = −v/50): `--bg` toward `#8a7f70` 18%·t, `--surface` 12%·t, `--card` 11%·t;
    veil `rgba(70,58,40,.28·t)`
  - **brighter** (t = v/50): `--bg` toward white 45%·t, `--surface` 50%·t; veil
    `rgba(255,255,255,.45·t)`
- **Behaviour:** the slider of the theme on screen previews live while dragged and saves on
  release; the other theme's slider saves and says "switch theme to see it". The light slider
  snaps to 0 within ±2 so the shipped look is easy to find again. One "Default brightness"
  button covers both.

**"Set as default" — the user's own default look.**
- **The block:** at the end of the section, "⭐ Your default look".
- **Saving:** stores `{ theme, accent, backdrop, accentLight, backdropLight, toneDark, toneLight,
  at }` under a SYNCED key (`ui_look_default`), plus a raw localStorage mirror that can be read
  before sync answers.
- **The summary:** chips for 🌙/☀️ theme, the accent (a coloured dot plus its name), 🖼 the
  room, ☀️ light's own pair when it differs, 🔆 the two brightness values, and "set at
  <date time>".
- **The buttons:**
  - **⭐ Set this look as default** (primary)
  - **↺ Use my default** — applies all of it
  - **Remove default** — confirms; the current look stays
- **Applied once on every device:** each device keeps `ui_look_applied = <at of the default it
  applied>`. On the first sync after a NEWER default appears, it applies it once. A later change
  on one device stays that device's own until the next "Set as default".
- **Every "back to default" button** (colour, background, brightness, per scope) returns to
  the user's default when there is one, and to the shipped look otherwise.
- **A settings overview tile** at the top of Settings shows the accent in use for the theme on
  screen.

## 3. Motion — the part that makes it feel premium

One curve for everything that enters: **`cubic-bezier(.22, 1, .36, 1)`** (fast out, long soft
landing). Hover and colour changes take .12–.18s ease. A press is `translateY(1px)`, and a hover
lift is `translateY(-1px)`.

### 3a. Page transition — "curtain lift" from the click point (the signature)

Every navigation goes through one function:
- Every navigation calls it: top-bar group items, the ☰ menu, the palette, landing CTAs,
  "open this page" links and the theme toggle.
- A full-screen overlay covers the page instantly, and the new page renders underneath.
- A transparent circle then grows out of the centre of the element that was clicked, revealing
  the new page outward from your finger.

```ts
const UNVEIL_MS = 1400;
let el: HTMLDivElement | null = null, raf = 0;
export function pageTransition(trigger: Element | null, go: () => void): void {
  el ??= Object.assign(document.body.appendChild(document.createElement('div')), { id: 'nav-ripple' });
  if (raf) cancelAnimationFrame(raf);
  let ox = 50, oy = 50;                                   // origin, % of the viewport
  if (trigger) { const r = trigger.getBoundingClientRect();
    ox = ((r.left + r.width / 2) / innerWidth) * 100; oy = ((r.top + r.height / 2) / innerHeight) * 100; }
  const mask = (v: string) => { el!.style.maskImage = v; (el!.style as any).webkitMaskImage = v; };
  el.style.transition = 'none'; el.style.opacity = '1'; mask('none'); void el.offsetWidth;
  go();                                                   // render the new page under the cover
  raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => {   // two frames to paint it
    let t0 = 0; const ease = (t: number) => 1 - (1 - t) ** 4;              // ease-out quart
    const step = (now: number) => {
      t0 ||= now; const t = Math.min((now - t0) / UNVEIL_MS, 1), r = ease(t) * 175; // 175% reaches every corner
      mask(`radial-gradient(circle at ${ox}% ${oy}%, transparent ${r - .5}%, black ${r + .5}%)`);
      if (t < 1) raf = requestAnimationFrame(step); else { el!.style.opacity = '0'; mask('none'); raf = 0; }
    };
    raf = requestAnimationFrame(step);
  }); });
}
```
```css
#nav-ripple { position: fixed; inset: 0; z-index: 8000; pointer-events: none; background: #181818; opacity: 0; }
html.light #nav-ripple { background: color-mix(in srgb, var(--bg) 88%, #6b5f4c); }  /* a shade off the page */
```
- The overlay never blocks input (`pointer-events: none`).
- A new transition cancels the running one.
- With `prefers-reduced-motion: reduce`, call `go()` directly.

### 3b. Page entrance — a staggered reveal

The new page's blocks rise 8px and fade in, one after another, so the page assembles rather than
pops.
```css
.tab       { animation: fadeUp .4s cubic-bezier(.22,1,.36,1) both; }
.tab > *   { animation: fadeUp .5s cubic-bezier(.22,1,.36,1) both; }
.tab > .pg-hero { animation-delay: .02s; }   .tab > .toolbar, .tab > .cb { animation-delay: .10s; }
.tab > .card    { animation-delay: .14s; }   .tab > .results { animation-delay: .18s; }
@keyframes fadeUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
```

### 3c. Long marketing pages — reveal on scroll

An `IntersectionObserver` (threshold .15) adds `.in` once per section, and the children of a
`.stagger` container follow in 80ms steps. Pure CSS after that.
```css
.rise { opacity: 0; transform: translateY(18px); transition: opacity .7s ease, transform .7s cubic-bezier(.22,1,.36,1); }
.rise.in { opacity: 1; transform: none; }
.rise .stagger > * { opacity: 0; transform: translateY(12px); transition: opacity .55s ease, transform .55s cubic-bezier(.22,1,.36,1); }
.rise.in .stagger > * { opacity: 1; transform: none; }
.rise.in .stagger > *:nth-child(1) { transition-delay: .05s; }  /* +.08s per child … */
```

**Story / cinematic pages** (optional): full-viewport chapters on a snap scroller.
- Each element carries `.reveal`: `opacity: 0; translateY(28px)`, with a 1.4s transition on the
  same curve family.
- It reveals when its chapter gets `.revealed`. Scrolling back up hides it with a quick
  .35s fade down.
- A glass "rail" of numbered stops sits beside the chapters.

### 3d. Everything else that enters

| Layer | Animation |
|---|---|
| Top-bar dropdown | `ngIn .14s ease-out` — from translateY(-4px), opacity 0 |
| Command palette | `cp-up .18s cubic-bezier(.22,1,.36,1)` — from translateY(-8px) scale(.985); backdrop `cp-in .14s` fade |
| Dialog | `dialogIn .26s cubic-bezier(.22,1,.36,1)` — from translateY(14px) scale(.985). Never borrow a centred modal's keyframes that carry a translateX, or every popup slides in from the side |
| Large modal | `modalIn .28s` — from translateY(16px) scale(.985) |
| Phone sheet | `sheetIn .26s` — from translateY(20px) |
| Chat turn | `chatRise .16s` — from translateY(5px) |
| Boot splash | `splashIn 1.8s cubic-bezier(.16,1,.3,1)` — from translateY(18px), once per session |
| Jump-to-control flash | `@keyframes flash { 0% { box-shadow: 0 0 0 0 var(--accent) } 30% { box-shadow: 0 0 0 4px color-mix(accent 45%) } 100% { box-shadow: 0 0 0 0 transparent } }` 1.2s, on the target a step/link scrolled to |
| Spinner | 14px ring, `--border` with an `--accent` top, `.7s linear` (icon spinners .9s) |

**Rule:** `prefers-reduced-motion: reduce` switches off the canvas drift, the curtain,
entrances, halos and pulses.

## 4. Glass recipes (reuse these four; do not invent a fifth)

**A. Panel / card** (no blur):
```css
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; }
html:not(.light) .card { background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.035)), rgba(13,12,22,.5);
  border-color: rgba(255,255,255,.12); box-shadow: inset 0 1px 0 rgba(255,255,255,.11), 0 22px 48px -26px rgba(0,0,0,.9); }
html.light .card { background: linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.62));
  border-color: rgba(255,255,255,.9); box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(60,45,25,.06), 0 18px 40px -20px rgba(60,45,25,.3); }
```
**B. Tile inside a card** (list entries, small panels; radius 14px, no blur):
```css
html:not(.light) .tile { background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025)), rgba(10,10,18,.35);
  border: 1px solid rgba(255,255,255,.1); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }
html.light .tile { background: linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  border: 1px solid rgba(255,255,255,.95); border-radius: 14px; box-shadow: inset 0 1px 0 #fff, 0 10px 26px -18px rgba(60,45,25,.3); }
```
**C. Floating layer** (dropdowns, palette, menus; real blur, 0.9–0.98 opaque so text behind
never shows through):
```css
html:not(.light) .float { background: linear-gradient(180deg, rgba(30,28,44,.98), rgba(20,19,31,.96));
  border: 1px solid rgba(255,255,255,.11); box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -20px rgba(0,0,0,.8);
  backdrop-filter: blur(28px) saturate(170%); }
html.light .float { background: linear-gradient(180deg, rgba(255,253,250,.96), rgba(255,253,250,.9));
  border: 1px solid rgba(255,255,255,.9); box-shadow: var(--shadow-lg); backdrop-filter: blur(28px) saturate(180%); }
```
**D. Dialog** (radius 20px, padding 22px 22px 18px, two accent glows inside):
```css
.dialog-backdrop { background: rgba(3,5,9,.42); backdrop-filter: blur(14px) saturate(1.2); }
html.light .dialog-backdrop { background: rgba(240,236,248,.38); }
.dialog { position: relative; border-radius: 20px; padding: 22px 22px 18px; overflow: hidden; isolation: isolate; backdrop-filter: blur(30px) saturate(1.6); }
.dialog::before { content: ''; position: absolute; z-index: -1; inset: 0; pointer-events: none;
  background: radial-gradient(70% 55% at 0% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%),
              radial-gradient(60% 50% at 100% 100%, color-mix(in srgb, var(--blue) 12%, transparent), transparent 70%); }
html:not(.light) .dialog { background: rgba(20,18,32,.62); border: 1px solid rgba(255,255,255,.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 30px 80px -24px rgba(0,0,0,.85); }
html.light .dialog { background: rgba(255,255,255,.66); border: 1px solid rgba(255,255,255,.95);
  box-shadow: inset 0 1px 0 #fff, 0 30px 70px -26px rgba(60,45,90,.4); }
```
Large modal / detail sheet: `width: min(860px, 94vw); max-height: 92dvh; border-radius: 22px`,
using recipe C at .97/.94 opacity. On phones it becomes a bottom sheet.

## 5. Layout shell

```
<header id="topnav">  wordmark · page groups (≥1100px) or crumb · search pill (Ctrl K) · theme toggle · ☰
<main id="main">      one <section class="tab"> per page, only one visible
```
- `#main { max-width: 1240px; margin: 0 auto; padding: 76px 34px 96px; }` (76 = 56px bar + 20).
  Phones: about 14px at the sides.
- **Wide workstation pages** (a trading station, an editor) may break out to the full width
  (`max-width: none`).
- **ONE registry of pages:** `PAGES = [{ id, icon (emoji), group, desc: {en, vi}, words }]` plus
  `PAGE_GROUPS` (e.g. Market · Trading · Money · Learn & system).
  - The top-bar groups, the ☰ menu, the palette and the crumb ALL render from it.
  - A test fails when a route has no entry.

**Top bar** — fixed, 56px, padding 0 22px, z-index 80, real blur (recipe C family):
- Dark: `linear-gradient(180deg, rgba(22,21,34,.66), rgba(16,15,26,.5))`,
  `border-bottom: 1px solid rgba(255,255,255,.08)`, `blur(24px) saturate(160%)`.
- Light: `rgba(255,255,255,.62) → .42`.
- **Wordmark** (text only): Source Serif 4 15px/400, `letter-spacing: .18em`, uppercase, opacity .9.
- **Group buttons:** 34px high, padding 0 11px, radius 8px, `600 13.5px`, `--subtext`, with a
  chevron that turns 180° when open.
  - The active group gets a 2px accent underline sitting on the bar's bottom edge.
  - The dropdown is 360px wide, recipe C, radius 12px.
  - Each item is a 32px emoji tile + a 13.5px/600 name + a 12px one-line description. The
    current page shows an accent wash and an accent line.
  - The dropdown opens on hover AND on click. After a click, it does not re-open on hover until
    the pointer leaves.
- **Crumb** (shown below 1100px): `GROUP / Page`.
- **Search pill:** 32px high, radius 999px, an accent magnifier, "Search…", and a
  `<kbd>Ctrl K</kbd>` (⌘K on a Mac). It shrinks to a 34px circle at ≤640px.
- **Theme toggle:** a 32px glass circle that runs `pageTransition` from itself. **☰:** a
  22px three-line SVG.

**☰ menu** — a full-viewport (`100dvh`) blurred overlay:
- A 50px-high search field on top that opens the palette.
- Then four group panels (radius 18px), each with a 36px accent icon tile, a title and a
  count.
- Page rows are a 34px emoji tile + a 14.5px/650 name + a two-line description. At ≤720px they
  become a 2-column tile grid.

**Command palette** (Ctrl/⌘ K, or `/` outside inputs):
- A 640px panel, radius 16px, recipe C, opening with `cp-up`.
- Results are grouped (Pages, Settings, Sections, Actions) under uppercase group heads.
- The selected row shows an accent wash with an inset accent line and a `↵`.
- Arrow keys move, Enter opens, Esc closes.
- With an empty query, the device's recent pages come first.

## 6. Page anatomy

**6a. Page head** (every working page opens with it; no band, no box):
```html
<header class="pg-hero" style="--c: var(--blue)">          <!-- --c = the page's own tint -->
  <div class="pg-hero-row">                                  <!-- flex, align-items:flex-end, gap 16px -->
    <div><span class="pg-hero-kicker"><i>🔎</i>Market</span><h1>Screener</h1>
         <p class="subtitle">Filter the market by your own rules.</p></div>
    <div class="pg-hero-side"><!-- status / primary action --></div>
  </div>
</header>
```
- **Kicker:** `padding 3px 11px 3px 4px; radius 999px; 700 10.5px; letter-spacing .1em;
  uppercase; color var(--c)`, with a `--c` 11% fill and a 30% border. The icon sits in a 20px
  circle with an 18% fill.
- **h1:** `600 clamp(22px, 2.6vw, 30px)`, `letter-spacing -.018em`.
- **Subtitle:** 13px/1.55 `--subtext`, one sentence saying what the page is FOR.
- `margin-bottom: 24px` (18px on phones).

**6b. Section sub-heading** (one helper renders them all):
- **Label:** `600 14px`, optional emoji first, followed by count chips and a right-aligned slot.
- **Sub line** (optional): 11.5px/1.55 `--subtext`.
- **The rule under it** belongs to the whole block. Its first 56px are tinted by the section's
  tone, the rest is a hairline:
  `linear-gradient(90deg, color-mix(in srgb, var(--st-tone, var(--accent)) 60%, transparent) 0 56px, var(--border-soft) 56px)`
  `background-size: 100% 1px; background-position: left bottom; padding-bottom: 8px; margin: 30px 0 13px`.
- A risk section sets `--st-tone: var(--danger)`.

**6c. Chips, pills, badges**
- **`.ui-pill`:** `height 22px; padding 0 9px; radius 999px; 700 11px`. Its colour comes from
  `--p` with a 12% fill and a 32% border; tones are default/faint, `.accent`, `.up`, `.down`,
  `.warn`, `.muted`.
- **Status words are pills, not text:** Open, Closed, Win, Loss, Buy, Sell, Mine, Shipped.
- **Count chip:** a mono 700 figure in the accent on an accent 9% fill.
- **Date chip:** all mono 10.5px.

**6d. KPI tiles and the number strip**
- **KPI grid:** `repeat(auto-fit, minmax(min(100%, 244px), 1fr)); gap 10px`.
  - Tile: radius 7px, padding 11px 13px, `min-width: 0; overflow-wrap: break-word`; hover lifts
    1px.
  - Label 12px/500 `--subtext`; value `600 19px`, tabular. Signs use `--up`/`--danger`.
- **Solid tiles** for figures that must stand off the glass: light `#fff`, with a 1px
  `rgba(60,45,90,.1)` border and a soft violet drop.
- **Number strip:** the key figures of a form or ticket sit ABOVE the thing they describe.
  - It is a wrapping row of tiles: a `small` 10px uppercase label over a `b` 13.5px mono value.
  - Each tile is sized to its content, never truncated, and may carry a 3px left edge in its
    tone.
  - Amber when a value disagrees with its rule (e.g. the size differs from the playbook's).

**6e. Folds** (`<details>` sections): the open/closed state is stored per id in ONE settings
blob and baked into the HTML (`open` attribute) when rendering. Never patch it after mount,
because it flickers. An explanation box may default to closed.

## 7. Controls — ONE button language

Taken from the landing page, the screen the owner likes best. Every legacy class in the repo
(`.btn`, `.btn-outline`, `.mini-btn`, `.range-btn`, toolbar buttons) is mapped onto these
tokens, so old and new screens draw the same control. Change a token and the whole app follows.
**Shape:** capsules for controls (`--ctl-radius: 999px`); fields stay at 10px radius.

**Primary — the landing CTA** (`.ui-btn.primary`, `.btn`):
```css
.ui-btn.primary { position: relative; overflow: hidden; isolation: isolate; border-radius: 999px;
  border: 1px solid var(--cta-line); background: var(--cta-bg); color: #fff; font-weight: 700; box-shadow: var(--cta-shadow);
  transition: transform .25s cubic-bezier(.22,1,.36,1), box-shadow .25s ease; }
.ui-btn.primary::after { content: ''; position: absolute; z-index: -1; top: 0; bottom: 0; left: -60%; width: 45%;
  background: linear-gradient(100deg, transparent, rgba(255,255,255,.32), transparent);
  transform: skewX(-18deg); transition: left .7s cubic-bezier(.22,1,.36,1); }          /* the sheen */
.ui-btn.primary:hover { transform: translateY(-1px); box-shadow: var(--cta-shadow-hover); }
.ui-btn.primary:hover::after { left: 120%; }
```
**Secondary — frosted ghost** (`.ui-btn`):
```css
.ui-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 36px; padding: 0 16px;
  border-radius: 999px; border: 1px solid var(--glass-line); background: var(--glass-bg); color: var(--text);
  box-shadow: var(--glass-hi), var(--glass-drop); font: 650 13px var(--font-ui); white-space: nowrap; }
.ui-btn:hover { background: var(--glass-bg-hover); border-color: var(--accent-line);
  box-shadow: var(--glass-hi), 0 0 0 3px var(--accent-wash), var(--glass-drop); transform: translateY(-1px); }
.ui-btn.sm { height: 30px; padding: 0 12px; font-size: 12px; }   .ui-btn.ghost { background: transparent; }
.ui-btn.danger { color: var(--down); border-color: color-mix(in srgb, var(--down) 45%, transparent);
  background: linear-gradient(180deg, color-mix(in srgb, var(--down) 16%, transparent), color-mix(in srgb, var(--down) 6%, transparent)); }
.ui-btn.danger:hover { color: #fff; border-color: var(--down); background: linear-gradient(180deg, color-mix(in srgb, var(--down) 85%, #fff), var(--down)); }
.ui-btn[disabled] { opacity: .45; cursor: not-allowed; transform: none; }
```
- Never put two primaries side by side.
- Destructive actions are `.danger`, never the accent.
- A toggled-on secondary shows accent text on an accent 22% → 8% wash.

**Icon buttons** (`.ui-icon-btn`): 30px glass circles for ✕ ↺ ✎, always with `aria-label`;
`.danger` fills red on hover.

**Segmented tracks** (`.seg`; every exclusive choice: ranges, currencies, views, EN/VI,
Buy/Sell, tabs):
```css
.seg { display: inline-flex; align-items: center; gap: 2px; padding: 3px; border-radius: 999px;
  background: var(--track-bg); border: 1px solid var(--track-line); box-shadow: inset 0 1px 2px rgba(0,0,0,.18); }
.seg > button { height: 26px; padding: 0 11px; border: 0; border-radius: 999px; background: transparent;
  color: var(--subtext); font: 700 11.5px var(--font-mono); white-space: nowrap; }
.seg > button.active { color: var(--accent); background: var(--thumb-bg); box-shadow: var(--thumb-shadow); }
```
- A small uppercase caption may sit to its left.
- **Trap:** if the track also wears a toolbar or row class inside a page container
  (`#main .toolbar { padding-bottom: 0; border-bottom: none }`), that rule outranks `.seg` and
  removes the bottom padding and border, so the thumbs sit on the edge. Restate padding and the
  full border at `#main .toolbar.seg` specificity.
- The track always has an even 3px gap on all four sides.

**Toggle chips** (non-exclusive: EMA lines, filters): glass capsules; active = accent text on an
accent wash with an accent line.

**Fields:**
```css
.field { background: var(--field-bg); border: 1px solid var(--field-line); border-radius: 10px; padding: 9px 12px;
  font: 14px var(--font-ui); color: var(--text); min-height: 38px; }
.field:hover { border-color: var(--field-line-hover); }
.field:focus { outline: none; background: var(--field-bg-focus); border-color: var(--accent); box-shadow: 0 0 0 3px var(--accent-wash); }
.field::placeholder { color: var(--faint); }
```
- **Labels:** `600 11px` uppercase .06em `--subtext`; inside dialogs `800 10.5px .1em --faint`.
- **ONE dropdown on every OS:**
  - `select.field { appearance: none; padding-right: 34px; background-image: var(--chev);
    background-position: right 12px center; background-size: 12px 8px; font: 600 13px var(--font-ui) }`.
  - `--chev` is a 12×8 SVG chevron, one colour per theme.
  - Option lists are dark with light text in dark mode, and white with dark text in light mode
    (set on `option, optgroup`). Never white on white.
- **Date inputs on iOS:** Safari gives `<input type=date>` an intrinsic width that ignores
  `width: 100%`, so in a two-column row it overlaps its neighbour. Fix it inside
  `@supports (-webkit-touch-callout: none) { input[type=date].field { appearance: none; display: block;
  width: 100%; min-width: 0; min-height: 38px; text-align: left } }`. Every child of a 2-column
  form row gets `min-width: 0`.

**Row actions** (the buttons at the end of a table row): a `<div class="row-acts">` (flex,
gap 6px, nowrap) INSIDE the cell. Never put `display:flex` on the `td` itself; that breaks the
table.
- Icon actions are 30px glass squares (radius 10px). Labelled actions are 30px glass capsules
  (padding 0 12px, `650 12px`).
- **Every action has a meaning colour** through one variable: color = `var(--ab)`, border =
  `--ab` 40%, fill = `--ab` 18% → 6%. On hover it fills solid `--ab` with white text.
  - **Assignments:** add/primary = `--accent` · delete = `--down`, red **at rest** so it reads as
    delete before the hover · chart = `--blue` · stop = `--warn` · target/plan/open-in-station =
    `--accent` · sell = `--down` · neutral = `--subtext`.
  - **Trap:** set `--ab` only on the modifiers and read it with a fallback
    (`var(--ab, var(--subtext))`). Declaring the default on a high-specificity base rule
    (`#main .action-btn { --ab: … }`) silently beats every modifier.

**Steps bar** (any multi-decision flow: a trade, a checkout, onboarding): a single bar under
the page's top strip, listing the decisions in the order they are made. Each step shows its
current value and jumps to its control.
```css
.steps { display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 6px; border-radius: 18px;
  border: 1px solid var(--glass-line); background: var(--glass-bg); box-shadow: var(--glass-hi), var(--glass-drop); scroll-snap-type: x proximity; }
.step { flex: 1 0 auto; min-width: 128px; display: flex; align-items: center; gap: 9px; padding: 7px 12px 7px 8px; border-radius: 13px; text-align: left; }
.step > i { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font: 800 11.5px var(--font-mono);
  color: var(--subtext); border: 1.5px solid var(--border); background: var(--surface); }
.step b { font: 700 12px var(--font-ui); }   .step small { font: 600 11px var(--font-mono); color: var(--faint); }
.step.done > i { color: #fff; border-color: transparent; background: var(--cta-bg); }      /* ✓ */
.step.todo > i, .step.todo small { color: var(--accent); }  .step.todo > i { border-color: var(--accent-line); }
.step.warn > i, .step.warn small { color: var(--warn); }   .step.opt > i { border-style: dashed; }   /* optional */
.step.go { background: var(--buy-bg); border: 1px solid var(--cta-line); box-shadow: var(--buy-shadow); color: #fff; }  /* the final action */
```
- A tap scrolls the target into the centre and flashes it (§3d).
- The same numbers appear on the controls themselves as small 17px circles (`.no`), so the bar
  and the page say the same thing.
- On a phone the bar is sticky under the top bar (`top: 62px`, blurred) and scrolls sideways.

**Confirm state** (when a plan, a draft or an order must be confirmed): one card with three
looks, never a hidden side effect.
- **Not yet:** a dashed accent border with a primary "Confirm" button.
- **Confirmed:** a solid green-tinted card that says when and against which values, with a ghost
  "Undo".
- **Changed since confirmed:** amber, with "Confirm again".

**When the app changes a number the user gave, it says so.** A cap or a correction (not enough
cash for the size, a value clamped to a rule) shows a note right under the form, in warn
colours, with the before → after in bold mono: "Not enough cash for 1,174 shares (needs
€217,836, the account has €14,000): shares cut from **1,174** to **75**." If nothing at all is
possible, the note turns red, explains why ("1 share costs €186 with the fee"), and the primary
button is disabled. A number typed by the user is kept as typed; one the app suggested follows
the inputs it came from.

**Horizontal switchers** (several lists, several tabs): one row of capsules that scrolls
sideways (`overflow-x: auto; flex-wrap: nowrap; scrollbar-width: none; scroll-snap-type: x
proximity`). Each item shows its count in a small mono figure; the active one gets the thumb
style. Never let a tab bar wrap to two lines on a phone.

**Floating dock** (the phone's always-reachable primary actions, e.g. Buy / Sell):
- It sticks to the bottom of its section as a **glass capsule**, not a full-width band:
  `margin: 14px 0 0; padding: 6px; border-radius: 999px; border: 1px solid var(--glass-line);
  background: color-mix(in srgb, var(--card) 55%, transparent); backdrop-filter: blur(20px) saturate(170%);
  bottom: calc(10px + env(safe-area-inset-bottom))`.
- It holds two equal 44px capsule buttons.
- It stays symmetric. Do not leave room for the floating assistant button; instead raise that
  button above the dock while the dock is on screen (`html:has(#main .dock) #chat-fab { bottom: 84px }`).

## 8. Tables

**Classic table:**
```css
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 11px; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
main th { position: sticky; top: 0; z-index: 1; font: 650 10.5px var(--font-ui); letter-spacing: .075em; text-transform: uppercase;
  color: var(--subtext); padding: 10px 12px 9px; background: var(--th-bg); box-shadow: var(--th-hi); border-bottom: 1px solid var(--th-edge); }
th.sorted { color: var(--accent); box-shadow: var(--th-hi), inset 0 -2px 0 var(--accent); }
main tbody tr:hover { background: color-mix(in srgb, var(--accent) 4%, transparent); }
.id-cell { color: var(--accent); font-weight: 600; }      /* ticker/ID: the ONLY accent in a row */
```

**Grid table** (inside narrow columns or panels): a `display: grid` row per line with fixed
column tracks, plus a head row (10px uppercase `--faint` on `--surface`).
- Rows: `padding 10px 14px`, hairline separators.
- Numbers right-aligned in mono; actions right-aligned.

**Every table sorts and can go full screen, with no per-table wiring.** One script watches the
page (a MutationObserver plus a rAF debounce) and upgrades every table it finds:
- **Sorting:**
  - Every head with text becomes clickable and focusable (Enter/Space), shows a drawn sort icon (two
    stacked 8×12 chevrons painted through a CSS mask in the head's colour, at 35%), and when
    active turns accent, lights the chevron of the sort direction and dims the other, plus the
    `.sorted` underline. Never text glyphs (↕ ▲ ▼); they sit off the baseline in every font.
  - The first click sorts numbers biggest-first and text A→Z; the second flips.
  - **How a cell is read:** `data-sort-value` wins. Otherwise an ISO date sorts as a date, and a
    leading number is parsed after any currency sign or ±, in both 1,234.5 and 1.234,5 notation,
    with K/M/B suffixes. A dash or an empty cell is ALWAYS last. Words use `localeCompare` in the
    page's language.
  - **Rows that stay put:** a full-width detail row travels with the row above it, and an
    add/total row stays at the bottom.
  - **The order survives a re-render:** it is keyed by page + table + head texts and re-applied
    to the new tbody.
  - Tables that already sort their data (before paging) are left alone, but use the same head
    style.
- **Full screen:** each big table (≥6 columns or ≥12 rows) gets a 28px ⛶ glass button on its
  card's top edge. The card is wrapped once so the button does not scroll with the columns.
  - **Open:** the card becomes `position: fixed; inset: 14px` (0 on phones) over a blurred
    backdrop, with the section title on top. Esc, the button or the backdrop close it; the page
    does not scroll underneath.
  - **Trap:** the page-entrance animation leaves an identity transform on ancestors, which makes
    a fixed child a box inside its section. Neutralise transform, filter and contain on every
    ancestor while the table is open.

**Rules for both kinds:**
- **Overflow:** a table lives in a card with `overflow-x: auto`, never `overflow: hidden`. Each
  row type keeps a `min-width` equal to the sum of its columns, so the last column (the action)
  is always reachable by scrolling.
- **Narrow screens:** a "card rows" fallback (2 columns, head hidden) keys off the WINDOW width,
  so it cannot help a 700px column on a wide screen; the scroll above covers that case.
- **Sticky first column on phones:** its background must be opaque (dark about
  `rgb(23,21,35)`, light `#fbf9f6`).
- **Colour:** gains `--up`, losses `--danger`, never the accent.
- **Overview tables gather every account/project** with the owner's name as the first column,
  read-only, each row linking to where it is edited, and capped (e.g. 60 newest) with a line
  saying where the rest is.

## 9. Dialogs and sheets

- **Structure:** `.dialog-host > .dialog-backdrop + .dialog`, with `.dialog-head`,
  `.dialog-body` and `.dialog-actions`.
  - **Head:** a 38px icon tile (radius 12px, accent text, `linear-gradient(160deg, accent 26% →
    8%)`, `--accent-line` border), a title and a 12px `--subtext` sub line.
  - **Actions:** a hairline top border, then a ghost Cancel and the primary Save on the right.
- **Fields** sit on a 2-column grid that becomes one column at ≤520px.
- **Grouped lists inside a dialog** (choices, reasons, results):
  - The ONE thing to do goes first and lit, e.g. "Add your own" in an accent-gradient card.
  - The user's own items come next, highlighted with an accent edge.
  - The stock items follow, quiet, in a 2-column grid, with the remove control on hover only.
  - Removed items go last, in a collapsed "Taken off the list" fold of dashed chips that bring
    them back.
- `max-height: 92dvh` (dvh, so the iOS toolbar cannot cover the footer).
- **The nested-scroller trap:** the dialog body is a flex column whose children do not shrink
  (`> * { flex-shrink: 0 }`). On phones (≤700px) there is ONE scroller, the body. A scrolling
  list inside a scrolling grid body gets an automatic minimum height of 0 and collapses to
  nothing on a short screen.
- **Checkbox lists on phones:** give every cell an explicit grid place (tick | date + kind +
  title | link). Five cells auto-placed into three columns push the title into the 24px link
  column.

## 10. Layout patterns worth reusing

- **Workstation (3 columns ≥1200px):** decisions | the subject | the action.
  - Example: plan & grade (left, 340–380px) · tabs + number strip + chart (centre, `minmax(0, 1fr)`)
    · ladder + ticket (right, 300–320px).
  - Use `grid-template-areas` so each breakpoint only re-orders: 901–1199px puts center + right
    on top with the plan under; a phone stacks them in the order the decisions are made
    (bar → steps → subject → decisions → action).
  - A 13–16" MacBook is 1440–1728 CSS px wide, so three columns must already work at 1200px.
- **Performance by period** (any account / fund / project with a value over time): one glass
  card of ten tiles **1D · 1W · 1M · 3M · 6M · YTD · 1Y · 3Y · 5Y · SI**, 10 across (5 below
  1240px, 2 on phones).
  - **Tile content:** the code in mono 800 12px with its words in 10.5px `--faint`, the % in
    `650 19px` tabular in gain/loss colour, the money earned below it in mono, a 4px track
    whose fill length is |%| ÷ the largest |%| on the card (fill gradient to the tone with a
    soft glow), and "≈ +17.3% / yr" for periods of 3Y or more.
  - **Tile frame:** a 2px top edge in the tone, a 9% tone wash fading down the tile, and an
    accent border on YTD and SI.
  - **Missing periods:** a period the account is too young for stays in place, dimmed to 55%,
    with "—" and a tooltip "data starts <date>". Never leave a gap, never extrapolate.
  - **Header:** a title, one line saying the % is time-weighted (deposits removed) while the
    money is what was earned, and "as of <date>" plus an SI pill on the right.
  - **The maths:** % = TWR index ratio (end ÷ the last point on or before the period start). A
    period starting before the first data point is not available. YTD for an entity opened this
    year = since inception. Money = Δvalue − net flows in the window. Annualize only spans of a
    year or more.
  - **Several entities:** a matrix below — rows = entities with an "All" total row pinned first,
    columns = the ten codes. Each cell is mono % in tone with a 3px bar under it, scaled to the
    whole matrix, and its value in `data-sort-value` so the columns rank.
  - **Combining entities:** carry each one's value forward, sum per date, and book a later
    entity's opening capital as a deposit on its first day, or opening it reads as performance.
- **Card grids** use `repeat(auto-fit, minmax(min(100%, 380px), 1fr))`. Use auto-FIT, not
  auto-FILL: auto-fill keeps empty tracks, so a single card sits in half the row.
- **Quick cards** (a compact summary of something with a full editor elsewhere): a header with
  the name + a grade pill, 4 level tiles, a mini chart and a footer with the primary "open in
  the full tool".
- **Tabs above the content they switch**, the number strip inside the chart card, and the
  account/date context at the top of the decisions, so the user picks WHEN and WITH WHAT before
  judging anything.

## 11. Floating assistant button (if the app has chat/help)

A 54px glass lens at the bottom right (44–48px on phones):
- A conic-gradient halo (`accent → blue → #18bea8 → #e246a8 → accent`, blur 12px, opacity .55,
  spinning 14s) under a frosted core (blur 14px).
- A highlight crescent across the top, and a chat bubble with a small spark.
- **Hover:** lifts 2px, the halo goes to .9, the core scales 1.05 and the spark turns 90°.
- It moves up to clear any bottom dock (§7).

**Read-only / shared view pill** (when a user views someone else's data): a glass capsule
fixed bottom-left (`left: 14px; bottom: 14px + safe-area`, radius 999px, `--accent-line`
border, blur 18px), holding a 24px eye badge on `--accent-wash` and "Viewing **<owner>**'s data
· read-only", with the owner's name in the accent. A tooltip says how much is shared and that
changes are not saved. Menus, the palette and the ☰ list show only the shared pages (empty
groups hidden), and a link to a hidden page lands on the first shared one.

## 12. Responsive and phone rules

- **Breakpoints:** 1600 · 1200 (3 → 2 columns) · 1100 (top-bar groups ↔ crumb) · 900 (single
  column) · 760 (card-rows) · 720 (phone menu, command bar wraps) · 640 · 520 (dialog single
  column) · 420.
- Every grid/flex child that holds text gets `min-width: 0`; a track cannot shrink below its
  content otherwise.
- A media query asks the window, not the card. Components in narrow columns need their own
  overflow handling (§8).
- Respect `env(safe-area-inset-*)` on fixed bars, docks and sheets; use `dvh` for full-height
  layers.
- Use one scroller per screen region on phones. Horizontal bars scroll sideways with hidden
  scrollbars and snap.
- Test headless at 390 / 500 / 768 / 1100 / 1440 / 1512 in both themes.

## 13. Copy and i18n

- Bilingual (EN/VI here): every label goes through the i18n table, and page names and one-line
  descriptions live in the PAGES registry as `{en, vi}`.
- Sentence case everywhere, except kicker pills, table headers, field labels, palette group
  heads and segment captions (small uppercase with tracking).
- Buttons say what happens ("Save as a case study only — no buy"), not "OK".
- Empty states say what will appear and how to make it appear.

## 14. Implementation rules

- **Tokens:**
  - All tokens live in one place, and components only read `var(--…)`.
  - No hard-coded white/black in components outside the glass recipes.
  - Change a token, not twenty selectors.
- **Glass in both themes:** every glass rule is written twice, `html:not(.light) …` (smoke) and
  `html.light …` (frost).
- **Specificity:**
  - When pages live under an id container (`#main`), its rules beat single classes. Write
    `#main .x`, prefix with `html`, or use variables (like `--th-bg`, `--ab`) instead of
    `!important`.
  - A panel that is NOT inside `#main` (a modal) needs both branches.
- **Blur:** never blur a card on the static canvas; blur only floating layers.
- **Class names are namespaced per screen** (`stn-…`, `xr-…`, `pc-…`) and never reused for a
  different element. A shared name once gave a container a chip's `border-radius: 999px`, and it
  was drawn as a giant ellipse.
- **Additive style changes:** append a dated block at the end of the stylesheet that restates
  what it changes, instead of rewriting old rules in place. Never run a formatter over the whole
  stylesheet.
- **Accessibility:**
  - Visible `:focus-visible` (a 2px accent outline, offset 1–2px).
  - Contrast ≥ 4.5:1 in both themes.
  - Icon-only buttons get `aria-label`.
  - Dropdowns work with the keyboard (Enter/Esc/arrows).
  - `prefers-reduced-motion` is honoured everywhere.

## 15. Done when

1. Both themes switch instantly (with the curtain from the toggle), persist, and never flash on
   load. The accent picker recolours every CTA. Accent, background and brightness can be set
   for both themes or each alone, and "Set as default" restores the same look on every device.
2. Every navigation runs the curtain-lift transition from the clicked element, and the new page
   assembles with the staggered fadeUp.
3. The top bar is 56px glass. The ☰ menu, the groups, the crumb and Ctrl K are all generated
   from the PAGES registry.
4. Every page opens with kicker + h1 + subtitle; sections use the toned rule.
5. There is exactly one button language (CTA with sheen · glass · danger · icon · seg track),
   one dropdown look on every OS, and no local one-off styles.
6. Tables have the tinted sticky header band, scroll to their last column, and keep row actions
   in `.row-acts` with meaning colours.
7. Multi-step flows show the steps bar, and confirmations are a visible state.
8. Checked at 390, 768, 1100 and 1440 px in both themes: no horizontal overflow, nothing
   clipped, no tab bar on two lines, no dock that is lopsided or sits on a black band, date
   fields inside their column, dialog lists visible on a short phone.

--- PROMPT END ---
