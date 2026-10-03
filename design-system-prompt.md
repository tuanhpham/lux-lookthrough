# Design-system prompt — "The Professional" look (Kraken-dark + liquid glass)

> Cách dùng: copy TOÀN BỘ phần từ dòng `--- PROMPT START ---` đến `--- PROMPT END ---`
> rồi dán vào Claude Code / Copilot / Cursor ở repo khác. Nếu repo đó dùng React/Tailwind,
> giữ nguyên các con số; chỉ cách viết (class, component) là đổi.
> Mọi giá trị bên dưới lấy thẳng từ `screener-ts/apps/desktop/src/styles.css`,
> `ui/pageHero.ts`, `ui/pages.ts`, `ui/theme.ts`, `index.html` (bản ngày 2026-10-02).

--- PROMPT START ---

You are restyling this application to match an existing design system I love. Apply it
everywhere: the top header, the navigation menu, page heads, cards, tables, buttons, forms,
dialogs, both themes. Follow the values below exactly; where this repo has a component I did
not describe, derive it from the closest recipe here rather than inventing a new style.
Do not add UI libraries just for this — plain CSS custom properties are enough (if the repo
already uses Tailwind, map these tokens into its theme config).

## 0. The idea in one paragraph

A precision trading-terminal UI. Dark mode follows Kraken Pro: a near-black canvas, ONE violet
brand colour, green/red reserved for up/down only, hairline borders, tabular numbers. Both
themes are "liquid glass": a softly lit, slowly drifting gradient room behind everything, and
panels of frosted glass on top with a bright 1px top edge. Light mode is the same layout in
white frost over a warm pastel room (never "dark mode with the lights on"). Text always sits
on a panel, never directly on a glow. Only layers that FLOAT over content (top bar, dropdowns,
palette, modal, dialogs) get a real `backdrop-filter`; cards over the static canvas fake the
glass with translucent gradients (it looks identical and costs nothing).

## 1. Tokens

Theme switch = class `light` on `<html>`. Dark is the default (`:root`). Persist the choice
in localStorage `theme`; respect `prefers-color-scheme` on first visit.

```css
:root {
  --bg: #0d0d12;            /* page; body itself is #09090f under the glass canvas */
  --surface: #121219;       /* inputs, tiles, segmented tracks */
  --card: #16161e;
  --cardhover: #1e1e28;     /* hover tint for rows/items */
  --border: #2d2d3b;
  --border-soft: #23232e;
  --text: #f2f2f8;
  --subtext: #b4b3c8;
  --faint: #8584a0;

  --accent: #8b6cff;        /* BRAND violet. Never use it to mean "gain". */
  --accent-ink: #ffffff;    /* text on an accent fill */
  --accent2: #5b8cff;
  --blue: #5b8cff;
  --violet: #c084fc;
  --up: #18d89a;            /* gain */
  --danger: #ff5266;        /* loss / destructive */
  --down: var(--danger);
  --warn: #ffb648;

  --accent-wash: color-mix(in srgb, var(--accent) 12%, transparent);
  --accent-line: color-mix(in srgb, var(--accent) 42%, transparent);
  --ring:        color-mix(in srgb, var(--accent) 30%, transparent);

  --radius: 10px; --radius-sm: 7px; --radius-xs: 5px;
  --shadow:    0 1px 0 rgba(255,255,255,.02) inset, 0 6px 18px -14px rgba(0,0,0,.8);
  --shadow-lg: 0 1px 0 rgba(255,255,255,.03) inset, 0 32px 64px -24px rgba(0,0,0,.8);

  --font-ui:   'IBM Plex Sans', 'Hanken Grotesk', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  --font-num:  'IBM Plex Sans', 'Hanken Grotesk', system-ui, sans-serif;  /* every datum, tabular */
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace; /* kbd, chips, dates */
  --font-serif:'Source Serif 4', Georgia, serif;  /* ONLY the wordmark + marketing/story pages */

  /* table header band */
  --th-bg:   linear-gradient(180deg, rgba(255,255,255,.075), rgba(255,255,255,.03)), rgb(23,21,35);
  --th-edge: color-mix(in srgb, var(--accent) 38%, rgba(255,255,255,.1));
  --th-hi:   inset 0 1px 0 rgba(255,255,255,.07);
}
html.light {
  --bg: #eae4db; --surface: #f5f1ea; --card: #fffdf9;
  --cardhover: rgba(110,88,60,.07);           /* a tint, not a colour: it lands on glass */
  --border: rgba(92,72,46,.17); --border-soft: rgba(92,72,46,.10);
  --text: #191510; --subtext: #5d564a; --faint: #827a6b;   /* warm ink on warm paper */
  --accent: #6a3de8; --accent-ink: #fff; --accent2: #3a6fe0; --blue: #3a6fe0; --violet: #9333ea;
  --up: #0b8f69; --danger: #cf1f38; --warn: #a86500;       /* re-tuned for ≥4.5:1 on cream */
  --accent-wash: color-mix(in srgb, var(--accent) 9%, transparent);   /* lower fill, */
  --accent-line: color-mix(in srgb, var(--accent) 55%, transparent);  /* stronger lines */
  --ring:        color-mix(in srgb, var(--accent) 38%, transparent);
  --shadow:    0 1px 1px rgba(58,46,28,.05), 0 2px 4px rgba(58,46,28,.05), 0 10px 24px -12px rgba(58,46,28,.16);
  --shadow-lg: 0 1px 2px rgba(58,46,28,.06), 0 4px 10px rgba(58,46,28,.06), 0 30px 60px -22px rgba(58,46,28,.22);
  --th-bg:   linear-gradient(180deg, #fffdfa, #f3eee6);
  --th-edge: color-mix(in srgb, var(--accent) 30%, rgba(60,45,25,.12));
  --th-hi:   inset 0 1px 0 #fff;
}
```

