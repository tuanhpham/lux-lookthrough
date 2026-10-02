/**
 * Settings & Guides › Scanner › "Run on the VM": fixed buttons that queue one
 * whitelisted command for the scanner VM and show what came back.
 *
 * The path is a queue, never a socket: the button writes `scanner:commands`
 * (the server checks SCANNER_ADMIN and rebuilds the value from its whitelist),
 * the VM's main.py polls it every 20 s (remote.py in the scanner repo), and the
 * output lands on `scanner:command_results`, which only the VM writes. So there
 * is no free-text field here on purpose — adding one would not even work, the
 * server and the VM would both refuse it. COMMANDS must match both copies.
 */
import { getLang } from '../ui/i18n.js';
import { scannerCommand, scannerGet, scannerPing, type ScannerPing } from '../adapters/scannerClient.js';
import { isSyncEnabled } from '../adapters/syncClient.js';

const vi = (): boolean => getLang() === 'vi';
const L = (en: string, viText: string): string => (vi() ? viText : en);

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

type Cmd = 'status' | 'log' | 'push' | 'scan' | 'nightly' | 'dblock' | 'update' | 'restart';

interface CmdDef {
  cmd: Cmd;
  icon: string;
  en: string;
  vi: string;
  /** Asked before sending: these stop the live scanner for ~30 s. */
  ask?: { en: string; vi: string };
}

const COMMANDS: CmdDef[] = [
  { cmd: 'status', icon: '🩺', en: 'Status', vi: 'Trạng thái' },
  { cmd: 'push', icon: '⬆', en: 'Push data now', vi: 'Đẩy dữ liệu ngay' },
  { cmd: 'scan', icon: '🔎', en: 'Test scan (no Telegram)', vi: 'Quét thử (không gửi Telegram)' },
  { cmd: 'nightly', icon: '🌙', en: 'Last nightly run', vi: 'Lần chạy đêm gần nhất' },
  { cmd: 'dblock', icon: '🔒', en: 'Who holds the DB', vi: 'Ai đang giữ DB' },
  {
    cmd: 'update', icon: '⟳', en: 'Update code + restart', vi: 'Cập nhật code + khởi động lại',
    ask: {
      en: 'git pull on the VM, check the new code imports, then restart the scanner (~30 s without alerts). Continue?',
      vi: 'git pull trên VM, kiểm tra code mới import được, rồi khởi động lại scanner (~30 giây không có alert). Tiếp tục?',
    },
  },
  {
    cmd: 'restart', icon: '↻', en: 'Restart scanner', vi: 'Khởi động lại scanner',
    ask: {
      en: 'Restart the live scanner? It is back in ~30 s.',
      vi: 'Khởi động lại scanner đang chạy? Khoảng 30 giây sau là chạy lại.',
    },
  },
];

const LOGS: { id: string; label: string }[] = [
  { id: 'service', label: 'service.log' },
  { id: 'prep', label: 'prep.log' },
  { id: 'push', label: 'push.log' },
  { id: 'watchd', label: 'watchd.log' },
  { id: 'bot', label: 'bot.log' },
];

interface VmResult {
  id: string;
  cmd: string;
  arg?: string;
  state: 'running' | 'restarting' | 'done';
  ok: boolean | null;
  out: string;
  at: number;
}

const POLL_MS = 3000;
/** No pickup in this long = main.py is not polling. It polls every 20 s. */
const PICKUP_MS = 75_000;
/** push --all may take 5 min on the VM; a restart needs ~30 s plus a poll. */
const DONE_MS = 7 * 60_000;

/** One command in flight, kept outside the DOM so a re-render of the page keeps it. */
let view: { id: string; label: string; sent: number; phase: 'sent' | 'running' | 'restarting' | 'done' | 'lost' | 'error'; res?: VmResult; msg?: string } | null = null;
let ping: ScannerPing | null = null;
let pollTimer: number | null = null;

const labelOf = (cmd: string, arg?: string): string => {
  if (cmd === 'log') return `log · ${arg ?? ''}`;
  const d = COMMANDS.find((c) => c.cmd === cmd);
  return d ? L(d.en, d.vi) : cmd;
};

