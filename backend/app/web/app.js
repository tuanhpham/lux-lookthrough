// AMR Personal Stock Screener — frontend
const API = "";

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const G = window.GLOSSARY;

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
  const map = {
    BREAKOUT_IMMINENT: ["#00d49b", "BREAKOUT"],
    CONSOLIDATING: ["#f5a623", "CONSOLIDATING"],
    NO_SIGNAL: ["#5b6577", "NO SIGNAL"],
  };
  const [c, label] = map[signal] || map.NO_SIGNAL;
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
    const def = G[el.dataset.tip];
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
      No matches. Try lowering the min score or widening filters.</div>`;
  }
  const head = `
    <th>Symbol</th>
    <th>Score ${infoIcon("score")}</th>
    <th>Signal ${infoIcon("signal")}</th>
    <th>Stage ${infoIcon("stage")}</th>
    <th>Price</th>
    <th>Entry ${infoIcon("entry")}</th>
    <th>Stop ${infoIcon("stop")}</th>
    <th>Target ${infoIcon("target")}</th>
    <th>R:R ${infoIcon("rr")}</th>
    <th>Dist ${infoIcon("distance")}</th>
    <th>VCP ${infoIcon("vcp")}</th>`;
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
    <p class="text-faint text-xs mt-2">Tip: click any row for charts &amp; fundamentals. Hover the “i” icons for definitions.</p>`;
  return out;
}

// ── tabs ────────────────────────────────────────────────────────────────────
function setTab(name) {
  $$("[data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  ["screener", "watchlist", "sectors", "learn"].forEach((t) =>
    $("#tab-" + t).classList.toggle("hidden", t !== name)
  );
  if (name === "watchlist") loadWatchlist();
  if (name === "learn") renderLearn();
  window.scrollTo({ top: 0, behavior: "smooth" });
}
$$("[data-tab]").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ── Learn page ─────────────────────────────────────────────────────────────────
function renderLearn() {
  const el = $("#learn-content");
  if (el.dataset.rendered) return;
  const groups = [
    { title: "Screener Metrics", keys: ["score", "signal", "stage", "vcp", "atr_contraction", "price_range", "volume_dryup", "days_in_base"] },
    { title: "Pivots & Trade Levels", keys: ["pivot", "distance", "entry", "stop", "target", "rr"] },
    { title: "Fundamentals", keys: ["pe_ratio", "eps", "market_cap", "roe", "profit_margin", "revenue_growth", "beta", "dividend_yield", "week52"] },
    { title: "Sector Scanner", keys: ["volume_change"] },
  ];
  el.innerHTML = groups.map((grp) => `
    <div>
      <h2 class="text-sm font-bold text-accent uppercase tracking-wide mb-2 mt-2">${grp.title}</h2>
      <div class="grid md:grid-cols-2 gap-3">
        ${grp.keys.map((k) => G[k] ? `
          <div class="learn-card">
            <h3>${G[k].term}</h3>
            <p>${G[k].long}</p>
          </div>` : "").join("")}
      </div>
    </div>`).join("");
  el.dataset.rendered = "1";
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
  };
}
$("#run-screen").addEventListener("click", async () => {
  const p = buildScreenPayload();
  if (!p.symbols && !p.sectors) { $("#screen-status").textContent = "Enter symbols or pick a sector."; return; }
  $("#screen-status").innerHTML = `<span class="spinner"></span> Scanning…`;
  $("#screen-results").innerHTML = "";
  try {
    const data = await api("/api/screener/screen", { method: "POST", body: JSON.stringify(p) });
    $("#screen-status").textContent = `${data.matched} match(es) of ${data.scanned} scanned.`;
    $("#screen-results").innerHTML = resultsTable(data.results);
    attachTips($("#screen-results"));
  } catch (e) { $("#screen-status").textContent = "Error: " + e.message; }
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
      const name = prompt("Rename watchlist:", w?.name || "");
      if (!name || !name.trim()) return;
      try {
        await api("/api/screener/watchlists/" + id, { method: "PATCH", body: JSON.stringify({ name: name.trim() }) });
        await loadWatchlist();
      } catch (err) { alert(err.message); }
    });
    tab.querySelector('[data-act="delete"]')?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const w = watchlists.find((x) => x.id === id);
      if (!confirm(`Delete watchlist "${w?.name}" and its symbols?`)) return;
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
    : `<span class="text-subtext text-sm">No symbols yet — add some above.</span>`;
  $$(".wl-del").forEach((b) => b.addEventListener("click", async (e) => {
    e.stopPropagation();
    await api(`/api/screener/watchlist/${b.dataset.sym}?watchlist_id=${activeWatchlistId}`, { method: "DELETE" });
    loadWatchlist();
  }));
}