Colour rules (non-negotiable):
- `--accent` = brand: active nav, links, focus rings, the primary button, ticker/ID cells,
  sorted column, counts. `--up` = gain, `--danger` = loss/destructive, `--warn` = caution.
  A positive number is NEVER coloured with the accent.
- Every new colour in light mode must be contrast-checked against `--card` (#fffdf9);
  text ≥ 4.5:1. Light is warm all the way through (cream surfaces, brown-grey ink, brown
  shadows). No cool blue-grey ink on cream.
- Accent picker (optional, Settings › Appearance): presets with a [dark, light] pair of
  [accent, accent2] — violet `#8b6cff/#5b8cff` | `#6a3de8/#3a6fe0` (default), indigo
  `#6d7cff/#a78bfa` | `#4048d6/#7c3aed`, allianz `#4a7dff/#7ea6ff` | `#003781/#1d5fd1`, sky
  `#38bdf8/#4d9bff` | `#0369a1/#1d5fd1`, fuchsia `#e062d8/#8b6cff` | `#b02aa6/#6a3de8`, graphite
  `#a3acc2/#7d8ba8` | `#3d4657/#5b6b85`. No green or red preset (they collide with up/down).
  Apply by injecting `<style id="accent-css">:root:root{…} :root:root.light{…}</style>`.

Fonts (Google Fonts, `display=swap`): IBM Plex Sans 400/500/600/700, JetBrains Mono
400–700, Source Serif 4 300/400 (+italic 300), Hanken Grotesk 300–800 as fallback.

## 2. Base

```css
* { box-sizing: border-box; }
html { scroll-behavior: smooth; -webkit-text-size-adjust: 100%; }
body {
  margin: 0; overflow-x: clip;               /* clip, not hidden: keeps position:sticky working */
  background: var(--bg); color: var(--text);
  font: 14px var(--font-ui); letter-spacing: -0.011em;
  font-feature-settings: 'cv05' 1, 'ss03' 1;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
html:not(.light) body { background: #09090f; }
html.light body { background: #ece5db; }
.num, table td, .stat .v, .badge {            /* every number */
  font-family: var(--font-num); font-variant-numeric: tabular-nums; font-feature-settings: 'tnum' 1, 'zero' 1;
}
::-webkit-scrollbar { width: 11px; height: 11px; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 999px; border: 3px solid transparent; background-clip: padding-box; }
::-webkit-scrollbar-thumb:hover { background: var(--faint); }
#app > * { position: relative; z-index: 1; }   /* everything above the canvas */
```

### The liquid canvas (`body::before`)

```css
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
@media (prefers-reduced-motion: reduce) { body::before { animation: none; } }
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
Only `transform` animates (compositor-only, no repaint). The layer is oversized so the drift
never shows an edge.

## 3. Glass recipes (reuse these four; do not invent a fifth)

**A. Panel / card** (no blur):
```css
.card { border: 1px solid var(--border); border-radius: var(--radius); padding: 20px 22px; }
html:not(.light) .card {
  background: linear-gradient(180deg, rgba(255,255,255,.085), rgba(255,255,255,.035)), rgba(13,12,22,.5);
  border-color: rgba(255,255,255,.12);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.11), 0 22px 48px -26px rgba(0,0,0,.9);
}
html.light .card {
  background: linear-gradient(180deg, rgba(255,255,255,.8), rgba(255,255,255,.62));
  border-color: rgba(255,255,255,.9);
  box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(60,45,25,.06), 0 18px 40px -20px rgba(60,45,25,.3);
}
```

**B. Tile inside a card** (list entries, small panels; radius 14px, no blur):
```css
html:not(.light) .tile { background: linear-gradient(180deg, rgba(255,255,255,.06), rgba(255,255,255,.025)), rgba(10,10,18,.35);
  border: 1px solid rgba(255,255,255,.1); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,.07); }
