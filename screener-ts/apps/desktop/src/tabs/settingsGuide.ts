/**
 * The written half of Settings & Guides: every step, command and rule, as data.
 *
 * Kept apart from `settingsTab.ts` for the same reason `scannerGuide.ts` is kept apart
 * from the scanner tab: the facts change on their own schedule (a new cron line, a new
 * deploy rule), and finding them in a file that is only words beats finding them
 * between event handlers.
 *
 * ── RULES FOR EDITING ───────────────────────────────────────────────────────
 * · `cmd` is the command EXACTLY as typed and is never translated.
 * · No secret ever appears here: no sync code, no SCANNER_TOKEN, no API key, no VM
 *   address. Placeholders are written `<LIKE_THIS>`. A secret is typed into the
 *   prompt that asks for it (wrangler, the ☁ box), never into a page or a commit.
 * · The scanner facts are the same facts as `error.txt` VM-1..VM-7 and the runbook
 *   in scannerTab.ts (GUIDE). Nothing generates one from the other, so changing a
 *   command means changing it in all three.
 * · Prose uses backticks for literals; `settingsTab.ts` turns them into <code>.
 */
import type { Bi } from './scannerGuide.js';

/** Where a command runs. Drawn as a badge on the step, because the commonest mistake
 * in this whole guide is the right command in the wrong window. */
export type Where = 'pc' | 'vm' | 'crontab' | 'cf' | 'app';

export interface GuideStep {
  h: Bi;
  p?: Bi[];
  cmd?: string;
  where?: Where;
  /** Read BEFORE the command: drawn above it in the warning colour. */
  warn?: Bi;
}

export interface GuideSection {
  id: string;
  /** The TOC group this section sits under. */
  group: 'data' | 'web' | 'scanner' | 'safety';
  icon: string;
  title: Bi;
  lead: Bi;
  steps: GuideStep[];
  /** A closing note in a soft box. */
  tip?: Bi;
}

export const GROUPS: Record<GuideSection['group'], Bi> = {
  data: { en: 'Your data', vi: 'Dữ liệu của bạn' },
  web: { en: 'The website', vi: 'Trang web' },
  scanner: { en: 'Scanner (VM)', vi: 'Scanner (VM)' },
  safety: { en: 'Safety', vi: 'An toàn' },
};

export const WHERE: Record<Where, Bi> = {
  pc: { en: 'Your computer · terminal', vi: 'Máy tính · terminal' },
  vm: { en: 'On the VM · SSH', vi: 'Trên VM · SSH' },
  crontab: { en: 'Crontab content · paste into the editor', vi: 'Nội dung crontab · dán vào trình soạn' },
  cf: { en: 'Your computer · wrangler', vi: 'Máy tính · wrangler' },
  app: { en: 'In this app', vi: 'Trong app này' },
};

/**
 * The sections that have a live panel in front of their steps (`data`, `restore`) are
 * listed here too, so the TOC, the order and the anchors all come from one array; the
 * tab draws the panel above the steps when it has one.
 */
