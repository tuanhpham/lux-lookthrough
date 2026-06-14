// Customized STOCK Screener — frontend
const API = "";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
// Translate a dynamic string by key (see i18n.js). Falls back to the key.
const t = (k) => (window.I18N ? window.I18N.t(k) : k);

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  if (!res.ok) {
    let detail = res.statusText;
    try { detail = (await res.json()).detail ?? detail; } catch (_) {}
    throw new Error(detail);
  }
  return res.json();
}

// ── formatting helpers ───────────────────────────────────────────────────────
const num = (v, d = 2) => (v === null || v === undefined || isNaN(v) ? "—" : Number(v).toFixed(d));
function fmtBig(v) {
  if (v === null || v === undefined) return "—";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return String(v);
}
const pct = (v, d = 1) => (v === null || v === undefined ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(d) + "%");

function signalBadge(signal) {
  const colors = {
    BREAKOUT_IMMINENT: "#00d49b",
    CONSOLIDATING: "#f5a623",
    NO_SIGNAL: "#5b6577",
  };
  const c = colors[signal] || colors.NO_SIGNAL;
  const label = t("signal." + (colors[signal] ? signal : "NO_SIGNAL"));
  return `<span class="badge" style="background:${c}22;color:${c}">${label}</span>`;
}
function scoreColor(s) { return s >= 70 ? "#00d49b" : s >= 40 ? "#f5a623" : "#5b6577"; }
function stageBadge(stage, label) {
  const colors = { 1: "#3b82f6", 2: "#00d49b", 3: "#f5a623", 4: "#ff5260", 0: "#5b6577" };
  const c = colors[stage] ?? "#5b6577";
  return `<span class="badge" style="background:${c}22;color:${c}">${label}</span>`;
}

// ── tooltips ──────────────────────────────────────────────────────────────────
const tip = $("#tooltip");
function attachTips(root = document) {
  $$(".info[data-tip]", root).forEach((el) => {
    const def = window.gloss(el.dataset.tip);
    if (!def) return;
    const show = (e) => {
      tip.innerHTML = `<div class="font-semibold text-text mb-0.5">${def.term}</div><div class="text-subtext">${def.short}</div>`;
      tip.classList.remove("hidden");
      const x = (e.touches ? e.touches[0].clientX : e.clientX);
      const y = (e.touches ? e.touches[0].clientY : e.clientY);
      tip.style.left = Math.min(x + 12, window.innerWidth - 280) + "px";
      tip.style.top = (y + 16) + "px";
    };
    const hide = () => tip.classList.add("hidden");
    el.addEventListener("mouseenter", show);
    el.addEventListener("mousemove", show);
    el.addEventListener("mouseleave", hide);
    el.addEventListener("click", (e) => { e.stopPropagation(); show(e); setTimeout(hide, 3500); });
  });
}
function infoIcon(key) { return `<span class="info" data-tip="${key}">i</span>`; }