html.light .tile { background: linear-gradient(180deg, rgba(255,255,255,.78), rgba(255,255,255,.55));
  border: 1px solid rgba(255,255,255,.95); border-radius: 14px; box-shadow: inset 0 1px 0 #fff, 0 10px 26px -18px rgba(60,45,25,.3); }
```

**C. Floating layer** (dropdowns, palette, menus — real blur, ~0.9–0.98 opaque so text behind
never shows through):
```css
html:not(.light) .float { background: linear-gradient(180deg, rgba(30,28,44,.98), rgba(20,19,31,.96));
  border: 1px solid rgba(255,255,255,.11);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.08), 0 24px 60px -20px rgba(0,0,0,.8);
  backdrop-filter: blur(28px) saturate(170%); }
html.light .float { background: linear-gradient(180deg, rgba(255,253,250,.96), rgba(255,253,250,.9));
  border: 1px solid rgba(255,255,255,.9); box-shadow: var(--shadow-lg);
  backdrop-filter: blur(28px) saturate(180%); }
```

**D. Dialog** (form popups; radius 20px, padding 22px 22px 18px, two accent glows inside):
```css
.dialog-backdrop { background: rgba(3,5,9,.42); backdrop-filter: blur(14px) saturate(1.2); }
html.light .dialog-backdrop { background: rgba(240,236,248,.38); }
.dialog { position: relative; border-radius: 20px; padding: 22px 22px 18px; overflow: hidden; isolation: isolate;
  backdrop-filter: blur(30px) saturate(1.6); }
.dialog::before { content: ''; position: absolute; z-index: -1; inset: 0; pointer-events: none;
  background: radial-gradient(70% 55% at 0% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 70%),
              radial-gradient(60% 50% at 100% 100%, color-mix(in srgb, var(--blue) 12%, transparent), transparent 70%); }
html:not(.light) .dialog { background: rgba(20,18,32,.62); border: 1px solid rgba(255,255,255,.14);
  box-shadow: inset 0 1px 0 rgba(255,255,255,.14), 0 30px 80px -24px rgba(0,0,0,.85); }
