// AMR Personal Stock Screener — vanilla JS frontend
const API = ""; // same origin

// ── helpers ───────────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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

function signalBadge(signal) {
  const map = {
    BREAKOUT_IMMINENT: ["#00c896", "Breakout"],
    CONSOLIDATING: ["#f5a623", "Consolidating"],
    NO_SIGNAL: ["#8b95a7", "No signal"],
  };
  const [color, label] = map[signal] || map.NO_SIGNAL;
  return `<span class="badge" style="background:${color}22;color:${color}">${label}</span>`;
}

function scoreColor(s) {
  if (s >= 70) return "#00c896";
  if (s >= 40) return "#f5a623";
  return "#8b95a7";
}

function num(v, d = 2) {
  return v === null || v === undefined ? "—" : Number(v).toFixed(d);
}

function resultsTable(rows) {
  if (!rows || rows.length === 0) {
    return `<div class="text-subtext text-sm text-center py-10">No matches. Try lowering the min score or widening filters.</div>`;
  }
  const body = rows.map((r) => `
    <tr>
      <td class="font-semibold">${r.symbol}</td>
      <td>
        <div class="flex items-center gap-2">
          <div class="scorebar w-16"><span style="width:${r.score}%;background:${scoreColor(r.score)}"></span></div>
          <span style="color:${scoreColor(r.score)};font-weight:700">${num(r.score, 0)}</span>
        </div>
      </td>
      <td>${signalBadge(r.signal)}</td>
      <td>${r.stage_label}</td>
      <td>$${num(r.price)}</td>
      <td>${r.entry_price ? "$" + num(r.entry_price) : "—"}</td>
      <td>${r.stop_loss ? "$" + num(r.stop_loss) : "—"}</td>
      <td>${r.target_price ? "$" + num(r.target_price) : "—"}</td>
      <td>${r.risk_reward ? num(r.risk_reward, 1) + "R" : "—"}</td>
      <td>${num(r.distance_to_pivot_pct, 1)}%</td>
      <td>${num(r.price_range_pct, 1)}%</td>
      <td>${r.vcp_contractions ?? "—"}</td>
    </tr>`).join("");

  return `
    <div class="bg-card border border-border rounded-2xl overflow-x-auto">
      <table>
        <thead><tr>
          <th>Symbol</th><th>Score</th><th>Signal</th><th>Stage</th><th>Price</th>
          <th>Entry</th><th>Stop</th><th>Target</th><th>R:R</th>
          <th>Dist→Pivot</th><th>Range</th><th>VCP</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
    </div>`;
}

// ── tab switching ───────────────────────────────────────────────────────────
function setTab(name) {
  $$(".tab-btn").forEach((b) => b.classList.toggle("active", b.dataset.tab === name));
  ["screener", "watchlist", "sectors"].forEach((t) => {
    $("#tab-" + t).classList.toggle("hidden", t !== name);
  });
  if (name === "watchlist") loadWatchlist();
}
$$(".tab-btn").forEach((b) => b.addEventListener("click", () => setTab(b.dataset.tab)));

// ── screener ──────────────────────────────────────────────────────────────
async function loadSectorOptions() {
  try {
    const { sectors } = await api("/api/screener/universe");
    const sel = $("#sector-select");
    sel.size = Math.min(sectors.length, 6);
    sel.innerHTML = sectors.map((s) => `<option value="${s}">${s}</option>`).join("");
  } catch (e) { /* ignore */ }
}