// ── results table ──────────────────────────────────────────────────────────────
function resultsTable(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="bg-card border border-border rounded-2xl text-subtext text-sm text-center py-12">
      ${t("table.empty")}</div>`;
  }
  const head = `
    <th>${t("table.symbol")}</th>
    <th>${t("table.score")} ${infoIcon("score")}</th>
    <th>${t("table.signal")} ${infoIcon("signal")}</th>
    <th>${t("table.stage")} ${infoIcon("stage")}</th>
    <th>${t("table.price")}</th>
    <th>${t("table.entry")} ${infoIcon("entry")}</th>
    <th>${t("table.stop")} ${infoIcon("stop")}</th>
    <th>${t("table.target")} ${infoIcon("target")}</th>
    <th>${t("table.rr")} ${infoIcon("rr")}</th>
    <th>${t("table.dist")} ${infoIcon("distance")}</th>
    <th>${t("table.vcp")} ${infoIcon("vcp")}</th>`;
  const body = rows.map((r) => `
    <tr onclick="openStock('${r.symbol}')">
      <td>${r.symbol}</td>
      <td>
        <div class="flex items-center gap-2">
          <div class="scorebar w-14"><span style="width:${r.score}%;background:${scoreColor(r.score)}"></span></div>
          <span style="color:${scoreColor(r.score)};font-weight:700">${num(r.score, 0)}</span>
        </div>
      </td>
      <td>${signalBadge(r.signal)}</td>
      <td>${stageBadge(r.stage, r.stage_label)}</td>
      <td>$${num(r.price)}</td>
      <td>${r.entry_price ? "$" + num(r.entry_price) : "—"}</td>
      <td class="text-danger">${r.stop_loss ? "$" + num(r.stop_loss) : "—"}</td>
      <td class="text-accent">${r.target_price ? "$" + num(r.target_price) : "—"}</td>
      <td>${r.risk_reward ? num(r.risk_reward, 1) + "R" : "—"}</td>
      <td>${num(r.distance_to_pivot_pct, 1)}%</td>
      <td>${r.vcp_contractions ?? "—"}</td>
    </tr>`).join("");
  const out = `
    <div class="bg-card border border-border rounded-2xl overflow-x-auto fade-in">
      <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
    </div>
    <p class="text-faint text-xs mt-2">${t("table.tip")}</p>`;
  return out;
}

// ── tabs ────────────────────────────────────────────────────────────────────
const TABS = ["picks", "screener", "watchlist", "sectors", "learn"];
function setTab(name) {
  $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  TABS.forEach((t) => $("#tab-" + t).classList.toggle("hidden", t !== name));
  if (name === "watchlist") loadWatchlist();
  if (name === "learn") renderLearn();
  if (name === "sectors") loadSectors();
  if (name === "picks") loadPicks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ── Landing / theme ───────────────────────────────────────────────────────────
let appEntered = false;
function enterApp() {
  appEntered = true;
  $("#landing").style.display = "none";
  // Now that the user is in, populate whatever tab is active.
  const active = $$("[data-tab].active")[0]?.dataset.tab;
  if (active) setTab(active);
}
$("#enter-app")?.addEventListener("click", enterApp);
$("#logo-home")?.addEventListener("click", () => { $("#landing").style.display = ""; window.scrollTo({ top: 0 }); });

function setTheme(theme) {
  const isLight = theme === "light";
  document.documentElement.classList.toggle("light", isLight);
  document.documentElement.classList.toggle("dark", !isLight);
  localStorage.setItem("theme", theme);
  // Charts read CSS colors at creation, so redraw the ones currently visible.
  if (typeof refreshChartsForTheme === "function") refreshChartsForTheme();
}
function toggleTheme() {
  const isLight = document.documentElement.classList.contains("light");
  setTheme(isLight ? "dark" : "light");
}
["#theme-toggle", "#theme-toggle-landing", "#theme-toggle-mobile"].forEach((sel) =>
  $(sel)?.addEventListener("click", toggleTheme)
);

// Read a CSS custom property (theme variable) as a concrete color for charts.
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || undefined;
}

// Shared lightweight-charts options that follow the current theme.
function chartTheme(extra) {
  const grid = cssVar("--border-soft");
  const axis = cssVar("--border");
  return Object.assign({
    localization: { locale: "en-US" },
    layout: { background: { color: "transparent" }, textColor: cssVar("--subtext"), fontFamily: "Inter" },
    grid: { vertLines: { color: grid }, horzLines: { color: grid } },
    rightPriceScale: { borderColor: axis },
    timeScale: { borderColor: axis, timeVisible: false },
    crosshair: { mode: 1 },
  }, extra || {});
}

// Redraw any open charts so they pick up the new theme's colors.
function refreshChartsForTheme() {
  if (!$("#modal").classList.contains("hidden") && detailState.candles?.length) {
    drawChart(detailState.candles, detailState.pattern);
    drawFundChart();
  }
  Object.keys(sectorCharts || {}).forEach((sec) => {
    const panel = $(`[data-sector-detail="${sec}"]`);
    if (panel && !panel.classList.contains("hidden")) drawSectorChart(sec);
  });
}

// ── Learn page ─────────────────────────────────────────────────────────────────
function renderLearn() {
  const el = $("#learn-content");
  const groups = [
    { title: t("learn.group.metrics"), keys: ["score", "signal", "stage", "vcp", "atr_contraction", "price_range", "volume_dryup", "days_in_base"] },
    { title: t("learn.group.levels"), keys: ["pivot", "distance", "entry", "stop", "target", "rr"] },
    { title: t("learn.group.fundamentals"), keys: ["pe_ratio", "eps", "market_cap", "roe", "profit_margin", "revenue_growth", "beta", "dividend_yield", "week52"] },
    { title: t("learn.group.sector"), keys: ["volume_change"] },
  ];
  el.innerHTML = groups.map((grp) => `
    <div>
      <h2 class="text-sm font-bold text-accent uppercase tracking-wide mb-2 mt-2">${grp.title}</h2>
      <div class="grid md:grid-cols-2 gap-3">
        ${grp.keys.map((k) => { const g = window.gloss(k); return g ? `
          <div class="learn-card">
            <h3>${g.term}</h3>
            <p>${g.long}</p>
          </div>` : ""; }).join("")}
      </div>
    </div>`).join("");
}

// ── Screener ───────────────────────────────────────────────────────────────────
const selectedSectors = new Set();

function syncSectorClear() {
  $("#sector-clear").classList.toggle("hidden", selectedSectors.size === 0);
}

async function loadSectorOptions() {
  try {
    const { sectors } = await api("/api/screener/universe");
    const wrap = $("#sector-chips");
    wrap.innerHTML = sectors
      .map(
        (s) => `<button type="button" class="sector-chip" data-sector="${s}">
          <span class="dot"></span>${s}</button>`
      )
      .join("");
    $$(".sector-chip", wrap).forEach((btn) => {
      btn.addEventListener("click", () => {
        const s = btn.dataset.sector;
        if (selectedSectors.has(s)) { selectedSectors.delete(s); btn.classList.remove("active"); }
        else { selectedSectors.add(s); btn.classList.add("active"); }
        syncSectorClear();
      });
    });
  } catch (_) {}
}

$("#sector-clear").addEventListener("click", () => {
  selectedSectors.clear();
  $$(".sector-chip").forEach((b) => b.classList.remove("active"));
  syncSectorClear();
});

function setSelectedSectors(names) {
  selectedSectors.clear();
  names.forEach((n) => selectedSectors.add(n));
  $$(".sector-chip").forEach((b) =>
    b.classList.toggle("active", selectedSectors.has(b.dataset.sector))
  );
  syncSectorClear();
}

function buildScreenPayload() {
  const symbols = $("#sym-input").value.split(",").map((s) => s.trim()).filter(Boolean);
  const sectors = Array.from(selectedSectors);
  const signal = $("#signal-filter").value;
  const stage = $("#stage-filter").value;
  return {
    symbols: symbols.length ? symbols : null,
    sectors: sectors.length ? sectors : null,
    min_score: parseFloat($("#min-score").value) || 0,
    signals: signal ? [signal] : null,
    stages: stage ? [parseInt(stage)] : null,
    sort_by: $("#sort-by").value,
    descending: $("#sort-by").value !== "distance",
    limit: 200,
    broad: $("#broad-universe").checked,
  };
}
$("#run-screen").addEventListener("click", async () => {
  const p = buildScreenPayload();
  if (!p.symbols && !p.sectors) { $("#screen-status").textContent = t("msg.enterSymbols"); return; }
  $("#screen-status").innerHTML = `<span class="spinner"></span> ${p.broad && p.sectors ? t("msg.scanningBroad") : t("msg.scanning")}`;
  $("#screen-results").innerHTML = "";
  try {
    const data = await api("/api/screener/screen", { method: "POST", body: JSON.stringify(p) });
    $("#screen-status").textContent = `${data.matched} / ${data.scanned}`;
    $("#screen-results").innerHTML = resultsTable(data.results);
    attachTips($("#screen-results"));
  } catch (e) { $("#screen-status").textContent = t("msg.error") + ": " + e.message; }
});

// ── Watchlists (multiple named lists) ────────────────────────────────────────────
let watchlists = [];           // [{id, name, count, items}]
let activeWatchlistId = null;

function activeWatchlist() {
  return watchlists.find((w) => w.id === activeWatchlistId) || watchlists[0] || null;
}

async function loadWatchlist() {
  try {
    watchlists = await api("/api/screener/watchlists");
    if (!watchlists.length) { renderWatchlistTabs(); renderWatchlistChips(); return; }
    if (!watchlists.some((w) => w.id === activeWatchlistId)) {
      activeWatchlistId = watchlists[0].id;
    }
    renderWatchlistTabs();
    renderWatchlistChips();
  } catch (e) {
    $("#wl-chips").innerHTML = `<span class="text-danger text-sm">${e.message}</span>`;
  }
}

function renderWatchlistTabs() {
  $("#wl-tabs").innerHTML = watchlists.map((w) => `
    <span class="wl-tab ${w.id === activeWatchlistId ? "active" : ""}" data-id="${w.id}">
      <span class="wl-name cursor-pointer">${w.name}</span>
      <span class="wl-count">${w.count ?? (w.items ? w.items.length : 0)}</span>
      <button class="wl-edit" data-act="rename" title="Rename">✎</button>
      ${watchlists.length > 1 ? `<button class="wl-edit" data-act="delete" title="Delete list">×</button>` : ""}
    </span>`).join("");

  $$("#wl-tabs .wl-tab").forEach((tab) => {
    const id = parseInt(tab.dataset.id);
    tab.querySelector(".wl-name").addEventListener("click", () => {
      activeWatchlistId = id; renderWatchlistTabs(); renderWatchlistChips(); $("#wl-results").innerHTML = "";
    });
    tab.querySelector('[data-act="rename"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const w = watchlists.find((x) => x.id === id);
      const name = prompt(t("prompt.renameWl"), w?.name || "");
      if (!name || !name.trim()) return;
      try {
        await api("/api/screener/watchlists/" + id, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
        await loadWatchlist();
      } catch (err) { alert(err.message); }
    });
    tab.querySelector('[data-act="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const w = watchlists.find((x) => x.id === id);
      if (!confirm(`${t("prompt.deleteWl")} ("${w?.name}")`)) return;
      try {
        await api("/api/screener/watchlists/" + id, { method: "DELETE" });
        if (activeWatchlistId === id) activeWatchlistId = null;
        await loadWatchlist();
        $("#wl-results").innerHTML = "";
      } catch (err) { alert(err.message); }
    });
  });
}

function renderWatchlistChips() {
  const wl = activeWatchlist();
  const items = wl?.items || [];
  $("#wl-chips").innerHTML = items.length
    ? items.map((i) => `
      <span class="chip">
        <span onclick="openStock('${i.symbol}')" class="cursor-pointer">${i.symbol}</span>
        <button data-sym="${i.symbol}" class="wl-del" title="Remove">×</button>
      </span>`).join("")
    : `<span class="text-subtext text-sm">${t("wl.nosymbols")}</span>`;
  $$(".wl-del").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    await api(`/api/screener/watchlist/${b.dataset.sym}?watchlist_id=${activeWatchlistId}`, { method: "DELETE" });
    loadWatchlist();
  }));
}

$("#wl-new").addEventListener("click", async () => {
  const name = prompt(t("prompt.newWl"), "");
  if (!name || !name.trim()) return;
  try {
    const created = await api("/api/screener/watchlists", { method: "POST", body: JSON.stringify({ name: name.trim() }) });
    activeWatchlistId = created.id;
    await loadWatchlist();
  } catch (e) { alert(e.message); }
});

$("#wl-add").addEventListener("click", async () => {
  const sym = $("#wl-symbol").value.trim().toUpperCase();
  if (!sym) return;
  try {
    await api("/api/screener/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol: sym, watchlist_id: activeWatchlistId }),
    });
    $("#wl-symbol").value = "";
    loadWatchlist();
  } catch (e) { alert(e.message); }
});
$("#wl-symbol").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#wl-add").click(); });
$("#wl-screen").addEventListener("click", async () => {
  if (!activeWatchlistId) return;
  $("#wl-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> ${t("msg.screeningWl")}</div>`;
  try {
    const data = await api(`/api/screener/watchlists/${activeWatchlistId}/screen`, { method: "POST", body: JSON.stringify({ sort_by: "score", limit: 200 }) });
    $("#wl-results").innerHTML = resultsTable(data.results);
    attachTips($("#wl-results"));
  } catch (e) { $("#wl-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`; }
});

// ── Sectors ─────────────────────────────────────────────────────────────────
function volColor(p) { return p > 10 ? "#00d49b" : p > 0 ? "#7dcfb6" : p > -10 ? "#f5a623" : "#ff5260"; }

let sectorsLoaded = false;
let sectorData = [];
const sectorCharts = {};          // sector -> { chart, freq, period }

// Auto-loads the sector ranking the first time the tab is shown; re-runnable
// via the Refresh button.
async function loadSectors(force = false) {
  if (sectorsLoaded && !force) return;
  $("#sector-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> ${t("msg.scanningSectors")}</div>`;
  try {
    sectorData = await api("/api/industries");
    renderSectors();
    sectorsLoaded = true;
  } catch (e) { $("#sector-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`; }
}

function renderSectors() {
  $("#sector-results").innerHTML = `<div class="fade-in space-y-2">` + sectorData.map((s) => {
    const c = volColor(s.volume_change_pct);
    const safe = s.sector.replace(/'/g, "\\'");
    return `
      <div class="bg-card border border-border rounded-xl overflow-hidden">
        <div class="p-4 flex items-center justify-between hover:bg-cardhover transition cursor-pointer" data-sector-toggle="${s.sector}">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-subtext text-xs font-bold">#${s.rank}</span>
            <div>
              <div class="font-semibold">${s.sector}</div>
              <div class="text-faint text-xs">3m ${fmtBig(s.avg_volume_3m)} · 6m ${fmtBig(s.avg_volume_6m)} avg vol</div>
            </div>
          </div>
          <div class="flex items-center gap-3">
            <span class="badge" style="background:${c}22;color:${c}">${pct(s.volume_change_pct)}</span>
            <span class="sector-caret text-faint text-xs">▾</span>
          </div>
        </div>
        <div class="sector-detail hidden border-t border-border" data-sector-detail="${s.sector}">
          <div class="flex items-center justify-between px-4 pt-3 gap-2 flex-wrap">
            <div class="flex gap-1" data-sector-freq>
              <button class="range-btn active" data-freq="weekly">Weekly</button>
              <button class="range-btn" data-freq="monthly">Monthly</button>
            </div>
            <div class="flex gap-1" data-sector-range>
              <button class="range-btn" data-period="6mo">6M</button>
              <button class="range-btn active" data-period="1y">1Y</button>
              <button class="range-btn" data-period="2y">2Y</button>
            </div>
          </div>
          <div class="sector-chart px-2 pb-2" data-sector-chart="${s.sector}" style="height:180px;width:100%"></div>
          <div class="px-4 pb-4">
            <button class="btn-outline text-xs" onclick="screenSector('${safe}')">${t("screener.run")}: ${s.sector} →</button>
          </div>
        </div>
      </div>`;
  }).join("") + `</div><p class="text-faint text-xs mt-2">${t("sectors.clickhint")}</p>`;

  $$("[data-sector-toggle]").forEach((row) => {
    row.addEventListener("click", () => toggleSectorDetail(row.dataset.sectorToggle));
  });
}

function toggleSectorDetail(sector) {
  const panel = $(`[data-sector-detail="${sector}"]`);
  if (!panel) return;
  const caret = panel.previousElementSibling.querySelector(".sector-caret");
  const open = !panel.classList.contains("hidden");
  if (open) {
    panel.classList.add("hidden");
    if (caret) caret.textContent = "▾";
    return;
  }
  panel.classList.remove("hidden");
  if (caret) caret.textContent = "▴";

  // Wire freq/range buttons once.
  if (!panel.dataset.wired) {
    panel.dataset.wired = "1";
    sectorCharts[sector] = { chart: null, freq: "weekly", period: "1y" };
    panel.querySelectorAll("[data-sector-freq] .range-btn").forEach((b) => {
      b.addEventListener("click", () => {
        panel.querySelectorAll("[data-sector-freq] .range-btn").forEach((x) => x.classList.toggle("active", x === b));
        sectorCharts[sector].freq = b.dataset.freq;
        drawSectorChart(sector);
      });
    });
    panel.querySelectorAll("[data-sector-range] .range-btn").forEach((b) => {
      b.addEventListener("click", () => {
        panel.querySelectorAll("[data-sector-range] .range-btn").forEach((x) => x.classList.toggle("active", x === b));
        sectorCharts[sector].period = b.dataset.period;
        drawSectorChart(sector);
      });
    });
  }
  drawSectorChart(sector);
}

async function drawSectorChart(sector) {
  const el = $(`[data-sector-chart="${sector}"]`);
  const state = sectorCharts[sector];
  if (!el || !state || !window.LightweightCharts) return;
  if (state.chart) { state.chart.remove(); state.chart = null; }
  el.innerHTML = `<div class="py-12 text-center text-subtext"><span class="spinner"></span></div>`;
  try {
    const res = await api(`/api/industries/${encodeURIComponent(sector)}/volume-series?period=${state.period}&freq=${state.freq}`);
    if (!res.points || !res.points.length) {
      el.innerHTML = `<div class="text-faint text-sm text-center py-12">${t("msg.noVolume")}</div>`;
      return;
    }
    el.innerHTML = "";
    const chart = LightweightCharts.createChart(el, chartTheme({ width: el.clientWidth, height: 180 }));
    const ac = cssVar("--accent") || "#00d49b";
    const area = chart.addAreaSeries({
      lineColor: ac, topColor: ac + "44", bottomColor: ac + "08", lineWidth: 2,
      priceFormat: { type: "volume" },
    });
    area.setData(res.points.map((p) => ({ time: p.date, value: p.volume })));
    chart.timeScale().fitContent();
    state.chart = chart;
    new ResizeObserver(() => state.chart && state.chart.applyOptions({ width: el.clientWidth })).observe(el);
  } catch (e) {
    el.innerHTML = `<div class="text-danger text-sm text-center py-12">${e.message}</div>`;
  }
}

$("#load-sectors").addEventListener("click", () => loadSectors(true));

window.screenSector = (sector) => {
  setTab("screener");
  $("#sym-input").value = "";
  setSelectedSectors([sector]);
  $("#run-screen").click();
};

// ── Top Picks (recommendations) ──────────────────────────────────────────────
let picksStrategy = "breakout";
let picksLoadedOnce = false;

function picksCard(r) {
  const sc = scoreColor(r.score);
  return `
    <div class="rec-card fade-in" onclick="openStock('${r.symbol}')">
      <div class="flex items-center justify-between mb-2">
        <div class="flex items-center gap-2">
          <span class="font-bold text-lg">${r.symbol}</span>
          ${signalBadge(r.signal)}
        </div>
        <div class="flex items-center gap-2">
          <div class="scorebar w-16"><span style="width:${r.score}%;background:${sc}"></span></div>
          <span style="color:${sc};font-weight:800">${num(r.score, 0)}</span>
        </div>
      </div>
      <div class="flex items-center justify-between text-sm">
        <span class="text-subtext">${stageBadge(r.stage, r.stage_label)}</span>
        <span class="text-faint">$${num(r.price)}</span>
      </div>
      <div class="grid grid-cols-4 gap-1.5 mt-3 text-center">
        <div><div class="text-faint text-[10px] uppercase">Entry</div><div class="text-sm font-semibold">${r.entry_price ? "$" + num(r.entry_price) : "—"}</div></div>
        <div><div class="text-faint text-[10px] uppercase">Stop</div><div class="text-sm font-semibold text-danger">${r.stop_loss ? "$" + num(r.stop_loss) : "—"}</div></div>
        <div><div class="text-faint text-[10px] uppercase">Target</div><div class="text-sm font-semibold text-accent">${r.target_price ? "$" + num(r.target_price) : "—"}</div></div>
        <div><div class="text-faint text-[10px] uppercase">R:R</div><div class="text-sm font-semibold">${r.risk_reward ? num(r.risk_reward, 1) + "R" : "—"}</div></div>
      </div>
      <div class="text-faint text-[11px] mt-2">${r.distance_to_pivot_pct != null ? num(r.distance_to_pivot_pct, 1) + "% to pivot" : ""}${r.vcp_contractions ? " · VCP " + r.vcp_contractions : ""}</div>
    </div>`;
}

async function loadPicks(force = false) {
  if (!appEntered) return;          // don't scan until the user enters the app
  if (picksLoadedOnce && !force) return;
  const broad = $("#picks-broad").checked;
  $("#picks-status").innerHTML = `<span class="spinner"></span> ${broad ? t("msg.rankingBroad") : t("msg.rankingMarket")}`;
  $("#picks-results").innerHTML = "";
  try {
    const data = await api(`/api/screener/recommend?strategy=${picksStrategy}&broad=${broad}&limit=30`);
    $("#picks-status").textContent = `${data.matched} / ${data.scanned}`;
    $("#picks-results").innerHTML = data.results.length
      ? `<div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">` + data.results.map(picksCard).join("") + `</div>`
      : `<div class="bg-card border border-border rounded-2xl text-subtext text-sm text-center py-12">${t("msg.noPicks")}</div>`;
    picksLoadedOnce = true;
  } catch (e) { $("#picks-status").innerHTML = `<span class="text-danger">${t("msg.error")}: ${e.message}</span>`; }
}

$$("#picks-strategy .range-btn").forEach((b) => {
  b.addEventListener("click", () => {
    picksStrategy = b.dataset.strategy;
    $$("#picks-strategy .range-btn").forEach((x) => x.classList.toggle("active", x === b));
    loadPicks(true);
  });
});
$("#picks-refresh").addEventListener("click", () => loadPicks(true));
$("#picks-broad").addEventListener("change", () => loadPicks(true));

// ── Stock detail modal (chart + fundamentals + pattern) ──────────────────────────
const modal = $("#modal");
let chart = null;
let emaSeries = {};            // period -> lightweight-charts line series

const CHART_RANGES = [
  { label: "6M", period: "6mo" },
  { label: "1Y", period: "1y" },
  { label: "2Y", period: "2y" },
  { label: "5Y", period: "5y" },
];

// Moving-average overlays. EMA50/150/200 are the trend backbone, so they are
// on by default; the fast EMAs (5/10/21) are opt-in to avoid clutter.
const EMA_CONFIG = [
  { period: 5,   color: "#8a95a8", on: false },
  { period: 10,  color: "#c084fc", on: false },
  { period: 21,  color: "#3b82f6", on: false },
  { period: 50,  color: "#f5a623", on: true },
  { period: 150, color: "#00d49b", on: true },
  { period: 200, color: "#ff5260", on: true },
];

function defaultEmaOn() {
  return Object.fromEntries(EMA_CONFIG.map((e) => [e.period, e.on]));
}

let detailState = {
  symbol: null, pattern: null, period: "1y", financials: null,
  metric: "revenue", freq: "annual", candles: [], emaOn: defaultEmaOn(),
};

// Exponential moving average over an array of {time, value} closes.
function computeEMA(closes, period) {
  if (closes.length < period) return [];
  const k = 2 / (period + 1);
  const out = [];
  // Seed with a simple average of the first `period` closes.
  let ema = closes.slice(0, period).reduce((a, c) => a + c.value, 0) / period;
  out.push({ time: closes[period - 1].time, value: ema });
  for (let i = period; i < closes.length; i++) {
    ema = closes[i].value * k + ema * (1 - k);
    out.push({ time: closes[i].time, value: ema });
  }
  return out;
}

function destroyCharts() {
  if (chart) { chart.remove(); chart = null; }
  emaSeries = {};
}
function closeModal() { modal.classList.add("hidden"); destroyCharts(); }
$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

window.openStock = async function (symbol) {
  symbol = symbol.toUpperCase();
  modal.classList.remove("hidden");
  $("#modal-title").textContent = symbol;
  $("#modal-body").innerHTML = `<div class="py-16 text-center text-subtext"><span class="spinner"></span> ${t("msg.loading")} ${symbol}…</div>`;
  detailState = {
    symbol, pattern: null, period: "1y", financials: null,
    metric: "revenue", freq: "annual", candles: [], emaOn: defaultEmaOn(),
  };

  try {
    const [fund, ohlcv, pattern, financials] = await Promise.all([
      api(`/api/stocks/${symbol}/fundamentals`).catch(() => ({ symbol })),
      api(`/api/stocks/${symbol}/ohlcv?period=${detailState.period}`).catch(() => ({ candles: [] })),
      api(`/api/patterns/scan/${symbol}`).catch(() => null),
      api(`/api/stocks/${symbol}/financials`).catch(() => ({ annual: [], quarterly: [] })),
    ]);

    detailState.pattern = pattern;
    detailState.financials = financials;

    $("#modal-title").innerHTML = `${symbol} <span class="text-subtext font-normal text-sm">${fund.name || ""}</span>`;

    const onWatch = await isOnWatchlist(symbol);
    $("#modal-body").innerHTML = renderStockDetail(symbol, fund, pattern, onWatch);
    attachTips($("#modal-body"));
    drawChart(ohlcv.candles || [], pattern);
    wireChartRanges(symbol);
    wireEmaLegend();
    wireFundamentalsCharts();

    $("#detail-wl-toggle")?.addEventListener("click", async () => {
      const wid = await ensureActiveWatchlist();
      if (await isOnWatchlist(symbol)) {
        await api(`/api/screener/watchlist/${symbol}?watchlist_id=${wid}`, { method: "DELETE" });
      } else {
        await api("/api/screener/watchlist", { method: "POST", body: JSON.stringify({ symbol, watchlist_id: wid }) });
      }
      const now = await isOnWatchlist(symbol);
      const btn = $("#detail-wl-toggle");
      btn.textContent = now ? t("detail.onwatch") : t("detail.addwatch");
      btn.className = now ? "btn-outline text-sm" : "btn-primary text-sm";
      loadWatchlist();
    });
  } catch (e) {
    $("#modal-body").innerHTML = `<div class="py-12 text-center text-danger">${e.message}</div>`;
  }
};

// The modal's "Add to Watchlist" acts on the active list. When the user hasn't
// opened the Watchlist tab yet, fall back to the first list the server returns.
async function ensureActiveWatchlist() {
  if (activeWatchlistId) return activeWatchlistId;
  try {
    const lists = await api("/api/screener/watchlists");
    watchlists = lists;
    activeWatchlistId = lists[0]?.id ?? null;
  } catch (_) {}
  return activeWatchlistId;
}

async function isOnWatchlist(symbol) {
  try {
    const wid = await ensureActiveWatchlist();
    const items = await api(`/api/screener/watchlist?watchlist_id=${wid}`);
    return items.some((i) => i.symbol === symbol);
  } catch (_) { return false; }
}

function stat(label, value, tipKey) {
  return `<div class="stat"><div class="k">${label}${tipKey ? " " + infoIcon(tipKey) : ""}</div><div class="v">${value}</div></div>`;
}

function renderStockDetail(symbol, f, p, onWatch) {
  const price = f.current_price ?? (p ? p_price(p) : null);
  const wlBtn = `<button id="detail-wl-toggle" class="${onWatch ? "btn-outline" : "btn-primary"} text-sm">${onWatch ? t("detail.onwatch") : t("detail.addwatch")}</button>`;

  let patternBlock = "";
  if (p) {
    // Bilingual analysis narrative from the backend (summary_en / summary_vi).
    const summaryText = window.I18N && window.I18N.getLang() === "vi"
      ? (p.summary_vi || p.summary_en)
      : (p.summary_en || p.summary_vi);
    const summaryBlock = summaryText ? `
      <div class="bg-surface border border-border rounded-xl p-3 mb-4">
        <div class="text-xs text-subtext font-semibold uppercase tracking-wide mb-1">${t("detail.analysis")}</div>
        <p class="text-sm leading-relaxed text-text">${summaryText}</p>
      </div>` : "";

    patternBlock = `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        ${signalBadge(p.signal)} ${stageBadge(p.stage, p.stage_label)}
        <div class="flex items-center gap-2 ml-auto">
          <div class="scorebar w-24"><span style="width:${p.score}%;background:${scoreColor(p.score)}"></span></div>
          <span style="color:${scoreColor(p.score)};font-weight:800;font-size:1.1rem">${num(p.score, 0)}</span>
          <span class="text-faint text-xs">${t("table.score").toLowerCase()} ${infoIcon("score")}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        ${stat(t("stat.entry"), p.entry_price ? "$" + num(p.entry_price) : "—", "entry")}
        ${stat(t("stat.stop"), p.stop_loss ? "$" + num(p.stop_loss) : "—", "stop")}
        ${stat(t("stat.target"), p.target_price ? "$" + num(p.target_price) : "—", "target")}
        ${stat(t("stat.rr"), p.risk_reward ? num(p.risk_reward, 1) + "R" : "—", "rr")}
        ${stat(t("stat.pivot"), p.pivot_high ? "$" + num(p.pivot_high) : "—", "pivot")}
        ${stat(t("stat.range"), p.price_range_pct != null ? num(p.price_range_pct, 1) + "%" : "—", "price_range")}
        ${stat(t("stat.voldryup"), p.volume_dry_up_pct != null ? num(p.volume_dry_up_pct, 1) + "%" : "—", "volume_dryup")}
        ${stat(t("stat.vcp"), p.vcp_contractions ?? "—", "vcp")}
      </div>
      ${summaryBlock}`;
  }

  return `
    <div class="flex items-center justify-between mb-4 gap-3 flex-wrap">
      <div>
        <div class="text-2xl font-bold">${price ? "$" + num(price) : "—"}</div>
        <div class="text-faint text-xs">${f.sector || ""}${f.industry ? " · " + f.industry : ""}</div>
      </div>
      ${wlBtn}
    </div>

    ${patternBlock}

    <div class="bg-surface border border-border rounded-xl p-2 mb-4">
      <div class="flex items-center justify-between px-2 py-1 gap-2 flex-wrap">
        <span class="text-xs text-subtext font-semibold uppercase tracking-wide">${t("detail.pricehistory")}</span>
        <div id="chart-ranges" class="flex gap-1">
          ${CHART_RANGES.map((r) => `<button class="range-btn ${r.period === detailState.period ? "active" : ""}" data-period="${r.period}">${r.label}</button>`).join("")}
        </div>
      </div>
      <div id="ema-legend" class="flex flex-wrap gap-1.5 px-2 pb-1">
        ${EMA_CONFIG.map((e) => `<button class="ema-btn ${detailState.emaOn[e.period] ? "active" : ""}" data-ema="${e.period}" style="--ema:${e.color}">EMA${e.period}</button>`).join("")}
      </div>
      <div id="chart" style="height:280px;width:100%"></div>
    </div>

    <div class="bg-surface border border-border rounded-xl p-2 mb-4">
      <div class="flex items-center justify-between px-2 py-1 gap-2 flex-wrap">
        <span class="text-xs text-subtext font-semibold uppercase tracking-wide">${t("detail.fundtrend")}</span>
        <div class="flex items-center gap-2">
          <div id="fund-metric" class="flex gap-1">
            <button class="range-btn active" data-metric="revenue">${t("detail.revenue")}</button>
            <button class="range-btn" data-metric="net_income">${t("detail.profit")}</button>
            <button class="range-btn" data-metric="eps">${t("detail.eps")}</button>
          </div>
          <div id="fund-freq" class="flex gap-1">
            <button class="range-btn active" data-freq="annual">${t("detail.annual")}</button>
            <button class="range-btn" data-freq="quarterly">${t("detail.quarterly")}</button>
          </div>
        </div>
      </div>
      <div id="fund-chart" style="height:150px;width:100%"></div>
    </div>

    <h3 class="text-sm font-bold uppercase tracking-wide text-subtext mb-2">${t("detail.fundamentals")}</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
      ${stat(t("stat.marketcap"), fmtBig(f.market_cap), "market_cap")}
      ${stat(t("stat.pe"), num(f.pe_ratio, 1), "pe_ratio")}
      ${stat(t("stat.eps"), f.eps != null ? "$" + num(f.eps) : "—", "eps")}
      ${stat(t("stat.roe"), f.roe != null ? num(f.roe * 100, 1) + "%" : "—", "roe")}
      ${stat(t("stat.profitmargin"), f.profit_margin != null ? num(f.profit_margin * 100, 1) + "%" : "—", "profit_margin")}
      ${stat(t("stat.revgrowth"), f.revenue_growth != null ? num(f.revenue_growth * 100, 1) + "%" : "—", "revenue_growth")}
      ${stat(t("stat.beta"), num(f.beta, 2), "beta")}
      ${stat(t("stat.divyield"), f.dividend_yield != null ? num(f.dividend_yield, 2) + "%" : "—", "dividend_yield")}
      ${stat(t("stat.week52"), (f.week52_low != null && f.week52_high != null) ? "$" + num(f.week52_low, 0) + "–" + num(f.week52_high, 0) : "—", "week52")}
    </div>

    ${f.summary ? `<h3 class="text-sm font-bold uppercase tracking-wide text-subtext mb-2">${t("detail.about")}</h3>
      <p class="text-subtext text-sm leading-relaxed">${f.summary}</p>
      ${f.website ? `<a href="${f.website}" target="_blank" class="text-accent text-sm mt-2 inline-block">${f.website} ↗</a>` : ""}` : ""}
  `;
}
function p_price() { return null; }

function drawChart(candles, pattern) {
  const el = $("#chart");
  if (!el || !window.LightweightCharts) { return; }
  if (chart) { chart.remove(); chart = null; }
  emaSeries = {};
  detailState.candles = candles || [];
  if (!candles.length) {
    el.innerHTML = `<div class="text-faint text-sm text-center py-16">${t("msg.noChart")}</div>`;
    return;
  }
  el.innerHTML = "";
  chart = LightweightCharts.createChart(el, chartTheme({ width: el.clientWidth, height: 280 }));
  const candleSeries = chart.addCandlestickSeries({
    upColor: "#00d49b", downColor: "#ff5260", borderVisible: false,
    wickUpColor: "#00d49b", wickDownColor: "#ff5260",
  });
  candleSeries.setData(candles.map((c) => ({ time: c.date, open: c.open, high: c.high, low: c.low, close: c.close })));

  const volSeries = chart.addHistogramSeries({
    priceFormat: { type: "volume" }, priceScaleId: "vol",
  });
  chart.priceScale("vol").applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
  volSeries.setData(candles.map((c) => ({
    time: c.date, value: c.volume,
    color: c.close >= c.open ? "#00d49b44" : "#ff526044",
  })));

  // EMA overlays — draw the ones toggled on.
  const closes = candles.map((c) => ({ time: c.date, value: c.close }));
  EMA_CONFIG.forEach((e) => {
    if (!detailState.emaOn[e.period]) return;
    const data = computeEMA(closes, e.period);
    if (!data.length) return;
    const line = chart.addLineSeries({
      color: e.color, lineWidth: 1.5, priceLineVisible: false, lastValueVisible: false,
      crosshairMarkerVisible: false,
    });
    line.setData(data);
    emaSeries[e.period] = line;
  });

  // pivot / entry / stop / target lines
  if (pattern) {
    const lines = [
      [pattern.pivot_high, "#f5a623", "Pivot"],
      [pattern.entry_price, "#3b82f6", "Entry"],
      [pattern.stop_loss, "#ff5260", "Stop"],
      [pattern.target_price, "#00d49b", "Target"],
    ];
    lines.forEach(([price, color, title]) => {
      if (price) candleSeries.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title });
    });
  }
  chart.timeScale().fitContent();
  new ResizeObserver(() => chart && chart.applyOptions({ width: el.clientWidth })).observe(el);
}

// Toggle EMA overlays without refetching: add/remove the line series live.
function wireEmaLegend() {
  $$("#ema-legend .ema-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const period = parseInt(btn.dataset.ema);
      const cfg = EMA_CONFIG.find((e) => e.period === period);
      const turnOn = !detailState.emaOn[period];
      detailState.emaOn[period] = turnOn;
      btn.classList.toggle("active", turnOn);
      if (!chart) return;
      if (turnOn) {
        const closes = detailState.candles.map((c) => ({ time: c.date, value: c.close }));
        const data = computeEMA(closes, period);
        if (data.length) {
          const line = chart.addLineSeries({
            color: cfg.color, lineWidth: 1.5, priceLineVisible: false,
            lastValueVisible: false, crosshairMarkerVisible: false,
          });
          line.setData(data);
          emaSeries[period] = line;
        }
      } else if (emaSeries[period]) {
        chart.removeSeries(emaSeries[period]);
        delete emaSeries[period];
      }
    });
  });
}

