/**
 * The look shared by the two standalone documents: the printed trade plan (`planReport.ts`)
 * and the case-study post-mortem (`caseStudies/report.ts`).
 *
 * ── WHY ONE THEME ───────────────────────────────────────────────────────────
 * The user's "khi ma an vao view plan hoac in ra thi no rat la xau". Both documents still wore the
 * app's look from before the violet/glass redesign — a green button, flat black boxes, a page
 * pinned to the left edge with a gap on the right — so the plan opened from a glass dialog
 * looked like a different product. They are read as a pair, so they get one stylesheet, built
 * into each file as a string (the output still carries nothing but its own `<style>`).
 *
 * ── PAPER IS A SCREEN MODE TOO ──────────────────────────────────────────────
 * The "print on white" box used to act only inside `@media print`, so the reader ticked it and
 * saw nothing change until the print preview. Its rules now apply on screen as well: the
 * checkbox is a live Dark / Paper switch and what is seen is what prints. It is still pure
 * CSS (`:has()`), because the in-app viewer renders these documents with scripts disabled.
 * The ROOT flips as well as the body — see the long note in `planReport.ts` on the four black
 * page margins.
 *
 * `.embedded` is set on `<html>` by the in-app viewer (`openPlanReport`), which supplies its own
 * print and paper controls, so the document's toolbar steps aside there.
 */
