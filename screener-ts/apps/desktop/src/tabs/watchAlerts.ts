/**
 * The "🔔 Telegram alerts" fold on the Watchlist tab.
 *
 * Two tables and a status line. The first says which lists alert and on what (price
 * level, unusual volume, big day move), each list with its own thresholds, so one list
 * can be "levels only" and another "volume spikes only". The second holds the price
 * levels per ticker, for every ticker in a list that alerts on price. The status line
 * is what the VM last said back on `scanner:alerts_seen`.
 *
 * Every change saves at once; the feed throttles and skips unchanged digests, so typing
 * a level costs one bridge write, not one per keystroke.
 */
import type { AppContext } from '../context.js';
import { getLang } from '../ui/i18n.js';
import { isSyncEnabled } from '../adapters/syncClient.js';
import { loadIndex, loadItems, type WatchlistMeta } from '../ui/watchlists.js';
import { openAttrShut, wireCollapse, caretHtml } from '../ui/collapse.js';
import {
  DEFAULT_RULE, MOVE_RANGE, RVOL_RANGE, alertMarketOf, ruleOf,
  type AlertsConfig, type ListRule,
} from '../portfolio/alertRules.js';
import {
  currentAlertsDigest, loadAlertsConfig, readAlertsSeen, saveAlertsConfig, type AlertsSeen,
} from '../portfolio/alertsFeed.js';
import { quoteCurrencyOf } from '@screener/core';
import { openSettingsAt } from './settingsTab.js';

const FOLD = 'wl:alerts';

const L = (en: string, vi: string): string => (getLang() === 'vi' ? vi : en);

const esc = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const MARKET_NAME: Record<string, { en: string; vi: string }> = {
  US: { en: 'US · 9:30–16:00 New York', vi: 'Mỹ · 9:30–16:00 giờ New York' },
  EU: { en: 'Germany/EU · 9:00–17:30 Frankfurt', vi: 'Đức/EU · 9:00–17:30 giờ Frankfurt' },
  VN: { en: 'Vietnam · 9:00–15:00 Hanoi', vi: 'Việt Nam · 9:00–15:00 giờ Hà Nội' },
};

const KIND_WORD: Record<string, { en: string; vi: string }> = {
  above: { en: 'above', vi: 'vượt' },
  below: { en: 'below', vi: 'thủng' },
  vol: { en: 'volume', vi: 'khối lượng' },
  move: { en: 'move', vi: 'biến động' },
};

/** The fold's frame; `mountWatchAlerts` fills it. */
export function watchAlertsHtml(): string {
  return `<details class="fold-block wa-fold card pg-panel" id="wa-fold" data-collapse="${FOLD}"${openAttrShut(FOLD)}>
    <summary class="fold-sum wa-sum">
      <span class="wa-sum-ic" aria-hidden="true">🔔</span>
      <span class="wa-sum-t"><b>${L('Telegram alerts', 'Cảnh báo Telegram')}</b>
        <small>${L('Live alerts from the scanner VM for the lists you pick — price levels, unusual volume, big moves.',
          'VM scanner nhắn ngay khi mã trong danh sách bạn chọn chạm mức giá, khối lượng bất thường hoặc biến động mạnh.')}</small></span>
      <span class="wa-chip" id="wa-chip"></span>
      ${caretHtml(L('Fold', 'Thu gọn'))}
    </summary>
    <div class="fold-body" id="wa-body"><div class="muted">${L('Reading…', 'Đang đọc…')}</div></div>
  </details>`;
}

let cfgCache: AlertsConfig | null = null;

export async function mountWatchAlerts(ctx: AppContext, root: HTMLElement): Promise<void> {
  const fold = root.querySelector<HTMLElement>('#wa-fold');
  if (!fold) return;
  wireCollapse(fold.parentElement ?? root);
  await paint(ctx, fold);
}

/** Re-draw after a list or its tickers changed elsewhere on the tab. */
export async function refreshWatchAlerts(ctx: AppContext): Promise<void> {
  const fold = document.querySelector<HTMLElement>('#wa-fold');
  if (fold) await paint(ctx, fold);
}