// Wire the 6M/1Y/2Y/5Y range buttons — re-fetch OHLCV and redraw on click.
function wireChartRanges(symbol) {
  $$("#chart-ranges .range-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const period = btn.dataset.period;
      if (period === detailState.period) return;
      detailState.period = period;
      $$("#chart-ranges .range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      $("#chart").innerHTML = `<div class="py-16 text-center text-subtext"><span class="spinner"></span></div>`;
      try {
        const ohlcv = await api(`/api/stocks/${symbol}/ohlcv?period=${period}`);
        drawChart(ohlcv.candles || [], detailState.pattern);
      } catch (e) {
        $("#chart").innerHTML = `<div class="text-danger text-sm text-center py-16">${e.message}</div>`;
      }
    });
  });
}

// ── Fundamentals trend chart (EPS / revenue / net income) ────────────────────────
const FUND_META = {
  revenue: { label: "Revenue", money: true },
  net_income: { label: "Net Income", money: true },
  eps: { label: "EPS", money: false },
};

function wireFundamentalsCharts() {
  $$("#fund-metric .range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      detailState.metric = btn.dataset.metric;
      $$("#fund-metric .range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      drawFundChart();
    });
  });
  $$("#fund-freq .range-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      detailState.freq = btn.dataset.freq;
      $$("#fund-freq .range-btn").forEach((b) => b.classList.toggle("active", b === btn));
      drawFundChart();
    });
  });
  drawFundChart();
}