export const REPORT_CSS = `  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  html { background:#0a0910; }
  body { color:#ebe8f5; font:14px/1.6 'Hanken Grotesk','Inter',system-ui,-apple-system,'Segoe UI',sans-serif; margin:0 auto; padding:clamp(14px,4vw,36px); max-width:1080px;
    background:radial-gradient(900px 420px at 0% -160px, rgba(139,92,246,.20), transparent 70%), radial-gradient(700px 380px at 100% -80px, rgba(59,130,246,.10), transparent 70%); background-repeat:no-repeat; }
  b { font-weight:700; color:#f4f2fb; }
  .toolbar { position:sticky; top:10px; z-index:5; display:flex; align-items:center; flex-wrap:wrap; gap:10px 14px; margin:0 0 22px; padding:9px 10px 9px 16px; border-radius:14px;
    background:rgba(22,20,34,.74); border:1px solid rgba(255,255,255,.1); -webkit-backdrop-filter:blur(16px) saturate(1.4); backdrop-filter:blur(16px) saturate(1.4);
    box-shadow:inset 0 1px 0 rgba(255,255,255,.08), 0 14px 34px -18px rgba(0,0,0,.85); }
  .brand { font-size:11px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:#b9a7ff; }
  .tb-doc { font-size:12px; color:#8d88a3; }
  .sp { flex:1; }
  button { background:linear-gradient(180deg,#8f72ff,#6d4fd8); color:#fff; border:0; border-radius:10px; padding:9px 16px; font-weight:700; font-size:13px; cursor:pointer;
    box-shadow:inset 0 1px 0 rgba(255,255,255,.25), 0 8px 20px -10px rgba(124,92,255,.95); }
  .ink { display:inline-flex; align-items:center; gap:7px; color:#a6a1b8; font-size:12px; cursor:pointer; user-select:none; }
  .ink input { accent-color:#8f72ff; margin:0; }
  html.embedded .toolbar { display:none; }

  .cover { position:relative; overflow:hidden; margin:0 0 18px; padding:22px 24px 20px; border-radius:18px;
    background:linear-gradient(135deg, rgba(139,92,246,.17), rgba(59,130,246,.06) 55%, rgba(255,255,255,.02));
    border:1px solid rgba(255,255,255,.1); box-shadow:inset 0 1px 0 rgba(255,255,255,.1); }
  .kicker { font-size:10.5px; font-weight:800; letter-spacing:.16em; text-transform:uppercase; color:#b9a7ff; margin:0 0 6px; }
  .cover-row { display:flex; align-items:center; flex-wrap:wrap; gap:10px 16px; margin:0 0 8px; }
  h1 { font-size:34px; line-height:1.1; letter-spacing:-.035em; font-weight:800; margin:0; }
  .pills { display:flex; flex-wrap:wrap; gap:6px; }
  .pill { display:inline-block; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.07em; padding:4px 11px; border-radius:999px; border:1px solid;
    background:color-mix(in srgb, currentColor 13%, transparent); }
  .title { font-size:17px; font-weight:700; letter-spacing:-.01em; color:#f4f2fb; margin:0 0 6px; }
  .sub { color:#a6a1b8; margin:0 0 3px; font-size:13.5px; }

  h2 { display:flex; align-items:center; gap:12px; font-size:11px; font-weight:800; letter-spacing:.15em; text-transform:uppercase; color:#b9a7ff; margin:30px 0 12px; }
  h2::after { content:''; flex:1; height:1px; background:linear-gradient(90deg, rgba(185,167,255,.35), transparent); }

  .chart, .stat, .notes, .why, .sc-wrap, .cat {
    background:linear-gradient(180deg, rgba(255,255,255,.045), rgba(255,255,255,.016)); border:1px solid rgba(255,255,255,.085); box-shadow:inset 0 1px 0 rgba(255,255,255,.05); }
  .chart { border-radius:16px; padding:12px 12px 8px; margin:0 0 18px; background:#0e0d17; }
  .chart svg { display:block; width:100%; height:auto; }
  .chart-note { font-size:11px; font-family:'JetBrains Mono',ui-monospace,monospace; margin:6px 4px 2px; }
  .grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:0 0 18px; }
  .grid.g5 { grid-template-columns:repeat(5,minmax(0,1fr)); }
  @media (max-width: 760px) { .grid.g5 { grid-template-columns:repeat(2,minmax(0,1fr)); } }
  @media (max-width: 430px) { .grid.g5 { grid-template-columns:minmax(0,1fr); } }
  .stat { border-radius:12px; padding:11px 14px 12px; min-width:0; }
  .stat .k { color:#8d88a3; font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:.1em; }
  .stat .v { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:18px; font-weight:600; color:#f4f2fb; margin-top:4px; overflow-wrap:anywhere; }

  table { width:100%; border-collapse:collapse; }
  th,td { text-align:left; padding:8px 12px; border-bottom:1px solid rgba(255,255,255,.07); font-size:13px; vertical-align:top; }
  th { background:rgba(255,255,255,.035); color:#8d88a3; font-size:10.5px; font-weight:800; letter-spacing:.1em; text-transform:uppercase; }
  tbody tr:last-child td { border-bottom:0; }
  tbody tr:hover td { background:rgba(139,92,246,.06); }
  .sc-wrap, .cat { border-radius:14px; overflow-x:auto; }
  .gbars { display:grid; gap:2px; margin:0 0 14px; padding:12px 16px; border-radius:14px; border:1px solid rgba(255,255,255,.085); background:rgba(255,255,255,.025); }
  .gbar-k { color:#a6a1b8; }
  .gbar-track { height:8px; background:rgba(255,255,255,.07); }
  .gbar-fill { border-radius:999px; }
  .gbar-n { color:#8d88a3; }

  .notes { border-radius:14px; padding:16px 18px; line-height:1.75; }
  .notes > :first-child { margin-top:0; } .notes > :last-child { margin-bottom:0; }
  .why { border-radius:14px; padding:12px 16px; margin:0 0 18px; background:linear-gradient(180deg, rgba(232,121,249,.08), rgba(232,121,249,.02)); border-color:rgba(232,121,249,.22); }
  .why .k { color:#e9a6f7; font-size:10.5px; font-weight:800; text-transform:uppercase; letter-spacing:.1em; margin-bottom:3px; }
  .ack { display:flex; gap:8px; align-items:baseline; border-radius:12px; padding:10px 14px; margin:0 0 18px; font-size:13px; border:1px solid; }
  .ack.ok { color:#3ee0a8; border-color:rgba(24,216,154,.28); background:rgba(24,216,154,.07); }
  .ack.bad { color:#ffbe5c; border-color:rgba(255,182,72,.3); background:rgba(255,182,72,.07); }
  .muted { color:#77728c; }
  .foot { color:#77728c; font-size:11px; text-align:center; margin-top:34px; border-top:1px solid rgba(255,255,255,.07); padding-top:14px; }

  /* Paper: on screen and on print alike. */
  html:has(#ink:checked) { background:#fff; color-scheme: light; }
  body:has(#ink:checked) { background:#fff; color:#17141f; }
  body:has(#ink:checked) b, body:has(#ink:checked) .title, body:has(#ink:checked) .stat .v { color:#17141f; }
  body:has(#ink:checked) .toolbar { background:rgba(255,255,255,.88); border-color:#e6e2f0; box-shadow:0 12px 30px -20px rgba(60,45,90,.45); }
  body:has(#ink:checked) .cover { background:linear-gradient(135deg,#f3eeff,#fbfaff 60%,#fff); border-color:#e6e1f3; box-shadow:none; }
  body:has(#ink:checked) .chart,
  body:has(#ink:checked) .stat,
  body:has(#ink:checked) .why,
  body:has(#ink:checked) .ack,
  body:has(#ink:checked) .gbars,
  body:has(#ink:checked) .sc-wrap,
  body:has(#ink:checked) .cat,
  body:has(#ink:checked) .notes { background:#faf9fd; border-color:#e7e4ef; box-shadow:none; }
  body:has(#ink:checked) .chart svg [stroke="#1d222c"] { stroke:#ebe8f2; }
  body:has(#ink:checked) .kicker, body:has(#ink:checked) .brand, body:has(#ink:checked) h2 { color:#6d4fd8; }
  body:has(#ink:checked) h2::after { background:linear-gradient(90deg, rgba(109,79,216,.3), transparent); }
  body:has(#ink:checked) .sub, body:has(#ink:checked) .gbar-k, body:has(#ink:checked) .ink { color:#5d586f; }
  body:has(#ink:checked) .muted, body:has(#ink:checked) .stat .k, body:has(#ink:checked) .gbar-n, body:has(#ink:checked) .tb-doc, body:has(#ink:checked) .foot { color:#7a7590; }
  body:has(#ink:checked) th { background:#f3f1f8; color:#6b6680; }
  body:has(#ink:checked) th, body:has(#ink:checked) td, body:has(#ink:checked) .foot { border-color:#ebe8f2; }
  body:has(#ink:checked) .gbar-track { background:#ebe8f2; }
  body:has(#ink:checked) .ack.ok { color:#0b8a5e; }
  body:has(#ink:checked) .ack.bad { color:#a3620a; }
  body:has(#ink:checked) .why .k { color:#a23bbd; }`;