function stateHtml(): string {
  if (!isSyncEnabled()) {
    return `<span class="st-dot st-dot-off"></span>${L('Turn on sync (☁️) first: commands travel with your sync code.', 'Bật sync (☁️) trước: lệnh đi kèm mã sync của bạn.')}`;
  }
  if (!ping) return `<span class="st-dot st-dot-wait"></span>${L('Checking with the server…', 'Đang hỏi server…')}`;
  if (!ping.ok) return `<span class="st-dot st-dot-off"></span>${L('Server did not answer', 'Server không trả lời')}: ${esc(ping.error ?? '')}`;
  const you = ping.you ? `<code class="st-vm-you">${esc(ping.you)}</code>` : '';
  if (!ping.commands) {
    return `<span class="st-dot st-dot-off"></span>${L(
      `VM commands are off: the server has no SCANNER_ADMIN yet. Your id is ${you} — step 1 below.`,
      `Lệnh VM đang tắt: server chưa có SCANNER_ADMIN. Id của bạn là ${you} — xem bước 1 bên dưới.`,
    )}`;
  }
  if (!ping.admin) {
    return `<span class="st-dot st-dot-off"></span>${L(
      `This sync code (id ${you}) is not in SCANNER_ADMIN, so it cannot send commands.`,
      `Mã sync này (id ${you}) không có trong SCANNER_ADMIN nên không gửi lệnh được.`,
    )}`;
  }
  return `<span class="st-dot st-dot-on"></span>${L('Ready — the VM picks a command up within ~20 s.', 'Sẵn sàng — VM nhận lệnh trong khoảng 20 giây.')}`;
}

function outHtml(): string {
  if (!view) return '';
  const t = (ms: number): string => new Date(ms).toLocaleTimeString(vi() ? 'vi-VN' : 'en-GB');
  const phase = {
    sent: `⏳ ${L('Sent — waiting for the VM to pick it up…', 'Đã gửi — chờ VM nhận lệnh…')}`,
    running: `⚙ ${L('Running on the VM…', 'VM đang chạy…')}`,
    restarting: `↻ ${L('Restarting — waiting for the scanner to come back…', 'Đang khởi động lại — chờ scanner chạy lại…')}`,
    done: view.res?.ok ? `✅ ${L('Done', 'Xong')}` : `⚠ ${L('Finished with a problem', 'Xong nhưng có lỗi')}`,
    lost: `⚠ ${L(
      'The VM has not picked it up. Is the scanner service running? (A command expires after 5 minutes.)',
      'VM chưa nhận lệnh. Service scanner có đang chạy không? (Lệnh hết hạn sau 5 phút.)',
    )}`,
    error: `⚠ ${esc(view.msg ?? '')}`,
  }[view.phase];
  const busy = view.phase === 'sent' || view.phase === 'running' || view.phase === 'restarting';
  return `<div class="st-vm-out${busy ? ' busy' : ''}">
      <div class="st-vm-head"><b>${esc(view.label)}</b><span>${phase}</span><span class="muted">${t(view.res?.at ?? view.sent)}</span></div>
      ${view.res?.out ? `<pre>${esc(view.res.out)}</pre>` : ''}
    </div>`;
}

export function vmPanel(): string {
  const ready = !!(ping?.ok && ping.commands && ping.admin);
  const busy = !!view && (view.phase === 'sent' || view.phase === 'running' || view.phase === 'restarting');
  const dis = !ready || busy ? ' disabled' : '';
  const btn = (c: CmdDef, primary = false): string =>
    `<button class="${primary ? 'btn' : 'btn-outline'}" data-vm="${c.cmd}"${dis}>${c.icon} ${L(c.en, c.vi)}</button>`;
  return `<div class="st-panel st-vm">
      <div class="st-status" id="st-vm-state">${stateHtml()}</div>
      <div class="st-actions">
        ${COMMANDS.filter((c) => !c.ask).map((c, i) => btn(c, i === 0)).join('')}
        <span class="st-vm-log">
          <select id="st-vm-logname" aria-label="${L('Log file', 'File log')}"${dis}>${LOGS.map((l) => `<option value="${l.id}">${l.label}</option>`).join('')}</select>
          <button class="btn-outline" data-vm="log"${dis}>📄 ${L('Last 60 lines', 'Xem 60 dòng cuối')}</button>
        </span>
      </div>
      <div class="st-actions st-vm-danger">
        ${COMMANDS.filter((c) => c.ask).map((c) => btn(c)).join('')}
      </div>
      <div id="st-vm-out">${outHtml()}</div>
    </div>`;
}