html.light .dialog { background: rgba(255,255,255,.66); border: 1px solid rgba(255,255,255,.95);
  box-shadow: inset 0 1px 0 #fff, 0 30px 70px -26px rgba(60,45,90,.4); }
```
Dialog head: a 38×38 icon tile (radius 12px, `color: var(--accent)`, background
`linear-gradient(160deg, accent 26% → accent 8%)`, border `--accent-line`), title, and a 12px
`--subtext` sub line, gap 12px, margin-bottom 16px. Field labels inside dialogs: 10.5px, weight
800, letter-spacing .1em, uppercase, `--faint`. Fields radius 10px; focus = border `--accent` +
`0 0 0 3px var(--accent-wash)`. Footer actions: hairline top border, buttons radius 10px,
min-width 84px, primary right-most. Fields can sit on a 2-column grid (`.dialog-f` wrappers),
collapsing to one column ≤520px.

**Large modal / detail sheet:** `width: min(860px, 94vw); max-height: 92vh; border-radius: 22px`,
recipe C at .97/.94 opacity with `blur(30px)`, entering with
`modalIn .28s cubic-bezier(.22,1,.36,1)` (from `translateY(16px) scale(.985)`, opacity 0).
Backdrop dark `rgba(4,4,10,.55)`, light `rgba(120,100,76,.18)`. On phones it becomes a bottom
sheet (`sheetIn`: from translateY(20px)).

## 4. Layout shell

```
<header id="topnav">  brand · page-groups nav · (crumb) · search pill · theme toggle · ☰
<main id="main">      one <section class="tab"> per page, only one visible
```
- `#main { max-width: 1240px; margin: 0 auto; width: 100%; padding: 76px 34px 96px; }`
  (76px top = 56px fixed bar + 20px). Phones: side padding ~14px.
- One single source of truth for pages: an array `PAGES = [{ id, icon (emoji), group,
  desc: {en,vi}, words }]` and `PAGE_GROUPS` (e.g. Market / Trading / Money / Learn & system).
  The top-bar groups, the ☰ menu, the Ctrl K palette and the crumb ALL render from it. A test
  should fail if a route exists without a PAGES entry.

### 4a. Top bar — `#topnav`
- `position: fixed; top: 0; left: 0; right: 0; z-index: 80; height: 56px; padding: 0 22px;
  display: flex; align-items: center; justify-content: space-between;`
- Dark: `background: linear-gradient(180deg, rgba(22,21,34,.66), rgba(16,15,26,.5));
  border-bottom: 1px solid rgba(255,255,255,.08); box-shadow: inset 0 -1px 0 rgba(0,0,0,.3),
  0 10px 30px -18px rgba(0,0,0,.7); backdrop-filter: blur(24px) saturate(160%);`
- Light: `background: linear-gradient(180deg, rgba(255,255,255,.62), rgba(255,255,255,.42));
  border-bottom-color: rgba(255,255,255,.7); box-shadow: 0 1px 0 rgba(92,72,46,.08),
  0 10px 30px -18px rgba(60,45,25,.25); backdrop-filter: blur(24px) saturate(170%);`
- **Brand wordmark** (text only, no logo icon): Source Serif 4, 15px, weight 400,
  `letter-spacing: .18em; text-transform: uppercase; color: var(--text); opacity: .9`. Click = home.
- **Page groups** (only ≥1100px; below that the ☰ is the navigation):
  - container `display:flex; align-self:stretch; gap:2px; margin: 0 auto 0 26px`.
  - group button `.ng-btn`: height 34px, padding 0 11px, radius 8px, transparent,
    `color: var(--subtext); font: 600 13.5px var(--font-ui)`, a chevron SVG at opacity .7 that
    rotates 180° when open. Hover/open: `color: var(--text); background: var(--cardhover)`.
  - Active group (contains the current page): text `--text` + a 2px accent underline
    (`::after`, left/right 11px, bottom -1px, radius 2px) sitting on the bar's bottom edge.
  - Dropdown `.ng-pop`: absolute under the button (`top: calc(100% - 2px); left: -6px`),
    width 360px, padding 7px, gap 2px, radius 12px, recipe C, `animation: ngIn .14s ease-out`
    (from translateY(-4px), opacity 0). Opens on hover (hover-capable devices) AND click; after
    a click, suppress hover-reopen until the pointer leaves (`.ng-quiet` class).
  - Dropdown item: `grid-template-columns: 32px 1fr; gap: 11px; padding: 8px 9px; radius 9px`;
    32×32 emoji icon tile (radius 8px, `--surface` bg, `--border-soft` border); name 13.5px/600;
    one-line description 12px/1.4 `--subtext`. Hover `--cardhover`. Current page:
    `background: var(--accent-wash); border: 1px solid var(--accent-line)`, name in `--accent`.
- **Crumb** (<1100px, replaces the groups): `GROUP › Page` at 12px `--faint`; the group in
  10.5px/700 uppercase .08em; the page `--subtext` 600 with ellipsis. Hide the group <900px,
  hide the crumb <420px.
- **Search pill** `#nav-search`: height 32px, radius 999px, padding 0 6px 0 11px, gap 8px,
  `font: 500 12px var(--font-ui)`, `--subtext`, magnifier SVG in `--accent`, label "Search…",
  and a `<kbd>` showing `Ctrl K` / `⌘K`. Dark bg `rgba(255,255,255,.05)` border
  `rgba(255,255,255,.1)`; light bg `rgba(255,255,255,.55)` border `rgba(255,255,255,.8)` +
  `0 1px 2px rgba(60,45,25,.08)`. Hover: border `--accent-line`, text `--text`.
  ≤640px it collapses to a 34×34 icon-only circle.
- **kbd**: min 20×20, padding 0 5px, 1px border with 2px bottom border, radius 5px,
  `--surface`, `font: 600 10.5px var(--font-mono)`.
- **Theme toggle** `.nav-icon-btn`: 32×32 circle, 1px border, transparent, `--subtext`; moon
  icon shows in light, sun in dark (stroke 1.8). Hover: text `--text`, border `--accent-line`,
  bg `--cardhover`. Same glass bg as the search pill.
- **☰ button**: 22px three-line SVG, stroke 2, round caps, no background.

### 4b. The ☰ full-screen menu
- Full viewport (`100dvh`) overlay, dark `rgba(9,9,15,.6)` / light `rgba(244,238,230,.55)`
  over a blur, content `width: min(1180px, 100%)`, centred, gap 22px,
  padding `10px clamp(16px,4vw,56px) 18px`.
- Top: a big search field (opens the palette): `width: min(620px,100%); height: 50px;
  radius 14px; font: 500 14.5px`, accent magnifier, kbd on the right; hover ring
  `0 0 0 4px var(--accent-wash)`.
- Body: `grid-template-columns: repeat(4, minmax(0,1fr)); gap: 16px` — one panel per group:
  radius 18px, padding 14px 10px 10px, recipe A-style glass. Group head: 36×36 accent icon tile
  (radius 11px, `--accent-wash` bg, `--accent-line` border, accent-coloured SVG), title
  `650 16.5px`, page count right in `600 11px mono --faint`, hairline under the head.
- Page row: `grid 34px 1fr; gap 11px; padding 9px 8px; radius 12px`; 34×34 emoji tile
  (radius 10px); name `14.5px/650`; description 12px/1.45 `--subtext`, clamped to 2 lines.
  Current page = accent wash + accent line, name in accent.
- Bottom toolbar: icon+label buttons (theme, language EN/VI segmented, settings, sign-out…).
- ≤720px: each group's pages become a 2-column tile grid; the toolbar becomes a row of
  icon-over-label tiles.

### 4c. Command palette (Ctrl/⌘ K, or "/" outside inputs)
- Backdrop `rgba(0,0,0,.5)` (light `rgba(20,16,10,.28)`) + `blur(6px)`, panel pinned at
  `padding-top: max(9vh, 56px)`.
- Panel: `width: min(640px,100%); max-height: min(72vh,620px); radius 16px`, recipe C,
  `animation: cp-up .18s cubic-bezier(.22,1,.36,1)` (from translateY(-8px) scale(.985)).
- Search row: padding 14px 16px, accent magnifier, input `500 16px`, Esc kbd; hairline below.
- Results grouped (Pages, Settings, Sections, Actions) with headers `800 10.5px .12em uppercase
  --faint`; each item = 32×32 icon tile + title 13.5/600 + sub 12px `--subtext` (ellipsis) + a
  small right tag + a `↵` that shows only on the selected row. Selected row: accent wash +
  `inset 0 0 0 1px var(--accent-line)`. Arrow keys move, Enter opens.
- Footer: `--surface` strip, 11px `--faint` key hints (↑↓ navigate, ↵ open, esc close).
- Remember recent pages per device (localStorage) and show them first on an empty query.

## 5. Page anatomy

### 5a. Page head (every working page opens with it)
```html
<header class="pg-hero" style="--c: var(--blue)">       <!-- --c = the page's own tint -->
  <div class="pg-hero-row">                               <!-- flex, align-items:flex-end, gap 16px -->
    <div class="pg-hero-text">
      <span class="pg-hero-kicker"><i class="pg-hero-ic">🔎</i>Market</span>
      <h1>Screener</h1>
      <p class="subtitle">Filter the market by your own rules.</p>
    </div>
    <div class="pg-hero-side"><!-- optional status / primary action, right-aligned --></div>
  </div>
  <!-- optional foot: overview tiles -->
</header>
```
- No band, no box: the head sits straight on the canvas. `margin: 0 0 24px` (18px on phones).
- Kicker pill: `inline-flex; gap 7px; padding: 3px 11px 3px 4px; radius 999px;
  font: 700 10.5px var(--font-ui); letter-spacing: .1em; uppercase; color: var(--c);
  background: color-mix(var(--c) 11%); border: 1px solid color-mix(var(--c) 30%)`; margin-bottom 10px.
  Icon dot: 20×20 circle, 11.5px emoji, `background: color-mix(var(--c) 18%)`.
- h1: `font: 600 clamp(22px, 2.6vw, 30px) var(--font-ui); letter-spacing: -.018em; margin: 0 0 4px`.
  (Sans at weight in the app; serif is only for the wordmark and marketing/story pages.)
- Subtitle: 13px/1.55 `--subtext`, no max-width (12.5px on phones).

### 5b. Section sub-heading (inside a page)
- Label `600 14px`, `letter-spacing: -.005em`, `--text`, optional emoji first, followed by
  chips (counts, dates) and a right-aligned slot; optional one-sentence sub line
  (11.5px/1.55 `--subtext`, max 140ch).
- The rule under it belongs to the whole block: `background-image: linear-gradient(90deg,
  color-mix(in srgb, var(--st-tone, var(--accent)) 60%, transparent) 0 56px, var(--border-soft) 56px);
  background-size: 100% 1px; background-position: left bottom; padding-bottom: 8px;
  margin: 30px 0 13px` — first 56px tinted by the section's tone, the rest a hairline.
  First heading in a card has `margin-top: 0`. A risk section sets `--st-tone: var(--danger)`.

### 5c. Chips / tags / badges
- `.tag`: `inline-flex; gap 5px; font-size 11px; line-height 1.55; padding 2px 9px;
  radius 999px; nowrap; background var(--card); border 1px solid var(--border);
  color var(--subtext); weight 600`. The figure inside is `<b>`: mono 700 11.5px `--text`.
- Variants: `--count` (accent 9% fill, 30% border, figure in accent), `--date` (all mono
  10.5px), `--ok` (accent), `--warn` (warn 38% border), `--bad` (danger).
- `.badge`: `padding 2px 9px; radius 999px; 10.5px/700; letter-spacing .02em`, tinted fill
  `color-mix(tone 12%)` + border `color-mix(tone 42%)` + text in the tone.

### 5d. KPI / stat tiles
- Grid `repeat(auto-fill, minmax(244px, 1fr)); gap: 10px` (2 columns on phones).
- Tile: radius 7px, padding 11px 13px, `min-width: 0; overflow-wrap: break-word`;
  hover `translateY(-1px)` + stronger border. Label `.k`: 12px/500 `--subtext`, sentence case.
  Value `.v`: `600 19px`, tabular, `letter-spacing: -.01em`. Sign colours: `--up`/`--danger`.
- Dark tile: `rgba(255,255,255,.045)` bg, `rgba(255,255,255,.09)` border, inset top edge .06.
  Light tile: `rgba(255,255,255,.5)` bg, `rgba(255,255,255,.8)` border, `inset 0 1px 0 rgba(255,255,255,.9)`.
- Key figures that must stand off the glass (detail page, planner): solid tiles — light `#fff`
  with `1px rgba(60,45,90,.1)` + `0 1px 2px rgba(40,30,60,.06), 0 10px 22px -16px rgba(60,45,90,.42)`.
- Overview/KPI tiles may carry a 3px coloured left edge (`::before`, top/bottom 10px inset,
  radius 0 3px 3px 0, `--accent-line` or the item's tone).

## 6. Controls

**Primary button** `.btn`: `background: var(--accent); color: var(--accent-ink); border: 0;
radius 7px; padding 9px 16px; font-weight 700; letter-spacing -.01em;
box-shadow: 0 1px 0 rgba(255,255,255,.14) inset, 0 6px 16px -10px color-mix(accent 80%)`.
Hover `filter: brightness(1.08)` + glow `0 8px 20px -10px var(--accent)`. Active `translateY(1px)`.

**Outline button** `.btn-outline`: radius 7px, padding 9px 16px, weight 600, 1px border.
Dark `rgba(255,255,255,.05)` bg / `.12` border / inset top .06, hover bg `.09`. Light
`rgba(255,255,255,.55)` bg / `rgba(92,72,46,.16)` border / `inset 0 1px 0 rgba(255,255,255,.9),
0 1px 2px rgba(60,45,25,.06)`, hover bg `.8`. A toggled-on outline = accent wash + accent
border + accent text. Small title-row buttons: padding 3px 9px, 11px.

**Command bar** (the toolbar at the top of a data page): a card strip
`display:flex; flex-wrap:wrap; gap: 10px 14px; padding: 8px 10px; radius 10px; margin-bottom 16px`
with three zones — actions (left), controls (after a hairline divider, padding-left 14px), meta
(right, `margin-left:auto`, 12px `--subtext`). Buttons `.cb-btn`: height 34px, padding 0 13px,
gap 7px, radius 9px, `--surface` bg, 1px border, `600 12.5px`, each with a 15px stroke SVG icon
in `--subtext` that turns accent on hover (border `--accent-line`). `.cb-primary` = accent fill.
Busy = icon spins (`.9s linear`). Disabled opacity .45. ≤720px: actions go full-width and
share the row equally; meta wraps under.

**Segmented control** `.seg` (every exclusive choice: ranges, currencies, views, EN/VI):
track `inline-flex; gap 2px; padding 3px; radius 10px; background var(--surface); border 1px
var(--border)` (light: `rgba(255,255,255,.5)` / `rgba(40,30,60,.12)`). Options: height 26px,
padding 0 11px, radius 7px, transparent, `700 11.5px var(--font-mono)`, `--subtext`. Selected:
`background: var(--card)` (light `#fff`), `color: var(--accent)`,
`box-shadow: 0 1px 2px rgba(0,0,0,.25), 0 0 0 1px var(--accent-line)`. An optional caption to
its left: `800 10.5px .1em uppercase --faint`.

**Filter pills** (non-exclusive): `radius 999px; padding 5px 13px; 12px/700; 1px border`;
active = accent wash + accent line + accent text.

**Tool pills** (secondary actions beside a label, e.g. "Ask AI / View / Print"):
`padding 6px 12px; radius 10px; 700 12px; color accent; background accent 10%; border accent 32%`.

**Inputs** `.field`: `--surface` bg, 1px `--border`, radius 7px, padding 9px 12px, 14px.
Placeholder `--faint`. Focus: border accent + `0 0 0 3px var(--ring)`. Disabled: `--bg` bg,
`--faint` text, `not-allowed`. Dark glass `rgba(255,255,255,.05)` / `.12`; light
`rgba(255,255,255,.6)` (focus `.85`). `select` sets `color-scheme: dark|light` per theme so
native option lists stay legible. Labels: `600 11px uppercase .06em --subtext`, margin-bottom 6px.

**Form panels**: a long filter form is one card with NUMBERED rows (`01 Strategy`, `02 Universe` …
label = mono number + name, counter skips hidden rows) and an actions band at the bottom.

## 6a. Glass controls — ONE button language (supersedes the button recipes in §6)

Taken from the landing page, the screen the owner likes best. Every legacy class is mapped onto
these tokens (`.btn`, `.btn-outline`, `.mini-btn`, `.cb-btn`, `.range-btn`, `.seg`, `.ui-btn`), so
old and new screens draw the same control; change a token and the whole app follows.

- Shape: capsules everywhere (`--ctl-radius: 999px`); fields stay 10px.
- **Primary** = the landing CTA: `--cta-bg` = `linear-gradient(135deg, accent+12% white 0%, accent
  45%, accent·60% + blue 100%)`, 1px `--cta-line`, `--cta-shadow` (white inset top edge, dark inset
  bottom, accent glow), white 700 text, a skewed white sheen that crosses on hover, lift 1px.
- **Secondary** = frosted ghost: `--glass-bg` (white 10% → 3.5% vertical; light theme white 92% →
  64%), 1px `--glass-line`, `--glass-hi` inset top highlight, `--glass-drop`; hover brighter glass +
  accent line + a 3px accent-wash ring. Toggled on = accent text on an accent 22% → 8% wash.
- **Segmented / tracks** (`.seg`, `.cb-seg`, the station's Buy/Sell, mode, tabs, currency, %):
  capsule track `--track-bg`/`--track-line` with a soft inner shadow; the selected thumb is
  `--thumb-bg` with `--thumb-shadow` (lit edge + accent ring). Buy/Sell keep green/red fills.
- **Toggle chips** (EMA, filters): glass capsule; active = accent wash.
- **Icon buttons**: glass circles; danger fills red on hover.

## 6b. Component standards (the UI kit — use these, never a local one-off)

Added 2026-10-03 after the Trade Station grew five button styles and three dropdown looks.
Any NEW markup picks from this list; an old screen that is touched is moved onto it.

- **Button** `.ui-btn` — ONE shape: a pill, `height 36px; padding 0 16px; radius 999px;
  650 13px; 1px --border-soft; background --surface; color --text`. Hover = accent wash +
  `--accent-line` border + accent text; active `translateY(1px)`; disabled opacity .45.
  Sizes: default 36px, `.sm` 30px / 12px. Weights: default · `.primary` (accent gradient
  `color-mix(accent 86%, #fff) → accent`, inset top highlight, accent glow, white text) ·
  `.ghost` (transparent) · `.danger` (red text on red 9% wash; hover fills solid red, white
  text). Never two primaries side by side. Destructive = `.danger`, never accent.
- **Icon button** `.ui-icon-btn` — a 30px circle for ✕ / ↺ / ✎ beside a row; same surface
  and border; `.danger` fills red on hover. Always with `aria-label`.
- **Pill / tag** `.ui-pill` — `height 22px; padding 0 9px; radius 999px; 700 11px`, colour from
  `--p` with 12% fill and 32% border. Tones: default (faint), `.accent`, `.up`, `.down`,
  `.warn`, `.muted`. Status words (Shipped, Mine, Open, Win, Buy, Sell) are pills, not text.
- **Dropdown** — every `select.field` is `appearance: none` with the app's own chevron
  (`--chev`, a 12×8 SVG, colour per theme), `padding-right 34px; radius 10px; 600 13px
  --font-ui; min-height 36px`, `--field-bg` / `--field-line`. The browser's arrow and font are
  never shown, so Windows and macOS draw the same control. Option lists: dark list + light text
  in dark mode, white list + dark text in light (set on `option, optgroup`).
- **Number strip** — key figures of a form go in a strip of tiles ABOVE the thing they describe
  (`small` 10px uppercase label + `b` 13.5px mono value), sized to content and wrapping, never
  truncated. Green/red only for gain/loss; amber when a value disagrees with its rule.
- **Table rows** — a grid per table (`display:grid` with fixed column tracks), a head row in
  10px uppercase `--faint` on `--surface`, rows `padding 10px 14px` with hairline separators,
  numbers right-aligned mono, actions right-aligned as `.ui-btn.sm`. ≤760px: two columns, head hidden.
- **Dialog** — `.dialog-host > .dialog-backdrop + .dialog` with `.dialog-head` (icon tile +
  title + sub), `.dialog-body`, `.dialog-actions` (ghost Cancel, primary Save). Grouped lists
  inside a dialog are rounded sections with an uppercase head band and a count.
- **Class names are namespaced per screen** (`stn-…`, `xr-…`) and never reused for a different
  element: a container once inherited a chip's `border-radius: 999px` through a shared name
  and was drawn as a giant ellipse.

## 7. Tables

```css
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 10px 11px; border-bottom: 1px solid var(--border-soft); font-size: 13px; }
main th {
  position: sticky; top: 0; z-index: 1;
  font: 650 10.5px var(--font-ui); letter-spacing: .075em; text-transform: uppercase;
  color: var(--subtext); padding: 10px 12px 9px; vertical-align: bottom;
  background: var(--th-bg); box-shadow: var(--th-hi); border-bottom: 1px solid var(--th-edge);
}
th.sortable { cursor: pointer; user-select: none; white-space: nowrap; }
th.sortable:hover { color: var(--text); }
th.sorted { color: var(--accent); box-shadow: var(--th-hi), inset 0 -2px 0 var(--accent); }
tbody tr { cursor: pointer; transition: background .12s ease; }
main tbody tr:hover { background: color-mix(in srgb, var(--accent) 4%, transparent); }
tbody td:first-child { color: var(--text); font-weight: 600; }
.id-cell { color: var(--accent); font-weight: 600; letter-spacing: .01em; }  /* ticker/ID: the ONLY accent in a row */
```
- Numbers right-aligned, tabular. Gains `--up`, losses `--danger`, never the accent.
- Wide tables scroll horizontally inside their card on phones, with the first column sticky
  (its background must be opaque: dark ≈ `rgb(23,21,35)`, light `#fbf9f6`).
- Score bars: 60×5px track `--border`, fill gradient accent→accent2 with a soft accent glow.

## 8. Motion
- Hover/colour transitions .12–.15s ease; press = `translateY(1px)`.
- Entrances: content `fadeUp` (8px, opacity), dropdowns .14s, palette .18s, modal .28s with
  `cubic-bezier(.22,1,.36,1)`. Spinners `.9s linear`.
- Everything honours `prefers-reduced-motion: reduce` (canvas drift, halos and entrances off).

## 9. Floating assistant button (if the app has chat/help)
54×54 (48 on phones) glass lens bottom-right: a conic-gradient halo
(`accent → blue → #18bea8 → #e246a8 → accent`, blur 12px, opacity .55, spinning 14s) under a
frosted core (blur 14px), a highlight crescent across the top, a chat-bubble-with-spark glyph.
Hover lifts 2px, halo .9, core scale 1.05, spark rotates 90°.

## 10. Responsive
- Breakpoints used: 1100 (top-bar groups on/off), 900, 860, 720 (main phone layout: menu
  tiles, command bar wraps, smaller heads), 640, 600, 520 (dialog single column), 420.
- Grids use `repeat(auto-fit, minmax(min(100%, Npx), 1fr))` and every grid/flex child that
  holds text gets `min-width: 0` — a track cannot shrink below its content otherwise.
- Use container width, not window width, when a component lives in a narrow card.
- Respect `env(safe-area-inset-*)` on fixed bars and sheets.

## 11. Copy & i18n
- Bilingual EN/VI (or this repo's languages): every label goes through the i18n table;
  page names and one-line descriptions live in the PAGES registry as `{en, vi}`.
- Sentence case everywhere except: kicker pills, table headers, field labels, palette group
  headers and segment captions (small uppercase with tracking).
- Each page subtitle is one sentence saying what the page is FOR.

## 12. Implementation rules
- Put all tokens in one place; components only read `var(--…)`. No hard-coded white/black in
  components except inside the glass recipes above.
- Every glass rule is written twice: `html:not(.light) …` (smoke) and `html.light …` (frost).
- Watch specificity: if pages live under an id container (`#main`), its rules beat single
  classes — write `#main .x` or variables (like `--th-bg`) instead of `!important`.
- Never blur a card that sits on the static canvas; blur only floating layers.
- Accessibility: visible `:focus-visible` (2px accent outline, offset 1–2px) on every
  interactive element; text contrast ≥ 4.5:1 in both themes; icons-only buttons get
  `aria-label`; dropdowns work with keyboard (Enter/Esc/arrows).
- Do not reformat unrelated files.

## 13. Done when
1. Both themes switch instantly from the top-bar toggle and persist; no flash on load.
2. Top bar is 56px glass with brand · groups (≥1100px) or crumb · search pill (Ctrl K works) ·
   theme toggle · ☰; the ☰ menu and palette are generated from the PAGES registry.
3. Every page starts with the kicker + h1 + subtitle head; sections use the toned rule.
4. Cards, tiles, dialogs and the modal follow recipes A–D; nothing floats without blur and no
   card is blurred.
5. Tables have the tinted sticky header band, accent only on the ID column and sorted header,
   green/red only for signs.
6. Exclusive choices are `.seg`; page toolbars are the command bar with icons.
7. Checked at 1440, 1100, 768 and 390 px wide in both themes: no horizontal overflow, nothing
   clipped, all text legible over the brightest part of the canvas.

--- PROMPT END ---