// Compact period label for the fundamentals bars (e.g. "2023" or "Q3 '24").
function fundPeriodLabel(period, freq) {
  const d = new Date(period);
  if (isNaN(d.getTime())) return period;
  const yy = String(d.getFullYear()).slice(2);
  if (freq === "annual") return String(d.getFullYear());
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `Q${q} '${yy}`;
}

// Format a fundamentals value: money → $1.2B, EPS → $1.23.
function fundValueLabel(v, money) {
  if (money) return (v < 0 ? "-$" : "$") + fmtBig(Math.abs(v));
  return (v < 0 ? "-$" : "$") + Math.abs(v).toFixed(2);
}

// A custom, dependency-free SVG bar chart. Histogram series from
// lightweight-charts pack bars edge-to-edge (built for dense daily volume);
// for a handful of annual/quarterly periods we want real spacing + labels.
function drawFundChart() {
  const el = $("#fund-chart");
  if (!el) return;

  let series = (detailState.financials?.[detailState.freq] || [])
    .filter((pt) => pt[detailState.metric] !== null && pt[detailState.metric] !== undefined);
  // Quarterly: keep the most recent ~12 quarters (points are oldest→newest).
  if (detailState.freq === "quarterly" && series.length > 12) series = series.slice(-12);

  const meta = FUND_META[detailState.metric];
  if (!series.length) {
    el.innerHTML = `<div class="text-faint text-sm text-center py-12">No ${meta.label.toLowerCase()} data available.</div>`;
    return;
  }

  const values = series.map((pt) => pt[detailState.metric]);
  const maxV = Math.max(...values, 0);
  const minV = Math.min(...values, 0);
  const span = (maxV - minV) || 1;

  const W = Math.max(el.clientWidth || 600, series.length * 44);
  const H = 150;
  const padTop = 18, padBottom = 22;
  const plotH = H - padTop - padBottom;
  const zeroY = padTop + (maxV / span) * plotH;     // y of the zero baseline
  const slot = W / series.length;
  const barW = Math.min(slot * 0.6, 46);

  const bars = series.map((pt, i) => {
    const v = pt[detailState.metric];
    const cx = i * slot + slot / 2;
    const h = (Math.abs(v) / span) * plotH;
    const y = v >= 0 ? zeroY - h : zeroY;
    const color = v >= 0 ? "#00d49b" : "#ff5260";
    const valLabel = fundValueLabel(v, meta.money);
    const perLabel = fundPeriodLabel(pt.period, detailState.freq);
    return `
      <g>
        <rect x="${cx - barW / 2}" y="${y}" width="${barW}" height="${Math.max(h, 1)}"
              rx="3" fill="${color}" opacity="0.85">
          <title>${perLabel}: ${valLabel}</title>
        </rect>
        <text x="${cx}" y="${(v >= 0 ? y - 4 : y + h + 11)}" text-anchor="middle"
              font-size="9" fill="#aab3c4" font-weight="600">${valLabel}</text>
        <text x="${cx}" y="${H - 7}" text-anchor="middle" font-size="9" fill="#5b6577">${perLabel}</text>
      </g>`;
  }).join("");

  // Zero baseline (only when there are negatives to separate).
  const baseline = minV < 0
    ? `<line x1="0" y1="${zeroY}" x2="${W}" y2="${zeroY}" stroke="#2f3a4d" stroke-width="1" />`
    : "";

  el.innerHTML = `
    <div style="overflow-x:auto;width:100%">
      <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;min-width:100%">
        ${baseline}${bars}
      </svg>
    </div>`;
}

// ── Language ────────────────────────────────────────────────────────────────
// Re-render dynamic content when the user flips EN ⇄ VI. Static [data-i18n]
// nodes are handled inside I18N.setLang; here we refresh JS-rendered views.
if (window.I18N) {
  window.I18N.init();
  window.I18N.onChange(() => {
    renderLearn();                                  // Learn cards (bilingual glossary)
    if (sectorsLoaded) renderSectors();             // sector list labels
    if (picksLoadedOnce) loadPicks(true);           // re-fetch + relabel picks
    if (!modal.classList.contains("hidden") && detailState.symbol) {
      openStock(detailState.symbol);                // re-render the open stock modal
    }
  });
}

// ── init ────────────────────────────────────────────────────────────────────
// Land on Top Picks (the hero CTA reveals the app over this). Picks only fetch
// lazily once the user enters and the tab is shown.
setTab("picks");
loadSectorOptions();
attachTips();