function repaint(root: HTMLElement): void {
  const host = root.querySelector<HTMLElement>('.st-vm');
  if (!host) return;
  const logName = host.querySelector<HTMLSelectElement>('#st-vm-logname')?.value;
  host.outerHTML = vmPanel();
  const sel = root.querySelector<HTMLSelectElement>('#st-vm-logname');
  if (sel && logName) sel.value = logName;
  wireVm(root, false);
}

function stopPoll(): void {
  if (pollTimer != null) window.clearTimeout(pollTimer);
  pollTimer = null;
}

function poll(root: HTMLElement): void {
  stopPoll();
  if (!view || !document.body.contains(root)) return;
  pollTimer = window.setTimeout(async () => {
    if (!view) return;
    try {
      const got = await scannerGet<{ results?: VmResult[] }>('scanner:command_results');
      const res = got?.value?.results?.find((r) => r.id === view!.id);
      if (res) {
        view.res = res;
        view.phase = res.state;
      }
    } catch {
      /* a failed poll is retried on the next tick */
    }
    const age = Date.now() - view.sent;
    if (view.phase === 'sent' && age > PICKUP_MS) view.phase = 'lost';
    else if ((view.phase === 'running' || view.phase === 'restarting') && age > DONE_MS) {
      view.phase = 'error';
      view.msg = L('No result after 7 minutes — read service.log on the VM.', 'Sau 7 phút vẫn chưa có kết quả — đọc service.log trên VM.');
    }
    repaint(root);
    if (view.phase === 'sent' || view.phase === 'running' || view.phase === 'restarting') poll(root);
  }, POLL_MS);
}

async function send(root: HTMLElement, cmd: Cmd, arg = ''): Promise<void> {
  const def = COMMANDS.find((c) => c.cmd === cmd);
  if (def?.ask && !confirm(L(def.ask.en, def.ask.vi))) return;
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  view = { id, label: labelOf(cmd, arg), sent: Date.now(), phase: 'sent' };
  repaint(root);
  const r = await scannerCommand(id, cmd, arg);
  if (!r.ok) {
    view = { ...view, phase: 'error', msg: r.error ?? 'error' };
    repaint(root);
    return;
  }
  poll(root);
}

/** `first`: also ask the server who we are, and show the VM's last answer. */
export function wireVm(root: HTMLElement, first = true): void {
  const host = root.querySelector<HTMLElement>('.st-vm');
  if (!host) return;
  host.querySelectorAll<HTMLButtonElement>('[data-vm]').forEach((b) =>
    b.addEventListener('click', () => {
      const cmd = b.dataset.vm as Cmd;
      const arg = cmd === 'log' ? host.querySelector<HTMLSelectElement>('#st-vm-logname')?.value ?? 'service' : '';
      void send(root, cmd, arg);
    }),
  );
  if (!first) return;
  if (view && (view.phase === 'sent' || view.phase === 'running' || view.phase === 'restarting')) poll(root);
  if (!isSyncEnabled()) return;
  void (async () => {
    ping = await scannerPing();
    if (!view && ping.ok && ping.admin) {
      try {
        const got = await scannerGet<{ results?: VmResult[] }>('scanner:command_results');
        const last = got?.value?.results?.[0];
        if (last && !view) view = { id: last.id, label: labelOf(last.cmd, last.arg), sent: last.at, phase: last.state, res: last };
      } catch {
        /* nothing to show yet */
      }
    }
    repaint(root);
    // A command still running when the page was opened: keep following it (the timeouts count from its start).
    if (view && view.phase !== 'done' && view.phase !== 'lost' && view.phase !== 'error') poll(root);
  })();
}