function buildScreenPayload() {
  const symbols = $("#sym-input").value.split(",").map((s) => s.trim()).filter(Boolean);
  const sectors = Array.from($("#sector-select").selectedOptions).map((o) => o.value);
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
  const payload = buildScreenPayload();
  if (!payload.symbols && !payload.sectors) {
    $("#screen-status").textContent = "Enter symbols or pick a sector.";
    return;
  }
  $("#screen-status").innerHTML = `<span class="spinner"></span> Scanning…`;
  $("#screen-results").innerHTML = "";
  try {
    const data = await api("/api/screener/screen", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("#screen-status").textContent =
      `${data.matched} match(es) of ${data.scanned} scanned (${data.universe} in universe).`;
    $("#screen-results").innerHTML = resultsTable(data.results);
  } catch (e) {
    $("#screen-status").textContent = "Error: " + e.message;
  }
});

// ── watchlist ───────────────────────────────────────────────────────────────
async function loadWatchlist() {
  try {
    const items = await api("/api/screener/watchlist");
    $("#wl-chips").innerHTML = items.length
      ? items.map((i) => `
          <span class="chip">${i.symbol}
            <button data-sym="${i.symbol}" class="wl-del">×</button>
          </span>`).join("")
      : `<span class="text-subtext text-sm">No symbols yet — add some above.</span>`;
    $$(".wl-del").forEach((b) =>
      b.addEventListener("click", async () => {
        await api("/api/screener/watchlist/" + b.dataset.sym, { method: "DELETE" });
        loadWatchlist();
      })
    );
  } catch (e) {
    $("#wl-chips").innerHTML = `<span class="text-danger text-sm">${e.message}</span>`;
  }
}

$("#wl-add").addEventListener("click", async () => {
  const sym = $("#wl-symbol").value.trim().toUpperCase();
  if (!sym) return;
  try {
    await api("/api/screener/watchlist", {
      method: "POST",
      body: JSON.stringify({ symbol: sym }),
    });
    $("#wl-symbol").value = "";
    loadWatchlist();
  } catch (e) { alert(e.message); }
});
$("#wl-symbol").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#wl-add").click(); });

$("#wl-screen").addEventListener("click", async () => {
  $("#wl-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> Screening watchlist…</div>`;
  try {
    const data = await api("/api/screener/watchlist/screen", {
      method: "POST",
      body: JSON.stringify({ sort_by: "score", limit: 200 }),
    });
    $("#wl-results").innerHTML = resultsTable(data.results);
  } catch (e) {
    $("#wl-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`;
  }
});

// ── sectors ─────────────────────────────────────────────────────────────────
function volColor(pct) {
  if (pct > 10) return "#00c896";
  if (pct > 0) return "#7dcfb6";
  if (pct > -10) return "#f5a623";
  return "#ff4d4d";
}
function fmtVol(v) {
  if (v >= 1e9) return (v / 1e9).toFixed(1) + "B";
  if (v >= 1e6) return (v / 1e6).toFixed(1) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(0) + "K";
  return String(v);
}

$("#load-sectors").addEventListener("click", async () => {
  $("#sector-results").innerHTML = `<div class="text-subtext text-sm py-6"><span class="spinner"></span> Scanning all 11 sectors…</div>`;
  try {
    const data = await api("/api/industries");
    $("#sector-results").innerHTML = data.map((s) => {
      const c = volColor(s.volume_change_pct);
      return `
        <div class="bg-card border border-border rounded-xl p-4 mb-2 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-full bg-surface flex items-center justify-center text-subtext text-xs font-bold">#${s.rank}</span>
            <div>
              <div class="font-semibold">${s.sector}</div>
              <div class="text-subtext text-xs">3m ${fmtVol(s.avg_volume_3m)} · 6m ${fmtVol(s.avg_volume_6m)}</div>
            </div>
          </div>
          <span class="badge" style="background:${c}22;color:${c}">
            ${s.volume_change_pct >= 0 ? "+" : ""}${s.volume_change_pct.toFixed(1)}%
          </span>
        </div>`;
    }).join("");
  } catch (e) {
    $("#sector-results").innerHTML = `<div class="text-danger text-sm py-6">${e.message}</div>`;
  }
});

// ── init ────────────────────────────────────────────────────────────────────
setTab("screener");
loadSectorOptions();