$("#wl-new").addEventListener("click", async () => {
  const name = prompt("Name your new watchlist:", "");
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
  $("#wl-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> Screening watchlist…</div>`;
  try {
    const data = await api(`/api/screener/watchlists/${activeWatchlistId}/screen`, { method: "POST", body: JSON.stringify({ sort_by: "score", limit: 200 }) });
    $("#wl-results").innerHTML = resultsTable(data.results);
    attachTips($("#wl-results"));
  } catch (e) { $("#wl-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`; }
});

// ── Sectors ─────────────────────────────────────────────────────────────────
function volColor(p) { return p > 10 ? "#00d49b" : p > 0 ? "#7dcfb6" : p > -10 ? "#f5a623" : "#ff5260"; }
$("#load-sectors").addEventListener("click", async () => {
  $("#sector-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> Scanning all 11 sectors…</div>`;
  try {
    const data = await api("/api/industries");
    $("#sector-results").innerHTML = `<div class="fade-in space-y-2">` + data.map((s) => {
      const c = volColor(s.volume_change_pct);
      return `
        <div class="bg-card border border-border rounded-xl p-4 flex items-center justify-between hover:bg-cardhover transition cursor-pointer"
             onclick="screenSector('${s.sector.replace(/'/g, "\\'")}')">
          <div class="flex items-center gap-3">
            <span class="w-8 h-8 rounded-full bg-surface flex items-center justify-center text-subtext text-xs font-bold">#${s.rank}</span>
            <div>
              <div class="font-semibold">${s.sector}</div>
              <div class="text-faint text-xs">3m ${fmtBig(s.avg_volume_3m)} · 6m ${fmtBig(s.avg_volume_6m)}</div>
            </div>
          </div>
          <span class="badge" style="background:${c}22;color:${c}">${pct(s.volume_change_pct)}</span>
        </div>`;
    }).join("") + `</div><p class="text-faint text-xs mt-2">Click a sector to screen its stocks.</p>`;
  } catch (e) { $("#sector-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`; }
});
window.screenSector = (sector) => {
  setTab("screener");
  $("#sym-input").value = "";
  setSelectedSectors([sector]);
  $("#run-screen").click();
};

// ── Stock detail modal (chart + fundamentals + pattern) ──────────────────────────
const modal = $("#modal");
let chart = null;
let fundChart = null;          // fundamentals (EPS/revenue/profit) chart
let detailState = { symbol: null, pattern: null, period: "1y", financials: null, metric: "revenue", freq: "annual" };

const CHART_RANGES = [
  { label: "6M", period: "6mo" },
  { label: "1Y", period: "1y" },
  { label: "2Y", period: "2y" },
  { label: "5Y", period: "5y" },
];

function destroyCharts() {
  if (chart) { chart.remove(); chart = null; }
  if (fundChart) { fundChart.remove(); fundChart = null; }
}
function closeModal() { modal.classList.add("hidden"); destroyCharts(); }
$("#modal-close").addEventListener("click", closeModal);
$("#modal-backdrop").addEventListener("click", closeModal);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

window.openStock = async function (symbol) {
  symbol = symbol.toUpperCase();
  modal.classList.remove("hidden");
  $("#modal-title").textContent = symbol;
  $("#modal-body").innerHTML = `<div class="py-16 text-center text-subtext"><span class="spinner"></span> Loading ${symbol}…</div>`;
  detailState = { symbol, pattern: null, period: "1y", financials: null, metric: "revenue", freq: "annual" };

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
      btn.textContent = now ? "★ On Watchlist" : "☆ Add to Watchlist";
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
  const wlBtn = `<button id="detail-wl-toggle" class="${onWatch ? "btn-outline" : "btn-primary"} text-sm">${onWatch ? "★ On Watchlist" : "☆ Add to Watchlist"}</button>`;

  let patternBlock = "";
  if (p) {
    patternBlock = `
      <div class="flex flex-wrap items-center gap-2 mb-3">
        ${signalBadge(p.signal)} ${stageBadge(p.stage, p.stage_label)}
        <div class="flex items-center gap-2 ml-auto">
          <div class="scorebar w-24"><span style="width:${p.score}%;background:${scoreColor(p.score)}"></span></div>
          <span style="color:${scoreColor(p.score)};font-weight:800;font-size:1.1rem">${num(p.score, 0)}</span>
          <span class="text-faint text-xs">score ${infoIcon("score")}</span>
        </div>
      </div>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        ${stat("Entry", p.entry_price ? "$" + num(p.entry_price) : "—", "entry")}
        ${stat("Stop", p.stop_loss ? "$" + num(p.stop_loss) : "—", "stop")}
        ${stat("Target", p.target_price ? "$" + num(p.target_price) : "—", "target")}
        ${stat("R:R", p.risk_reward ? num(p.risk_reward, 1) + "R" : "—", "rr")}
        ${stat("Pivot", p.pivot_high ? "$" + num(p.pivot_high) : "—", "pivot")}
        ${stat("Range", p.price_range_pct != null ? num(p.price_range_pct, 1) + "%" : "—", "price_range")}
        ${stat("Vol dry-up", p.volume_dry_up_pct != null ? num(p.volume_dry_up_pct, 1) + "%" : "—", "volume_dryup")}
        ${stat("VCP", p.vcp_contractions ?? "—", "vcp")}
      </div>`;
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
        <span class="text-xs text-subtext font-semibold uppercase tracking-wide">Price History</span>
        <div id="chart-ranges" class="flex gap-1">
          ${CHART_RANGES.map((r) => `<button class="range-btn ${r.period === detailState.period ? "active" : ""}" data-period="${r.period}">${r.label}</button>`).join("")}
        </div>
      </div>
      <div id="chart" style="height:240px;width:100%"></div>
    </div>

    <div class="bg-surface border border-border rounded-xl p-2 mb-4">
      <div class="flex items-center justify-between px-2 py-1 gap-2 flex-wrap">
        <span class="text-xs text-subtext font-semibold uppercase tracking-wide">Fundamentals Trend</span>
        <div class="flex items-center gap-2">
          <div id="fund-metric" class="flex gap-1">
            <button class="range-btn active" data-metric="revenue">Revenue</button>
            <button class="range-btn" data-metric="net_income">Profit</button>
            <button class="range-btn" data-metric="eps">EPS</button>
          </div>
          <div id="fund-freq" class="flex gap-1">
            <button class="range-btn active" data-freq="annual">Annual</button>
            <button class="range-btn" data-freq="quarterly">Quarterly</button>
          </div>
        </div>
      </div>
      <div id="fund-chart" style="height:200px;width:100%"></div>
    </div>

    <h3 class="text-sm font-bold uppercase tracking-wide text-subtext mb-2">Fundamentals</h3>
    <div class="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
      ${stat("Market Cap", fmtBig(f.market_cap), "market_cap")}
      ${stat("P/E", num(f.pe_ratio, 1), "pe_ratio")}
      ${stat("EPS", f.eps != null ? "$" + num(f.eps) : "—", "eps")}
      ${stat("ROE", f.roe != null ? num(f.roe * 100, 1) + "%" : "—", "roe")}
      ${stat("Profit Margin", f.profit_margin != null ? num(f.profit_margin * 100, 1) + "%" : "—", "profit_margin")}
      ${stat("Rev Growth", f.revenue_growth != null ? num(f.revenue_growth * 100, 1) + "%" : "—", "revenue_growth")}
      ${stat("Beta", num(f.beta, 2), "beta")}
      ${stat("Div Yield", f.dividend_yield != null ? num(f.dividend_yield, 2) + "%" : "—", "dividend_yield")}
      ${stat("52w Range", (f.week52_low != null && f.week52_high != null) ? "$" + num(f.week52_low, 0) + "–" + num(f.week52_high, 0) : "—", "week52")}
    </div>

    ${f.summary ? `<h3 class="text-sm font-bold uppercase tracking-wide text-subtext mb-2">About</h3>
      <p class="text-subtext text-sm leading-relaxed">${f.summary}</p>
      ${f.website ? `<a href="${f.website}" target="_blank" class="text-accent text-sm mt-2 inline-block">${f.website} ↗</a>` : ""}` : ""}
  `;
}
function p_price() { return null; }

function drawChart(candles, pattern) {
  const el = $("#chart");
  if (!el || !window.LightweightCharts) { return; }
  if (chart) { chart.remove(); chart = null; }
  if (!candles.length) {
    el.innerHTML = `<div class="text-faint text-sm text-center py-16">No chart data.</div>`;
    return;
  }
  el.innerHTML = "";
  chart = LightweightCharts.createChart(el, {
    layout: { background: { color: "transparent" }, textColor: "#8a95a8", fontFamily: "Inter" },
    grid: { vertLines: { color: "#1c2431" }, horzLines: { color: "#1c2431" } },
    rightPriceScale: { borderColor: "#232c3b" },
    timeScale: { borderColor: "#232c3b", timeVisible: false },
    crosshair: { mode: 1 },
    width: el.clientWidth, height: 240,
  });
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

function drawFundChart() {
  const el = $("#fund-chart");
  if (!el || !window.LightweightCharts) return;
  if (fundChart) { fundChart.remove(); fundChart = null; }

  const series = (detailState.financials?.[detailState.freq] || [])
    .filter((pt) => pt[detailState.metric] !== null && pt[detailState.metric] !== undefined);

  if (!series.length) {
    el.innerHTML = `<div class="text-faint text-sm text-center py-14">No ${FUND_META[detailState.metric].label.toLowerCase()} data available.</div>`;
    return;
  }
  el.innerHTML = "";
  fundChart = LightweightCharts.createChart(el, {
    layout: { background: { color: "transparent" }, textColor: "#8a95a8", fontFamily: "Inter" },
    grid: { vertLines: { color: "#1c2431" }, horzLines: { color: "#1c2431" } },
    rightPriceScale: { borderColor: "#232c3b" },
    timeScale: { borderColor: "#232c3b", timeVisible: false },
    crosshair: { mode: 1 },
    width: el.clientWidth, height: 200,
  });
  const meta = FUND_META[detailState.metric];
  const bars = fundChart.addHistogramSeries({
    priceFormat: meta.money
      ? { type: "volume" }
      : { type: "price", precision: 2, minMove: 0.01 },
  });
  bars.setData(series.map((pt) => {
    const v = pt[detailState.metric];
    return { time: pt.period, value: v, color: v >= 0 ? "#00d49b88" : "#ff526088" };
  }));
  fundChart.timeScale().fitContent();
  new ResizeObserver(() => fundChart && fundChart.applyOptions({ width: el.clientWidth })).observe(el);
}

// ── init ────────────────────────────────────────────────────────────────────
setTab("screener");
loadSectorOptions();
attachTips();