async function paint(ctx: AppContext, fold: HTMLElement): Promise<void> {
  const body = fold.querySelector<HTMLElement>('#wa-body')!;
  const cfg = (cfgCache = await loadAlertsConfig(ctx));
  const idx = await loadIndex(ctx);
  const items = new Map<string, string[]>();
  for (const w of idx) items.set(w.id, await loadItems(ctx, w.id));
  const digest = await currentAlertsDigest(ctx);
  if (!body.isConnected) return;

  const chip = fold.querySelector<HTMLElement>('#wa-chip')!;
  const onLists = idx.filter((w) => cfg.lists[w.id]?.on).length;
  chip.className = `wa-chip${cfg.on && digest.n ? ' on' : ''}`;
  chip.textContent = !cfg.on
    ? L('off', 'tắt')
    : digest.n
      ? L(`${digest.n} tickers · ${onLists} lists`, `${digest.n} mã · ${onLists} danh sách`)
      : L('none on', 'chưa bật');

  body.innerHTML = `
    ${isSyncEnabled() ? '' : `<div class="wa-note warn">⚠️ ${L(
      'Sync is off on this device, so the VM cannot see these rules. Turn on ☁️ sync first.',
      'Thiết bị này chưa bật đồng bộ ☁️ nên VM không đọc được các quy tắc này. Bật đồng bộ trước.')}</div>`}
    <div class="wa-master">
      ${toggle('wa-on', cfg.on, L('Alerts on', 'Bật cảnh báo'))}
      <span class="muted">${L(
        'Quotes are yfinance 1-minute bars, about 15 minutes late. Each rule fires at most once per ticker per day.',
        'Giá lấy từ nến 1 phút yfinance, trễ khoảng 15 phút. Mỗi quy tắc báo tối đa một lần mỗi mã mỗi ngày.')}</span>
    </div>
    <h4 class="wa-h">${L('1 · Which lists alert, and on what', '1 · Danh sách nào cảnh báo, và báo gì')}</h4>
    <div class="wa-scroll"><table class="wa-table">
      <thead><tr>
        <th>${L('List', 'Danh sách')}</th>
        <th>${L('Price level', 'Mức giá')}</th>
        <th>${L('Unusual volume', 'Khối lượng bất thường')}</th>
        <th>${L('Big day move', 'Biến động trong ngày')}</th>
      </tr></thead>
      <tbody>${idx.map((w) => listRow(w, ruleOf(cfg, w.id), items.get(w.id)?.length ?? 0)).join('')}</tbody>
    </table></div>
    <p class="wa-help">${L(
      'Volume: today’s volume so far against the 20-day average, scaled for the time of day (an hour in, a normal day has done about a quarter of its volume), so ×2 means “twice the usual pace”. Not before 15 minutes into the session. Move: distance from yesterday’s close, up or down.',
      'Khối lượng: khối lượng từ đầu phiên so với trung bình 20 phiên, đã chia theo giờ trong phiên (sau 1 giờ một ngày bình thường mới khớp khoảng 1/4), nên ×2 nghĩa là “nhanh gấp đôi mọi khi”. Không báo trong 15 phút đầu phiên. Biến động: khoảng cách so với giá đóng cửa hôm qua, tăng hoặc giảm.')}</p>
    <h4 class="wa-h">${L('2 · Price levels per ticker', '2 · Mức giá cho từng mã')}</h4>
    ${levelsTable(cfg, idx, items)}
    <h4 class="wa-h">${L('3 · What the VM says', '3 · VM báo lại')}</h4>
    <div id="wa-seen" class="wa-seen"><span class="muted">${L('Asking the VM…', 'Đang hỏi VM…')}</span></div>
    ${digest.warn.length ? `<ul class="wa-warn">${digest.warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
    <div class="wa-msg" id="wa-msg"></div>`;

  wire(ctx, fold, body);
  void paintSeen(body);
}

function toggle(id: string, on: boolean, label: string, attrs = ''): string {
  return `<label class="wa-sw"><input type="checkbox" id="${id}"${on ? ' checked' : ''} ${attrs} /><i aria-hidden="true"></i><span>${label}</span></label>`;
}

function listRow(w: WatchlistMeta, r: ListRule, count: number): string {
  const id = esc(w.id);
  const dis = r.on ? '' : ' disabled';
  return `<tr class="${r.on ? 'on' : ''}" data-list="${id}">
    <td>${toggle(`wa-l-${id}`, r.on, `<b>${esc(w.name)}</b> <span class="muted">${count}</span>`, `data-f="on"`)}</td>
    <td>${toggle(`wa-p-${id}`, r.price, L('levels below', 'theo bảng dưới'), `data-f="price"${dis}`)}</td>
    <td><span class="wa-cell">${toggle(`wa-v-${id}`, r.volume, '×', `data-f="volume"${dis}`)}
      <input class="field wa-num" type="number" step="0.1" min="${RVOL_RANGE[0]}" max="${RVOL_RANGE[1]}" value="${r.rvol}" data-f="rvol"${r.on && r.volume ? '' : ' disabled'} aria-label="RVOL" /></span></td>
    <td><span class="wa-cell">${toggle(`wa-m-${id}`, r.move, '±', `data-f="move"${dis}`)}
      <input class="field wa-num" type="number" step="0.5" min="${MOVE_RANGE[0]}" max="${MOVE_RANGE[1]}" value="${r.movePct}" data-f="movePct"${r.on && r.move ? '' : ' disabled'} aria-label="%" />%</span></td>
  </tr>`;
}

function fmtLevel(x: number | undefined): string {
  return x === undefined ? '' : String(x);
}

function levelsTable(cfg: AlertsConfig, idx: WatchlistMeta[], items: Map<string, string[]>): string {
  const byName = new Map<string, string[]>();
  for (const w of idx) {
    const r = cfg.lists[w.id];
    if (!r?.on || !r.price) continue;
    for (const s of items.get(w.id) ?? []) byName.set(s, [...(byName.get(s) ?? []), w.name]);
  }
  const syms = [...byName.keys()].sort();
  if (!syms.length) {
    return `<div class="wa-empty muted">${L(
      'Turn on a list with “Price level” above and its tickers appear here.',
      'Bật một danh sách có “Mức giá” ở trên, các mã của nó sẽ hiện ở đây.')}</div>`;
  }
  return `<div class="wa-scroll"><table class="wa-table wa-levels">
    <thead><tr><th>${L('Ticker', 'Mã')}</th><th>${L('Alert when ≥', 'Báo khi ≥')}</th><th>${L('Alert when ≤', 'Báo khi ≤')}</th><th>${L('Market', 'Thị trường')}</th><th>${L('Lists', 'Danh sách')}</th></tr></thead>
    <tbody>${syms.map((s) => {
      const lv = cfg.levels[s] ?? {};
      const cur = quoteCurrencyOf(s) ?? '?';
      const mk = alertMarketOf(s);
      return `<tr data-sym="${esc(s)}">
        <td><b>${esc(s)}</b></td>
        <td><span class="wa-cell"><input class="field wa-lv" type="number" step="any" min="0" value="${fmtLevel(lv.above)}" data-lv="above" placeholder="—" /><span class="muted">${cur}</span></span></td>
        <td><span class="wa-cell"><input class="field wa-lv" type="number" step="any" min="0" value="${fmtLevel(lv.below)}" data-lv="below" placeholder="—" /><span class="muted">${cur}</span></span></td>
        <td class="muted">${mk ? esc(L(MARKET_NAME[mk]!.en, MARKET_NAME[mk]!.vi)) : L('not watched', 'không canh')}</td>
        <td class="muted">${esc(byName.get(s)!.join(', '))}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}

function wire(ctx: AppContext, fold: HTMLElement, body: HTMLElement): void {
  const save = async (redraw: boolean): Promise<void> => {
    if (!cfgCache) return;
    await saveAlertsConfig(ctx, cfgCache);
    const msg = body.querySelector<HTMLElement>('#wa-msg');
    if (msg) msg.textContent = isSyncEnabled() ? `✓ ${L('Saved — the VM picks it up within 5 minutes.', 'Đã lưu — VM nhận trong vòng 5 phút.')}` : `✓ ${L('Saved on this device.', 'Đã lưu trên thiết bị này.')}`;
    if (redraw) await paint(ctx, fold);
  };

  body.querySelector<HTMLInputElement>('#wa-on')?.addEventListener('change', (e) => {
    cfgCache!.on = (e.target as HTMLInputElement).checked;
    void save(true);
  });

  body.querySelectorAll<HTMLElement>('tr[data-list]').forEach((tr) => {
    const id = tr.dataset.list!;
    tr.querySelectorAll<HTMLInputElement>('input[data-f]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const r: ListRule = { ...(cfgCache!.lists[id] ?? DEFAULT_RULE) };
        const f = inp.dataset.f as keyof ListRule;
        if (inp.type === 'checkbox') (r[f] as boolean) = inp.checked;
        else {
          const n = Number(inp.value);
          if (!Number.isFinite(n) || n <= 0) return;
          (r[f] as number) = n;
        }
        cfgCache!.lists[id] = r;
        // Toggles change which inputs are live and which tickers need levels: redraw.
        void save(inp.type === 'checkbox');
      }),
    );
  });

  body.querySelectorAll<HTMLElement>('tr[data-sym]').forEach((tr) => {
    const sym = tr.dataset.sym!;
    tr.querySelectorAll<HTMLInputElement>('input[data-lv]').forEach((inp) =>
      inp.addEventListener('change', () => {
        const lv = { ...(cfgCache!.levels[sym] ?? {}) };
        const k = inp.dataset.lv as 'above' | 'below';
        const n = Number(inp.value);
        if (inp.value.trim() === '' || !Number.isFinite(n) || n <= 0) delete lv[k];
        else lv[k] = n;
        cfgCache!.levels[sym] = lv;
        void save(false);
      }),
    );
  });
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(getLang() === 'vi' ? 'vi-VN' : 'en-GB', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

async function paintSeen(body: HTMLElement): Promise<void> {
  const host = body.querySelector<HTMLElement>('#wa-seen');
  if (!host) return;
  if (!isSyncEnabled()) {
    host.innerHTML = `<span class="muted">${L('Needs sync.', 'Cần bật đồng bộ.')}</span>`;
    return;
  }
  const got = await readAlertsSeen();
  if (!host.isConnected) return;
  if (!got) {
    host.innerHTML = `<span class="muted">${L(
      'The VM has not answered yet. It reads the rules every 5 minutes once watchd is updated and restarted.',
      'VM chưa trả lời. Sau khi cập nhật và khởi động lại watchd, VM đọc quy tắc 5 phút một lần.')}</span>
      <button class="btn-outline mini-btn wa-guide" type="button">${L('How to set up the VM →', 'Cách cài trên VM →')}</button>`;
    host.querySelector('.wa-guide')?.addEventListener('click', () => openSettingsAt('scan-alerts'));
    return;
  }
  const s: AlertsSeen = got.value;
  const fired = (s.fired ?? []).slice(-12).reverse();
  host.innerHTML = `<div class="wa-seen-row">
      <span>🛰️ ${L('VM read the rules', 'VM đã đọc quy tắc')} <b>${esc(hhmm(s.at))}</b> · ${s.n} ${L('tickers', 'mã')}</span>
      <span>${(s.open ?? []).length ? `🟢 ${L('open now', 'đang mở')}: ${esc(s.open.join(', '))}` : `⚪ ${L('no market open', 'chưa có thị trường nào mở')}`}</span>
    </div>
    ${fired.length ? `<ul class="wa-fired">${fired.map((f) => `<li><b>${esc(f.sym)}</b> ${esc(L(KIND_WORD[f.kind]?.en ?? f.kind, KIND_WORD[f.kind]?.vi ?? f.kind))}${f.px != null ? ` · ${f.px}` : ''} <span class="muted">${esc(hhmm(f.ts))}</span></li>`).join('')}</ul>` : `<div class="muted">${L('Nothing sent today.', 'Hôm nay chưa gửi tin nào.')}</div>`}
    ${(s.warn ?? []).length ? `<ul class="wa-warn">${s.warn.map((w) => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}`;
}