export const SECTIONS: readonly GuideSection[] = [
  {
    id: 'data',
    group: 'data',
    icon: '☁️',
    title: { en: 'Data & sync', vi: 'Dữ liệu & đồng bộ' },
    lead: {
      en: 'Everything you enter lives on this device AND on the server under your sync code, so every device with the same code sees the same data. The server also keeps every version it replaced, which is what makes the restore below possible.',
      vi: 'Mọi thứ bạn nhập nằm trên thiết bị này VÀ trên server theo mã đồng bộ, nên mọi thiết bị cùng mã thấy cùng dữ liệu. Server còn giữ lại mọi phiên bản đã bị thay thế — nhờ vậy mới khôi phục được như mục dưới.',
    },
    steps: [
      {
        h: { en: 'Keep a backup file now and then', vi: 'Thỉnh thoảng giữ một file sao lưu' },
        p: [
          {
            en: '<b>Export backup</b> downloads every key on this device into one JSON file. It works without sync and is the one copy nobody else can overwrite. Once a week, or before anything risky, is plenty.',
            vi: '<b>Xuất sao lưu</b> tải mọi dữ liệu trên thiết bị này về một file JSON. Không cần đồng bộ vẫn chạy, và đây là bản duy nhất không ai ghi đè được. Mỗi tuần một lần, hoặc trước khi làm gì rủi ro, là đủ.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'One key, one version', vi: 'Một mục, một phiên bản' },
        p: [
          {
            en: '<b>🕘 Browse versions</b> (in the ☁️ box) lists every overwritten or deleted value, newest first, and restores ONE of them. Use it when you know which thing broke — e.g. only the Portfolio. For "everything as it was at 9 pm yesterday", use the next section.',
            vi: '<b>🕘 Xem các phiên bản</b> (trong hộp ☁️) liệt kê mọi giá trị đã bị ghi đè hoặc xoá, mới nhất trước, và khôi phục MỘT giá trị. Dùng khi bạn biết đúng cái gì hỏng — vd chỉ Portfolio. Muốn "mọi thứ như lúc 9 giờ tối qua" thì dùng mục tiếp theo.',
          },
        ],
        where: 'app',
      },
    ],
  },
  {
    id: 'restore',
    group: 'data',
    icon: '⏪',
    title: { en: 'Restore to a point in time', vi: 'Khôi phục về một thời điểm' },
    lead: {
      en: 'Puts every key back to the value it had at the moment you choose, in one go, from inside the app. Nothing is deleted: things created after that moment stay. The values it replaces are archived first, so a restore can itself be undone by restoring to a moment just before it.',
      vi: 'Đưa mọi mục về đúng giá trị tại thời điểm bạn chọn, một lần, ngay trong app. Không xoá gì: những thứ tạo sau thời điểm đó vẫn giữ. Các giá trị bị thay được lưu lại trước, nên chính lần khôi phục cũng hoàn tác được — bằng cách khôi phục về một thời điểm ngay trước nó.',
    },
    steps: [
      {
        h: { en: 'Close the app on every OTHER device', vi: 'Đóng app trên mọi thiết bị KHÁC' },
        p: [
          {
            en: 'A device that is still open holds the old data in memory, and its next edit would write it back. Close those tabs (or just leave them closed until step 6).',
            vi: 'Thiết bị còn mở đang giữ dữ liệu cũ trong bộ nhớ, và lần sửa tiếp theo của nó sẽ ghi đè lại. Đóng các tab đó (hoặc để yên đến bước 6).',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Export a backup of this device', vi: 'Xuất sao lưu thiết bị này' },
        p: [{ en: 'The button above. Belt and braces: the restore is undoable anyway.', vi: 'Nút ở trên. Chắc ăn thêm một lớp: dù sao khôi phục cũng hoàn tác được.' }],
        where: 'app',
      },
      {
        h: { en: 'Choose the moment', vi: 'Chọn thời điểm' },
        p: [
          {
            en: 'Type a date and time in YOUR local time, or click one of the recent changes: each quick pick is one minute before a big overwrite of Portfolio or Financial Status — usually exactly the moment you want.',
            vi: 'Nhập ngày giờ theo giờ ĐỊA PHƯƠNG của bạn, hoặc bấm một thay đổi gần đây: mỗi lựa chọn nhanh là một phút trước một lần ghi đè lớn của Portfolio hoặc Financial Status — thường đúng là thời điểm bạn cần.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Preview — nothing changes yet', vi: 'Xem trước — chưa thay đổi gì' },
        p: [
          {
            en: 'The list shows every key that differs from that moment, with its size then and now. A size that dropped a lot (red) is usually the loss. Untick anything you want to keep as it is now.',
            vi: 'Danh sách hiện mọi mục khác với thời điểm đó, kèm kích thước lúc ấy và bây giờ. Kích thước tụt mạnh (màu đỏ) thường chính là chỗ mất dữ liệu. Bỏ tick những mục bạn muốn giữ như hiện tại.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Restore', vi: 'Khôi phục' },
        p: [
          {
            en: 'The page reloads with the restored data. The message tells you the exact moment to pick if you want to undo.',
            vi: 'Trang tải lại với dữ liệu đã khôi phục. Thông báo ghi rõ thời điểm cần chọn nếu muốn hoàn tác.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Open the other devices again', vi: 'Mở lại các thiết bị khác' },
        p: [
          {
            en: 'They download the restored values when they open (and again whenever the app comes back to the foreground).',
            vi: 'Chúng tự tải các giá trị đã khôi phục khi mở (và mỗi lần app quay lại màn hình).',
          },
        ],
        where: 'app',
      },
    ],
    tip: {
      en: 'Needs the server from 1 Oct 2026 or later. If the preview says the server does not have restore-at yet, deploy the latest build (see Deploy) — or use 🕘 Browse versions, which works on every build.',
      vi: 'Cần server từ bản 1/10/2026 trở đi. Nếu xem trước báo server chưa có restore-at, hãy deploy bản mới nhất (xem mục Deploy) — hoặc dùng 🕘 Xem các phiên bản, chạy được trên mọi bản.',
    },
  },
  {
    id: 'why',
    group: 'data',
    icon: '🧭',
    title: { en: 'Why data went missing — and how to avoid it', vi: 'Vì sao dữ liệu bị mất — và cách tránh' },
    lead: {
      en: 'Sync is last-write-wins per key, and Portfolio and Financial Status are each ONE key. Until 1 Oct 2026 a device only downloaded at start-up, so a tab left open for a day still held yesterday’s data, and the first edit there wrote all of it back over the other device’s changes.',
      vi: 'Đồng bộ là "ghi sau thắng" theo từng mục, và Portfolio, Financial Status mỗi cái là MỘT mục. Trước 1/10/2026, thiết bị chỉ tải về lúc khởi động, nên một tab để mở cả ngày vẫn giữ dữ liệu hôm qua, và lần sửa đầu tiên ở đó ghi đè hết lên thay đổi của thiết bị kia.',
    },
    steps: [
      {
        h: { en: 'Fixed: the app re-downloads when it comes back', vi: 'Đã sửa: app tải lại khi được mở lại' },
        p: [
          {
            en: 'Whenever the tab or the app returns to the foreground (at most once a minute), it pulls first, and Portfolio drops its in-memory copy. The lost versions were never gone — the server archived them — so they are restorable above.',
            vi: 'Mỗi khi tab hoặc app quay lại màn hình (tối đa mỗi phút một lần), nó tải về trước, và Portfolio bỏ bản giữ trong bộ nhớ. Các phiên bản bị mất chưa bao giờ biến mất — server đã lưu lại — nên vẫn khôi phục được ở mục trên.',
          },
        ],
      },
      {
        h: { en: 'Habits that still help', vi: 'Thói quen vẫn nên giữ' },
        p: [
          {
            en: '· Edit on one device at a time; if both are open, reload the one you are about to edit.<br>· Watch the sync pill in the top bar: red means this device is NOT syncing, and anything you change there stays local.<br>· Never clear site data / browser storage on a device without exporting first.<br>· Update every device to the latest build (reload once after a deploy).',
            vi: '· Sửa trên một thiết bị một lúc; nếu cả hai đang mở, tải lại trang trên thiết bị sắp sửa.<br>· Để ý nút trạng thái đồng bộ trên thanh trên: đỏ là thiết bị này KHÔNG đồng bộ, sửa gì ở đó chỉ nằm trên máy.<br>· Đừng bao giờ xoá dữ liệu trang / bộ nhớ trình duyệt khi chưa xuất sao lưu.<br>· Cập nhật mọi thiết bị lên bản mới nhất (tải lại một lần sau mỗi lần deploy).',
          },
        ],
      },
    ],
  },
  {
    id: 'timetravel',
    group: 'data',
    icon: '🛟',
    title: { en: 'Last resort: Cloudflare D1 Time Travel', vi: 'Cách cuối: Cloudflare D1 Time Travel' },
    lead: {
      en: 'Rewinds the WHOLE database (every user, every key) to a minute of your choice, up to 30 days back. Use it only when the in-app restore cannot help — e.g. the version history itself is missing. Run from a computer with the repo; all steps until 6 are read-only.',
      vi: 'Tua lại TOÀN BỘ cơ sở dữ liệu (mọi người dùng, mọi mục) về một phút bạn chọn, tối đa 30 ngày. Chỉ dùng khi khôi phục trong app không giúp được — vd chính lịch sử phiên bản bị thiếu. Chạy trên máy tính có repo; mọi bước trước bước 6 chỉ đọc.',
    },
    steps: [
      {
        h: { en: 'Sign in to Cloudflare', vi: 'Đăng nhập Cloudflare' },
        p: [{ en: 'Opens a browser to approve. Always from `apps/desktop`.', vi: 'Mở trình duyệt để xác nhận. Luôn chạy trong `apps/desktop`.' }],
        cmd: 'cd lux-lookthrough/screener-ts/apps/desktop\nnpx wrangler login',
        where: 'cf',
      },
      {
        h: { en: 'Find the moment of the loss', vi: 'Tìm thời điểm mất dữ liệu' },
        p: [
          {
            en: 'Lists the last 20 overwrites of Portfolio and Financial Status. The loss is the newest row with a LARGE `bytes`, directly above small ones. Its `overwritten_ms` is the moment.',
            vi: 'Liệt kê 20 lần ghi đè gần nhất của Portfolio và Financial Status. Chỗ mất là dòng mới nhất có `bytes` LỚN, ngay trên các dòng nhỏ. `overwritten_ms` của nó là thời điểm.',
          },
        ],
        cmd:
          'npx wrangler d1 execute screener-sync --remote --json --command \\\n'
          + '  "SELECT key, datetime(archived_at/1000,\'unixepoch\') AS overwritten_utc,\n'
          + '          archived_at AS overwritten_ms, length(value) AS bytes\n'
          + '   FROM kv_history WHERE key IN (\'accounts\',\'wealth\')\n'
          + '   ORDER BY archived_at DESC LIMIT 20"',
        where: 'cf',
      },
      {
        h: { en: 'Turn it into a timestamp one minute earlier', vi: 'Đổi thành mốc thời gian sớm hơn một phút' },
        p: [
          {
            en: 'Replace `<MS>` with the number from step 2. The output is UTC with a `Z` — what wrangler wants. A clock time you remember is local: Luxembourg is UTC+2 until 25 Oct 2026, then UTC+1.',
            vi: 'Thay `<MS>` bằng số ở bước 2. Kết quả là giờ UTC có `Z` — đúng thứ wrangler cần. Giờ bạn nhớ là giờ địa phương: Luxembourg là UTC+2 đến 25/10/2026, sau đó UTC+1.',
          },
        ],
        cmd: 'MS=<MS>\ndate -u -d @$(( MS/1000 - 60 )) +%Y-%m-%dT%H:%M:%SZ',
        where: 'pc',
      },
      {
        h: { en: 'Check the bookmark exists', vi: 'Kiểm tra mốc tồn tại' },
        cmd: 'npx wrangler d1 time-travel info screener-sync --timestamp <TIMESTAMP>Z\nbash scripts/probe-timestamp.sh <TIMESTAMP>Z',
        where: 'cf',
      },
      {
        h: { en: 'Dump the current database first', vi: 'Xuất toàn bộ cơ sở dữ liệu hiện tại trước' },
        p: [{ en: 'Your way back if the restore picks the wrong minute.', vi: 'Đường lui nếu khôi phục nhầm phút.' }],
        cmd: 'npx wrangler d1 export screener-sync --remote --output ./kv-before-restore.sql',
        where: 'cf',
      },
      {
        h: { en: 'Restore', vi: 'Khôi phục' },
        warn: {
          en: 'This rewinds every user and every key. Close the app on all devices first, and open them again only afterwards.',
          vi: 'Lệnh này tua lại mọi người dùng và mọi mục. Đóng app trên mọi thiết bị trước, chỉ mở lại sau khi xong.',
        },
        cmd: 'npx wrangler d1 time-travel restore screener-sync --timestamp <TIMESTAMP>Z',
        where: 'cf',
      },
      {
        h: { en: 'Verify', vi: 'Kiểm tra lại' },
        p: [{ en: 'Should print the real size, and keep printing it after a device opens.', vi: 'Phải in ra kích thước thật, và vẫn giữ nguyên sau khi một thiết bị mở app.' }],
        cmd: 'npx wrangler d1 execute screener-sync --remote \\\n  --command "SELECT key, length(value) AS bytes FROM kv WHERE key IN (\'accounts\',\'wealth\')"',
        where: 'cf',
      },
    ],
    tip: {
      en: 'The full write-up, with the reasoning behind each step, is `apps/desktop/RECOVERY.md`.',
      vi: 'Bản đầy đủ, có lý do cho từng bước, là `apps/desktop/RECOVERY.md`.',
    },
  },
  {
    id: 'local',
    group: 'web',
    icon: '💻',
    title: { en: 'Run it on your computer', vi: 'Chạy trên máy tính' },
    lead: {
      en: 'For trying a change before it goes live. The local app talks to the REAL sync server, so it shows your real data — and what you change there is real too.',
      vi: 'Để thử một thay đổi trước khi đưa lên. App chạy local nói chuyện với server đồng bộ THẬT, nên nó hiện dữ liệu thật của bạn — và sửa gì ở đó cũng là thật.',
    },
    steps: [
      {
        h: { en: 'Check the tools', vi: 'Kiểm tra công cụ' },
        p: [{ en: 'Node.js 20 or newer, and Git. On Windows use Git Bash for every command on this page.', vi: 'Node.js 20 trở lên, và Git. Trên Windows dùng Git Bash cho mọi lệnh trong trang này.' }],
        cmd: 'node -v\ngit --version',
        where: 'pc',
      },
      {
        h: { en: 'Get the code', vi: 'Lấy mã nguồn' },
        cmd: 'git clone https://github.com/tuanhpham/lux-lookthrough.git\ncd lux-lookthrough/screener-ts',
        where: 'pc',
      },
      {
        h: { en: 'Install exactly what the lock file says', vi: 'Cài đúng theo file lock' },
        p: [
          {
            en: '`npm ci`, not `npm install`: it is what Cloudflare runs, so if it works here it works there. Do not add packages — a changed `package-lock.json` breaks the Cloudflare build.',
            vi: '`npm ci`, không phải `npm install`: đó là lệnh Cloudflare chạy, chạy được ở đây là chạy được ở đó. Đừng thêm package — `package-lock.json` thay đổi là bản build trên Cloudflare hỏng.',
          },
        ],
        cmd: 'npm ci',
        where: 'pc',
      },
      {
        h: { en: 'Start it', vi: 'Khởi động' },
        p: [
          {
            en: 'Then open http://localhost:1420. On a company network that inspects TLS, sync fails with a false "invalid code" — start it with `SYNC_INSECURE=1` in front instead.',
            vi: 'Rồi mở http://localhost:1420. Trên mạng công ty có kiểm tra TLS, đồng bộ báo sai "mã không hợp lệ" — khi đó chạy với `SYNC_INSECURE=1` phía trước.',
          },
        ],
        cmd: 'npm run dev:desktop',
        where: 'pc',
      },
      {
        h: { en: 'Test and build before you ship', vi: 'Test và build trước khi đưa lên' },
        p: [{ en: 'All three must pass. The build lands in `apps/desktop/dist`.', vi: 'Cả ba phải qua. Bản build nằm ở `apps/desktop/dist`.' }],
        cmd: 'npm run test:core\nnpm test --workspace @screener/desktop\nnpm run build',
        where: 'pc',
      },
      {
        h: { en: 'Later: bring it up to date', vi: 'Lần sau: cập nhật' },
        cmd: 'git pull\nnpm ci',
        where: 'pc',
      },
    ],
  },
  {
    id: 'deploy',
    group: 'web',
    icon: '🚀',
    title: { en: 'Deploy to Cloudflare Pages', vi: 'Deploy lên Cloudflare Pages' },
    lead: {
      en: 'The site is the Pages project `the-professional`, with the sync database `screener-sync` (D1). A deploy ships both the page and the server functions — the sync server included.',
      vi: 'Trang web là Pages project `the-professional`, với cơ sở dữ liệu đồng bộ `screener-sync` (D1). Một lần deploy đưa lên cả trang lẫn các hàm server — kể cả server đồng bộ.',
    },
    steps: [
      {
        h: { en: 'Build from the repo root', vi: 'Build từ thư mục gốc repo' },
        cmd: 'cd lux-lookthrough/screener-ts\nnpm run build',
        where: 'pc',
      },
      {
        h: { en: 'Deploy from apps/desktop — never from the root', vi: 'Deploy từ apps/desktop — không bao giờ từ thư mục gốc' },
        warn: {
          en: 'Deployed from anywhere else, the site goes up WITHOUT its server functions: no prices, no sync, and the scanner push answers 404.',
          vi: 'Deploy từ chỗ khác, trang lên mà KHÔNG có các hàm server: không giá, không đồng bộ, và scanner push trả 404.',
        },
        cmd: 'cd apps/desktop\nnpx wrangler login\nnpx wrangler pages deploy dist --project-name the-professional',
        where: 'cf',
      },
      {
        h: { en: 'After a schema change only: update the database', vi: 'Chỉ khi đổi schema: cập nhật cơ sở dữ liệu' },
        p: [{ en: 'Safe to repeat: every table is `CREATE TABLE IF NOT EXISTS`, so existing data is untouched.', vi: 'Chạy lại nhiều lần cũng an toàn: mọi bảng là `CREATE TABLE IF NOT EXISTS`, dữ liệu cũ không bị đụng.' }],
        cmd: 'npx wrangler d1 execute screener-sync --remote --file=./schema.sql',
        where: 'cf',
      },
      {
        h: { en: 'Secrets: typed into wrangler, never into a file', vi: 'Secret: gõ vào wrangler, không bao giờ vào file' },
        p: [
          {
            en: 'Each command asks for the value and stores it in Cloudflare. `SCANNER_TOKEN` must equal the one in the VM’s `.env`. Redeploy afterwards so the functions see it.',
            vi: 'Mỗi lệnh hỏi giá trị và lưu vào Cloudflare. `SCANNER_TOKEN` phải trùng với trong `.env` của VM. Deploy lại sau đó để các hàm thấy giá trị mới.',
          },
        ],
        cmd: 'npx wrangler pages secret put SCANNER_TOKEN --project-name the-professional\nnpx wrangler pages secret put FINNHUB_API_KEY --project-name the-professional',
        where: 'cf',
      },
      {
        h: { en: 'Check it is live', vi: 'Kiểm tra đã lên' },
        p: [
          {
            en: 'Open the site, reload once (the app picks up the new build), and look at the ☁️ pill: green. On the VM, `python push.py --ping` should answer 200.',
            vi: 'Mở trang, tải lại một lần (app nhận bản mới), xem nút ☁️: màu xanh. Trên VM, `python push.py --ping` phải trả 200.',
          },
        ],
        where: 'app',
      },
    ],
  },
  {
    id: 'scan-connect',
    group: 'scanner',
    icon: '🔌',
    title: { en: 'Connect & update the scanner', vi: 'Kết nối & cập nhật scanner' },
    lead: {
      en: 'The scanner runs on an Oracle VM as user `ubuntu`, in `~/scanner`, with its own Python in `.venv`. Its secrets are in `~/scanner/.env` (TG_TOKEN, TG_CHAT_ID, ALPACA_KEY, ALPACA_SECRET, SEC_UA, and for the push SCANNER_PUSH_URL, SCANNER_TOKEN).',
      vi: 'Scanner chạy trên Oracle VM với user `ubuntu`, trong `~/scanner`, Python riêng ở `.venv`. Secret nằm trong `~/scanner/.env` (TG_TOKEN, TG_CHAT_ID, ALPACA_KEY, ALPACA_SECRET, SEC_UA, và cho push là SCANNER_PUSH_URL, SCANNER_TOKEN).',
    },
    steps: [
      {
        h: { en: 'Open an SSH session', vi: 'Mở phiên SSH' },
        p: [{ en: 'Replace `<VM_IP>` with the VM’s public address. The key file stays on your computer.', vi: 'Thay `<VM_IP>` bằng địa chỉ public của VM. File key nằm trên máy tính của bạn.' }],
        cmd: 'ssh -i ~/.ssh/oracle_scanner ubuntu@<VM_IP>',
        where: 'pc',
      },
      {
        h: { en: 'Pull the new code and restart', vi: 'Kéo mã mới và khởi động lại' },
        p: [
          {
            en: 'The `python -c` line imports the modules first: if it errors, do NOT restart — the running scanner keeps working while you fix it.',
            vi: 'Dòng `python -c` import thử các module trước: nếu báo lỗi, ĐỪNG khởi động lại — scanner đang chạy vẫn hoạt động trong lúc bạn sửa.',
          },
        ],
        cmd:
          'cd ~/scanner\ngit pull\nsource .venv/bin/activate\npip install -r requirements.txt\n'
          + 'python -c "import main, render, scorer, callbacks"\nsudo systemctl restart scanner\nsudo systemctl restart watchd',
        where: 'vm',
      },
      {
        h: { en: 'Confirm it came back', vi: 'Xác nhận đã chạy lại' },
        p: [
          {
            en: 'The log must show `callbacks: bat dau lang nghe nut bam`. `active` + a sane disk and memory means healthy.',
            vi: 'Log phải có dòng `callbacks: bat dau lang nghe nut bam`. `active` + ổ đĩa và bộ nhớ bình thường là khoẻ.',
          },
        ],
        cmd: 'tail -20 ~/scanner/state/service.log\nsystemctl is-active scanner && uptime\ndf -h / && free -h',
        where: 'vm',
      },
    ],
  },
  {
    id: 'scan-service',
    group: 'scanner',
    icon: '🩺',
    title: { en: 'Service & logs', vi: 'Dịch vụ & log' },
    lead: {
      en: 'The live scanner is the systemd service `scanner`. Every log is under `~/scanner/state/`: service.log (live), prep.log (nightly + weekly), push.log (to the website), watchd.log (watchdog).',
      vi: 'Scanner chạy trực tiếp là dịch vụ systemd `scanner`. Mọi log nằm trong `~/scanner/state/`: service.log (trực tiếp), prep.log (hằng đêm + hằng tuần), push.log (lên trang web), watchd.log (watchdog).',
    },
    steps: [
      {
        h: { en: 'Status, restart, stop, start', vi: 'Trạng thái, khởi động lại, dừng, chạy' },
        cmd: 'sudo systemctl status scanner\nsudo systemctl restart scanner\nsudo systemctl stop scanner\nsudo systemctl start scanner',
        where: 'vm',
      },
      {
        h: { en: 'Read the logs', vi: 'Đọc log' },
        p: [{ en: '`Ctrl+C` leaves `tail -f`.', vi: '`Ctrl+C` để thoát `tail -f`.' }],
        cmd: 'journalctl -u scanner -n 50\ntail -f ~/scanner/state/service.log\ntail -50 ~/scanner/state/prep.log\ntail -50 ~/scanner/state/push.log',
        where: 'vm',
      },
      {
        h: { en: 'Re-run last night by hand', vi: 'Chạy lại đêm qua bằng tay' },
        p: [
          {
            en: 'Self-contained: it activates the venv itself, so it works in a fresh SSH window. The Scanner page’s runbook explains every stage and what to do when one fails.',
            vi: 'Tự đủ: tự kích hoạt venv, nên chạy được trong cửa sổ SSH mới. Phần hướng dẫn trên trang Scanner giải thích từng bước và cách xử lý khi một bước hỏng.',
          },
        ],
        cmd: 'cd ~/scanner && source .venv/bin/activate && git pull && python nightly.py',
        where: 'vm',
      },
    ],
  },
  {
    id: 'scan-cron',
    group: 'scanner',
    icon: '⏰',
    title: { en: 'The schedule (crontab)', vi: 'Lịch chạy (crontab)' },
    lead: {
      en: 'Every scheduled job, in New York time. Edit it as `ubuntu` with `crontab -e` — NOT `sudo crontab -e`, which is root’s, a different file.',
      vi: 'Mọi việc chạy theo lịch, theo giờ New York. Sửa bằng user `ubuntu` với `crontab -e` — KHÔNG phải `sudo crontab -e` (đó là của root, một file khác).',
    },
    steps: [
      {
        h: { en: 'Open the editor', vi: 'Mở trình soạn' },
        cmd: 'crontab -e',
        where: 'vm',
      },
      {
        h: { en: 'The lines that should be there', vi: 'Các dòng cần có' },
        warn: {
          en: 'These are crontab CONTENT. Pasted into the shell instead of the editor, bash answers `0: command not found` — nothing is broken, it was just the wrong window.',
          vi: 'Đây là NỘI DUNG crontab. Dán vào shell thay vì trình soạn, bash báo `0: command not found` — không hỏng gì cả, chỉ là dán nhầm cửa sổ.',
        },
        cmd:
          'CRON_TZ=America/New_York\n'
          + '30 6 * * 6    cd /home/ubuntu/scanner && .venv/bin/python prep.py >> state/prep.log 2>&1\n'
          + '0 8 * * 1-5   cd /home/ubuntu/scanner && .venv/bin/python nightly.py >> state/prep.log 2>&1\n'
          + '0 9 * * 1-5   cd /home/ubuntu/scanner && .venv/bin/python scripts/mark_etf.py >> state/prep.log 2>&1\n'
          + '5 9 * * 1-5   /usr/bin/systemctl restart scanner\n'
          + '30 8 * * 1-5  cd /home/ubuntu/scanner && .venv/bin/python push.py --all >> state/push.log 2>&1\n'
          + '* 4-20 * * 1-5  cd /home/ubuntu/scanner && .venv/bin/python push.py --status >> state/push.log 2>&1',
        where: 'crontab',
      },
      {
        h: { en: 'Check what is installed and that it fires', vi: 'Kiểm tra đã cài gì và có chạy không' },
        cmd: 'crontab -l\ngrep CRON /var/log/syslog | tail',
        where: 'vm',
      },
    ],
    tip: {
      en: 'Cron OR a systemd timer for the nightly run — never both, or it runs twice and the two fight over the database lock. Keep the 09:05 restart: it gives the live scanner a fresh day.',
      vi: 'Cron HOẶC systemd timer cho lần chạy hằng đêm — không bao giờ cả hai, nếu không nó chạy hai lần và tranh nhau khoá cơ sở dữ liệu. Giữ lần khởi động lại 09:05: nó cho scanner một ngày mới sạch sẽ.',
    },
  },
  {
    id: 'scan-trouble',
    group: 'scanner',
    icon: '🧯',
    title: { en: 'When something is wrong', vi: 'Khi có gì đó sai' },
    lead: {
      en: 'The four problems that actually happen, each with its check and its fix.',
      vi: 'Bốn sự cố thực sự hay gặp, mỗi cái có cách kiểm tra và cách sửa.',
    },
    steps: [
      {
        h: { en: 'Telegram says 409 Conflict', vi: 'Telegram báo 409 Conflict' },
        p: [
          {
            en: 'Two copies of `main.py` are polling Telegram. Only ONE may ever run. Find the strays, kill them by PID, and restart the service — never start a second one by hand.',
            vi: 'Có hai bản `main.py` cùng hỏi Telegram. Chỉ được chạy MỘT bản. Tìm bản thừa, kill theo PID, rồi khởi động lại dịch vụ — không bao giờ tự chạy thêm một bản.',
          },
        ],
        cmd: 'ps aux | grep -v grep | grep main.py\nkill <PID>\nsudo systemctl restart scanner',
        where: 'vm',
      },
      {
        h: { en: 'The Scanner page shows old data', vi: 'Trang Scanner hiện dữ liệu cũ' },
        p: [
          {
            en: '`--ping` tells you which side is wrong: 200 = fine, 401 = SCANNER_TOKEN differs between `.env` and Cloudflare, 404 = the site was deployed from the wrong folder, 403 = an old push.py (git pull), 503 = the database. Then push by hand (`--dry` first shows what would be sent).',
            vi: '`--ping` cho biết bên nào sai: 200 = ổn, 401 = SCANNER_TOKEN giữa `.env` và Cloudflare khác nhau, 404 = trang deploy sai thư mục, 403 = push.py cũ (git pull), 503 = cơ sở dữ liệu. Sau đó push bằng tay (`--dry` trước để xem sẽ gửi gì).',
          },
        ],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython push.py --ping\npython push.py --all --dry\npython push.py --all\ntail -30 state/push.log',
        where: 'vm',
      },
      {
        h: { en: '"database is locked"', vi: '"database is locked"' },
        p: [{ en: 'Shows who holds the lock and whether it is safe to go on.', vi: 'Cho biết ai đang giữ khoá và có an toàn để tiếp tục không.' }],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython scripts/db_lock.py',
        where: 'vm',
      },
      {
        h: { en: 'The nightly run failed', vi: 'Lần chạy hằng đêm bị lỗi' },
        p: [
          {
            en: 'See which stage, then re-run it. `--dry-run` shows the plan without doing anything. Only the analysis stages, without downloading again: `--only regime,sectors,structure,setups`.',
            vi: 'Xem bước nào hỏng rồi chạy lại. `--dry-run` hiện kế hoạch mà không làm gì. Chỉ chạy lại phần phân tích, không tải lại dữ liệu: `--only regime,sectors,structure,setups`.',
          },
        ],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython nightly.py --status\npython nightly.py --dry-run\npython nightly.py --only regime,sectors,structure,setups',
        where: 'vm',
      },
    ],
  },
  {
    id: 'scan-config',
    group: 'scanner',
    icon: '🎛️',
    title: { en: 'Scanner settings', vi: 'Cài đặt scanner' },
    lead: {
      en: 'Every threshold is Python in the scanner repo — there is no settings screen on the VM. Change it in the repo, commit, then `git pull` + restart on the VM (Connect & update).',
      vi: 'Mọi ngưỡng là code Python trong repo scanner — không có màn hình cài đặt trên VM. Sửa trong repo, commit, rồi `git pull` + khởi động lại trên VM (mục Kết nối & cập nhật).',
    },
    steps: [
      {
        h: { en: 'Where each setting lives', vi: 'Mỗi cài đặt nằm ở đâu' },
        p: [
          {
            en: '· `main.py` — live alerts: `ALERT_SCORE`, `COOLDOWN`, `MAX_ALERTS`.<br>· `scorer.py` — the live score: `MIN_RVOL` and friends.<br>· `config.py` — swing thresholds, `BENCH`, `SECTOR_ETFS`, `REGIME`.<br>· `setups.py` — the BO / RV setup rules. If `MAX_AGE` changes there, change `MAX_AGE_DAYS` in this app’s scannerTab.ts too.',
            vi: '· `main.py` — cảnh báo trực tiếp: `ALERT_SCORE`, `COOLDOWN`, `MAX_ALERTS`.<br>· `scorer.py` — điểm trực tiếp: `MIN_RVOL` và các ngưỡng liên quan.<br>· `config.py` — ngưỡng swing, `BENCH`, `SECTOR_ETFS`, `REGIME`.<br>· `setups.py` — quy tắc setup BO / RV. Nếu đổi `MAX_AGE` ở đó, đổi cả `MAX_AGE_DAYS` trong scannerTab.ts của app này.',
          },
        ],
      },
      {
        h: { en: 'See what is in force', vi: 'Xem cài đặt đang chạy' },
        p: [{ en: 'The Scanner page shows the same values under “Thresholds”, as the VM last pushed them.', vi: 'Trang Scanner hiện đúng các giá trị này ở mục “Ngưỡng”, theo lần VM đẩy gần nhất.' }],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython regime.py --config\npython sectors.py --config',
        where: 'vm',
      },
    ],
  },
  {
    id: 'rules',
    group: 'safety',
    icon: '🛡️',
    title: { en: 'Rules that are never broken', vi: 'Nguyên tắc không bao giờ phá' },
    lead: {
      en: 'Each one was learned by breaking something.',
      vi: 'Mỗi điều đều được rút ra từ một lần làm hỏng.',
    },
    steps: [
      {
        h: { en: 'Secrets', vi: 'Secret' },
        p: [
          {
            en: '· The sync code is typed only into the ☁️ box. `SCANNER_TOKEN` never comes down to the browser and is never typed into this app.<br>· Nothing from `.env` goes into a commit, a chat, or a screenshot.',
            vi: '· Mã đồng bộ chỉ gõ vào ô ☁️. `SCANNER_TOKEN` không bao giờ xuống trình duyệt và không bao giờ gõ vào app này.<br>· Không có gì trong `.env` được vào commit, chat hay ảnh chụp màn hình.',
          },
        ],
      },
      {
        h: { en: 'The VM', vi: 'VM' },
        p: [
          {
            en: '· Only ONE `main.py` at a time (Telegram 409).<br>· Never touch the VM firewall — `sudo ufw enable` can lock you out of SSH for good.<br>· `crontab -e` as `ubuntu`, never `sudo crontab -e`.<br>· Back the database up with sqlite `.backup`, never `cp` (a copy taken mid-write is corrupt).<br>· Do not run `nightly.py` before `bars.py --sync --full` has filled the candle store.',
            vi: '· Chỉ MỘT `main.py` cùng lúc (Telegram 409).<br>· Không bao giờ sửa firewall của VM — `sudo ufw enable` có thể khoá mất SSH vĩnh viễn.<br>· `crontab -e` bằng `ubuntu`, không bao giờ `sudo crontab -e`.<br>· Sao lưu cơ sở dữ liệu bằng sqlite `.backup`, không bao giờ `cp` (bản chép giữa lúc đang ghi là bản hỏng).<br>· Đừng chạy `nightly.py` trước khi `bars.py --sync --full` đã nạp đủ dữ liệu nến.',
          },
        ],
      },
      {
        h: { en: 'The website', vi: 'Trang web' },
        p: [
          {
            en: '· Deploy only from `apps/desktop`.<br>· `npm ci`, and no new packages: the lock file must match or the Cloudflare build fails.<br>· Before any risky change: export a backup.',
            vi: '· Chỉ deploy từ `apps/desktop`.<br>· `npm ci`, và không thêm package: file lock phải khớp, nếu không bản build trên Cloudflare hỏng.<br>· Trước mọi thay đổi rủi ro: xuất sao lưu.',
          },
        ],
      },
    ],
  },
];
