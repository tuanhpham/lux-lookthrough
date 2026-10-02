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
  group: 'data' | 'trading' | 'web' | 'scanner' | 'safety';
  icon: string;
  title: Bi;
  lead: Bi;
  steps: GuideStep[];
  /** A closing note in a soft box. */
  tip?: Bi;
}

export const GROUPS: Record<GuideSection['group'], Bi> = {
  data: { en: 'Your data', vi: 'Dữ liệu' },
  trading: { en: 'Trading', vi: 'Giao dịch' },
  web: { en: 'The website', vi: 'Trang web' },
  scanner: { en: 'Scanner (VM)', vi: 'Scanner (VM)' },
  safety: { en: 'Safety', vi: 'An toàn' },
};

export const WHERE: Record<Where, Bi> = {
  pc: { en: 'Your computer · terminal', vi: 'Máy tính · terminal' },
  vm: { en: 'On the VM · SSH', vi: 'Trên VM · SSH' },
  crontab: { en: 'Crontab content · paste into the editor', vi: 'Nội dung crontab · dán vào editor' },
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
    title: { en: 'Data & sync', vi: 'Dữ liệu & sync' },
    lead: {
      en: 'Everything you enter lives on this device AND on the server under your sync code, so every device with the same code sees the same data. The server also keeps every version it replaced, which is what makes the restore below possible.',
      vi: 'Mọi thứ bạn nhập đều nằm trên thiết bị này VÀ trên server, gắn với mã đồng bộ, nên các thiết bị dùng chung mã sẽ thấy cùng một dữ liệu. Server còn giữ lại mọi phiên bản cũ đã bị thay — nhờ vậy mới khôi phục được như mục bên dưới.',
    },
    steps: [
      {
        h: { en: 'Keep a backup file now and then', vi: 'Thỉnh thoảng xuất một file sao lưu' },
        p: [
          {
            en: '<b>Export backup</b> downloads every key on this device into one JSON file. It works without sync and is the one copy nobody else can overwrite. Once a week, or before anything risky, is plenty.',
            vi: '<b>Xuất sao lưu</b> tải toàn bộ dữ liệu trên thiết bị này về một file JSON. Không cần sync vẫn dùng được, và đây là bản duy nhất không ai ghi đè được. Mỗi tuần một lần, hoặc trước khi làm việc gì rủi ro, là đủ.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'One key, one version', vi: 'Khôi phục từng mục' },
        p: [
          {
            en: '<b>🕘 Browse versions</b> (in the ☁️ box) lists every overwritten or deleted value, newest first, and restores ONE of them. Use it when you know which thing broke — e.g. only the Portfolio. For "everything as it was at 9 pm yesterday", use the next section.',
            vi: '<b>🕘 Xem các phiên bản</b> (trong hộp ☁️) liệt kê mọi giá trị đã bị ghi đè hoặc xoá, mới nhất lên đầu, và khôi phục MỘT giá trị. Dùng khi bạn biết chính xác cái gì hỏng — vd chỉ Danh mục. Muốn "mọi thứ như lúc 9 giờ tối qua" thì dùng mục tiếp theo.',
          },
        ],
        where: 'app',
      },
    ],
  },
  {
    id: 'look',
    group: 'data',
    icon: '🎨',
    title: { en: 'Appearance & colour', vi: 'Giao diện & màu sắc' },
    lead: {
      en: 'Pick the app’s main colour — buttons, links, highlights, progress bars and chart accents all follow it, on both the dark and the light theme. The preview shows it before you save; <b>Save colour</b> repaints the whole app at once.',
      vi: 'Chọn màu chủ đạo của app — nút bấm, liên kết, điểm nhấn, thanh tiến trình và màu nhấn trên chart đều đổi theo, ở cả giao diện tối lẫn sáng. Khung xem trước cho thấy màu trước khi lưu; bấm <b>Lưu màu</b> là cả app đổi ngay.',
    },
    steps: [],
    tip: {
      en: 'Red stays reserved for losses. Green is offered once, as <b>Jade</b> — deeper and bluer than the bright mint that marks a gain, so a button never reads as a profit. A custom colour close to either still gets a warning. The choice is saved on this device, like the dark/light theme.',
      vi: 'Đỏ vẫn dành riêng cho lỗ. Xanh lá có đúng một lựa chọn là <b>Xanh ngọc bích</b> — đậm và ngả lam hơn màu xanh bạc hà sáng dùng cho lãi, nên nút bấm không bị đọc nhầm thành lãi. Chọn màu riêng gần hai màu đó vẫn có cảnh báo. Màu được lưu trên thiết bị này, giống như chế độ tối/sáng.',
    },
  },
  {
    id: 'restore',
    group: 'data',
    icon: '⏪',
    title: { en: 'Restore to a point in time', vi: 'Khôi phục về một thời điểm' },
    lead: {
      en: 'Puts every key back to the value it had at the moment you choose, in one go, from inside the app. Nothing is deleted: things created after that moment stay. The values it replaces are archived first, so a restore can itself be undone by restoring to a moment just before it.',
      vi: 'Đưa mọi mục về đúng giá trị tại thời điểm bạn chọn, làm một lần, ngay trong app. Không xoá gì cả: những thứ tạo sau thời điểm đó vẫn còn. Các giá trị bị thay sẽ được lưu trữ trước, nên chính lần khôi phục này cũng hoàn tác được — chỉ cần khôi phục về thời điểm ngay trước nó.',
    },
    steps: [
      {
        h: { en: 'Close the app on every OTHER device', vi: 'Đóng app trên mọi thiết bị KHÁC' },
        p: [
          {
            en: 'A device that is still open holds the old data in memory, and its next edit would write it back. Close those tabs (or just leave them closed until step 6).',
            vi: 'Thiết bị nào còn mở thì vẫn giữ dữ liệu cũ trong bộ nhớ, và lần sửa kế tiếp trên đó sẽ ghi đè dữ liệu cũ trở lại. Đóng các tab đó (hoặc cứ để đóng cho tới bước 6).',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Export a backup of this device', vi: 'Xuất sao lưu thiết bị này' },
        p: [{ en: 'The button above. Belt and braces: the restore is undoable anyway.', vi: 'Bấm nút ở trên. Cho chắc ăn thôi: đằng nào khôi phục cũng hoàn tác được.' }],
        where: 'app',
      },
      {
        h: { en: 'Choose the moment', vi: 'Chọn thời điểm' },
        p: [
          {
            en: 'Type a date and time in YOUR local time, or click one of the recent changes: each quick pick is one minute before a big overwrite of Portfolio or Financial Status — usually exactly the moment you want.',
            vi: 'Nhập ngày giờ theo giờ ĐỊA PHƯƠNG, hoặc bấm chọn một thay đổi gần đây: mỗi lựa chọn nhanh là thời điểm một phút trước một lần ghi đè lớn của Danh mục hoặc Financial Status — thường chính là lúc bạn cần.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Preview — nothing changes yet', vi: 'Xem trước — chưa thay đổi gì' },
        p: [
          {
            en: 'The list shows every key that differs from that moment, with its size then and now. A size that dropped a lot (red) is usually the loss. Untick anything you want to keep as it is now.',
            vi: 'Danh sách hiện mọi mục đang khác so với thời điểm đó, kèm dung lượng lúc ấy và bây giờ. Dung lượng tụt mạnh (màu đỏ) thường chính là chỗ mất dữ liệu. Bỏ tick những mục muốn giữ nguyên như hiện tại.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Restore', vi: 'Khôi phục' },
        p: [
          {
            en: 'The page reloads with the restored data. The message tells you the exact moment to pick if you want to undo.',
            vi: 'Trang sẽ tải lại với dữ liệu đã khôi phục. Thông báo hiện ra ghi rõ cần chọn thời điểm nào nếu muốn hoàn tác.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Open the other devices again', vi: 'Mở lại các thiết bị khác' },
        p: [
          {
            en: 'They download the restored values when they open (and again whenever the app comes back to the foreground).',
            vi: 'Các thiết bị đó tự tải giá trị đã khôi phục khi mở (và mỗi lần app quay lại màn hình).',
          },
        ],
        where: 'app',
      },
    ],
    tip: {
      en: 'Needs the server from 1 Oct 2026 or later. If the preview says the server does not have restore-at yet, deploy the latest build (see Deploy) — or use 🕘 Browse versions, which works on every build.',
      vi: 'Cần server từ bản 1/10/2026 trở đi. Nếu bước xem trước báo server chưa có restore-at, hãy deploy bản mới nhất (xem mục Deploy) — hoặc dùng 🕘 Xem các phiên bản, bản server nào cũng chạy được.',
    },
  },
  {
    id: 'why',
    group: 'data',
    icon: '🧭',
    title: { en: 'Why data went missing — and how to avoid it', vi: 'Vì sao dữ liệu bị mất — và cách tránh' },
    lead: {
      en: 'Sync is last-write-wins per key, and Portfolio and Financial Status are each ONE key. Until 1 Oct 2026 a device only downloaded at start-up, so a tab left open for a day still held yesterday’s data, and the first edit there wrote all of it back over the other device’s changes.',
      vi: 'Sync theo kiểu "ai ghi sau thì thắng" cho từng mục, mà Danh mục và Financial Status mỗi cái chỉ là MỘT mục. Trước 1/10/2026, thiết bị chỉ tải dữ liệu về lúc khởi động, nên một tab để mở cả ngày vẫn giữ dữ liệu hôm qua, và lần sửa đầu tiên trên đó ghi đè toàn bộ lên thay đổi của thiết bị kia.',
    },
    steps: [
      {
        h: { en: 'Fixed: the app re-downloads when it comes back', vi: 'Đã sửa: app tải lại dữ liệu mỗi khi quay lại' },
        p: [
          {
            en: 'Whenever the tab or the app returns to the foreground (at most once a minute), it pulls first, and Portfolio drops its in-memory copy. The lost versions were never gone — the server archived them — so they are restorable above.',
            vi: 'Mỗi khi tab hoặc app quay lại màn hình (tối đa mỗi phút một lần), app tải dữ liệu về trước, và Danh mục bỏ bản đang giữ trong bộ nhớ. Các phiên bản bị mất thật ra chưa hề mất — server đã lưu trữ lại — nên vẫn khôi phục được ở mục trên.',
          },
        ],
      },
      {
        h: { en: 'Habits that still help', vi: 'Thói quen vẫn nên giữ' },
        p: [
          {
            en: '· Edit on one device at a time; if both are open, reload the one you are about to edit.<br>· Watch the sync pill in the top bar: red means this device is NOT syncing, and anything you change there stays local.<br>· Never clear site data / browser storage on a device without exporting first.<br>· Update every device to the latest build (reload once after a deploy).',
            vi: '· Mỗi lúc chỉ sửa trên một thiết bị; nếu cả hai đang mở, tải lại trang trên thiết bị sắp sửa.<br>· Để ý nút trạng thái sync trên thanh trên cùng: màu đỏ là thiết bị này KHÔNG sync, sửa gì trên đó cũng chỉ nằm trên máy.<br>· Đừng bao giờ xoá dữ liệu trang / bộ nhớ trình duyệt khi chưa xuất sao lưu.<br>· Cập nhật mọi thiết bị lên bản mới nhất (tải lại trang một lần sau mỗi lần deploy).',
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
      vi: 'Tua lại TOÀN BỘ cơ sở dữ liệu (mọi người dùng, mọi mục) về một phút bạn chọn, lùi tối đa 30 ngày. Chỉ dùng khi khôi phục trong app không cứu được — vd chính lịch sử phiên bản cũng bị thiếu. Chạy trên máy tính có repo; mọi bước trước bước 6 đều chỉ đọc.',
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
            vi: 'Liệt kê 20 lần ghi đè gần nhất của Danh mục và Financial Status. Chỗ mất dữ liệu là dòng mới nhất có `bytes` LỚN, nằm ngay trên các dòng nhỏ. `overwritten_ms` của dòng đó chính là thời điểm cần tìm.',
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
        h: { en: 'Turn it into a timestamp one minute earlier', vi: 'Đổi sang timestamp sớm hơn một phút' },
        p: [
          {
            en: 'Replace `<MS>` with the number from step 2. The output is UTC with a `Z` — what wrangler wants. A clock time you remember is local: Luxembourg is UTC+2 until 25 Oct 2026, then UTC+1.',
            vi: 'Thay `<MS>` bằng con số ở bước 2. Kết quả là giờ UTC có đuôi `Z` — đúng định dạng wrangler cần. Còn giờ bạn nhớ là giờ địa phương: Luxembourg là UTC+2 tới 25/10/2026, sau đó là UTC+1.',
          },
        ],
        cmd: 'MS=<MS>\ndate -u -d @$(( MS/1000 - 60 )) +%Y-%m-%dT%H:%M:%SZ',
        where: 'pc',
      },
      {
        h: { en: 'Check the bookmark exists', vi: 'Kiểm tra mốc đó có tồn tại' },
        cmd: 'npx wrangler d1 time-travel info screener-sync --timestamp <TIMESTAMP>Z\nbash scripts/probe-timestamp.sh <TIMESTAMP>Z',
        where: 'cf',
      },
      {
        h: { en: 'Dump the current database first', vi: 'Dump cơ sở dữ liệu hiện tại trước' },
        p: [{ en: 'Your way back if the restore picks the wrong minute.', vi: 'Đường lui nếu lỡ khôi phục nhầm phút.' }],
        cmd: 'npx wrangler d1 export screener-sync --remote --output ./kv-before-restore.sql',
        where: 'cf',
      },
      {
        h: { en: 'Restore', vi: 'Khôi phục' },
        warn: {
          en: 'This rewinds every user and every key. Close the app on all devices first, and open them again only afterwards.',
          vi: 'Lệnh này tua lại dữ liệu của mọi người dùng, mọi mục. Đóng app trên tất cả thiết bị trước, xong hẳn rồi mới mở lại.',
        },
        cmd: 'npx wrangler d1 time-travel restore screener-sync --timestamp <TIMESTAMP>Z',
        where: 'cf',
      },
      {
        h: { en: 'Verify', vi: 'Kiểm tra lại' },
        p: [{ en: 'Should print the real size, and keep printing it after a device opens.', vi: 'Phải in ra dung lượng thật, và vẫn giữ nguyên con số đó sau khi một thiết bị mở app.' }],
        cmd: 'npx wrangler d1 execute screener-sync --remote \\\n  --command "SELECT key, length(value) AS bytes FROM kv WHERE key IN (\'accounts\',\'wealth\')"',
        where: 'cf',
      },
    ],
    tip: {
      en: 'The full write-up, with the reasoning behind each step, is `apps/desktop/RECOVERY.md`.',
      vi: 'Bản đầy đủ, giải thích lý do từng bước, nằm ở `apps/desktop/RECOVERY.md`.',
    },
  },
  {
    id: 'playbook',
    group: 'trading',
    icon: '📖',
    title: { en: 'Playbook settings', vi: 'Cài đặt Playbook' },
    lead: {
      en: 'The numbers every plan is sized and graded with: the risk ladder, how much smaller a lower grade trades, where A/B/C fall, and the stop / target / trail rule of each setup. The same dialog opens from ⚙ Playbook on Portfolio; it is here too so it can be found without an account open.',
      vi: 'Các con số mọi Trade plan dùng để tính size và chấm hạng: thang rủi ro, hạng thấp hơn thì đánh nhỏ đi bao nhiêu, ranh giới A/B/C nằm ở đâu, và luật stop / target / trailing stop của từng setup. Đây cũng chính là hộp thoại mở từ nút ⚙ Playbook ở Danh mục; đặt thêm ở đây để tìm được mà không cần mở tài khoản nào.',
    },
    steps: [],
    tip: {
      en: 'Saving re-derives every plan still being written; anything already bought, saved or filed keeps the numbers it was decided on. The reasoning behind each default is in Learn, Part I, §9–§12.',
      vi: 'Bấm Lưu thì mọi Trade plan đang viết dở sẽ tự tính lại; plan nào đã mua, đã lưu hay đã đưa vào Case Study thì giữ nguyên con số lúc ra quyết định. Lý do của từng giá trị mặc định nằm ở Learn, Phần I, mục 9–12.',
    },
  },
  {
    id: 'local',
    group: 'web',
    icon: '💻',
    title: { en: 'Run it on your computer', vi: 'Chạy trên máy tính' },
    lead: {
      en: 'For trying a change before it goes live. The local app talks to the REAL sync server, so it shows your real data — and what you change there is real too.',
      vi: 'Dùng để thử một thay đổi trước khi đưa lên. App chạy local vẫn kết nối với server sync THẬT, nên nó hiện dữ liệu thật — và sửa gì trên đó cũng là sửa thật.',
    },
    steps: [
      {
        h: { en: 'Check the tools', vi: 'Kiểm tra công cụ' },
        p: [{ en: 'Node.js 20 or newer, and Git. On Windows use Git Bash for every command on this page.', vi: 'Node.js 20 trở lên và Git. Trên Windows, chạy mọi lệnh trong trang này bằng Git Bash.' }],
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
            vi: 'Dùng `npm ci`, không phải `npm install`: Cloudflare chạy đúng lệnh này, nên ở đây chạy được thì trên đó cũng chạy được. Đừng thêm package — `package-lock.json` mà đổi là bản build trên Cloudflare hỏng.',
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
            vi: 'Rồi mở http://localhost:1420. Trên mạng công ty có soi TLS, sync sẽ báo nhầm "mã không hợp lệ" — khi đó thêm `SYNC_INSECURE=1` vào trước lệnh.',
          },
        ],
        cmd: 'npm run dev:desktop',
        where: 'pc',
      },
      {
        h: { en: 'Test and build before you ship', vi: 'Test và build trước khi đưa lên' },
        p: [{ en: 'All three must pass. The build lands in `apps/desktop/dist`.', vi: 'Cả ba lệnh phải pass. Bản build nằm ở `apps/desktop/dist`.' }],
        cmd: 'npm run test:core\nnpm test --workspace @screener/desktop\nnpm run build',
        where: 'pc',
      },
      {
        h: { en: 'Later: bring it up to date', vi: 'Lần sau: cập nhật code mới' },
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
      vi: 'Trang web là Pages project `the-professional`, đi kèm cơ sở dữ liệu sync `screener-sync` (D1). Mỗi lần deploy đưa lên cả trang lẫn các hàm server — gồm cả server sync.',
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
          vi: 'Deploy từ chỗ khác thì trang vẫn lên nhưng KHÔNG có các hàm server: không có giá, không sync, và scanner push trả về 404.',
        },
        cmd: 'cd apps/desktop\nnpx wrangler login\nnpx wrangler pages deploy dist --project-name the-professional',
        where: 'cf',
      },
      {
        h: { en: 'After a schema change only: update the database', vi: 'Chỉ khi đổi schema: cập nhật cơ sở dữ liệu' },
        p: [{ en: 'Safe to repeat: every table is `CREATE TABLE IF NOT EXISTS`, so existing data is untouched.', vi: 'Chạy lại nhiều lần vẫn an toàn: mọi bảng đều là `CREATE TABLE IF NOT EXISTS`, dữ liệu cũ không bị đụng tới.' }],
        cmd: 'npx wrangler d1 execute screener-sync --remote --file=./schema.sql',
        where: 'cf',
      },
      {
        h: { en: 'Secrets: typed into wrangler, never into a file', vi: 'Secret: gõ vào wrangler, tuyệt đối không ghi vào file' },
        p: [
          {
            en: 'Each command asks for the value and stores it in Cloudflare. `SCANNER_TOKEN` must equal the one in the VM’s `.env`. Redeploy afterwards so the functions see it.',
            vi: 'Mỗi lệnh sẽ hỏi giá trị rồi lưu lên Cloudflare. `SCANNER_TOKEN` phải trùng với giá trị trong `.env` của VM. Sau đó deploy lại để các hàm nhận giá trị mới.',
          },
        ],
        cmd: 'npx wrangler pages secret put SCANNER_TOKEN --project-name the-professional\nnpx wrangler pages secret put FINNHUB_API_KEY --project-name the-professional',
        where: 'cf',
      },
      {
        h: { en: 'Check it is live', vi: 'Kiểm tra trang đã chạy' },
        p: [
          {
            en: 'Open the site, reload once (the app picks up the new build), and look at the ☁️ pill: green. On the VM, `python push.py --ping` should answer 200.',
            vi: 'Mở trang, tải lại một lần (để app nhận bản mới), nút ☁️ phải màu xanh. Trên VM, `python push.py --ping` phải trả về 200.',
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
      vi: 'Scanner chạy trên Oracle VM bằng user `ubuntu`, trong `~/scanner`, dùng Python riêng ở `.venv`. Secret nằm trong `~/scanner/.env` (TG_TOKEN, TG_CHAT_ID, ALPACA_KEY, ALPACA_SECRET, SEC_UA, và riêng cho push là SCANNER_PUSH_URL, SCANNER_TOKEN).',
    },
    steps: [
      {
        h: { en: 'Open an SSH session', vi: 'Mở phiên SSH' },
        p: [{ en: 'Replace `<VM_IP>` with the VM’s public address. The key file stays on your computer.', vi: 'Thay `<VM_IP>` bằng địa chỉ public của VM. File key luôn nằm trên máy tính của bạn.' }],
        cmd: 'ssh -i ~/.ssh/oracle_scanner ubuntu@<VM_IP>',
        where: 'pc',
      },
      {
        h: { en: 'Pull the new code and restart', vi: 'Pull code mới và khởi động lại' },
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
        h: { en: 'Confirm it came back', vi: 'Xác nhận scanner đã chạy lại' },
        p: [
          {
            en: 'The log must show `callbacks: bat dau lang nghe nut bam`. `active` + a sane disk and memory means healthy.',
            vi: 'Log phải có dòng `callbacks: bat dau lang nghe nut bam`. Thấy `active`, ổ đĩa và bộ nhớ bình thường là ổn.',
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
      vi: 'Scanner live chạy dưới dạng service systemd `scanner`. Mọi log nằm trong `~/scanner/state/`: service.log (live), prep.log (nightly + hằng tuần), push.log (đẩy lên trang web), watchd.log (watchdog).',
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
        h: { en: 'Re-run last night by hand', vi: 'Chạy lại job đêm qua bằng tay' },
        p: [
          {
            en: 'Self-contained: it activates the venv itself, so it works in a fresh SSH window. The Scanner page’s runbook explains every stage and what to do when one fails.',
            vi: 'Lệnh tự lo hết: tự kích hoạt venv, nên mở cửa sổ SSH mới là chạy được. Phần hướng dẫn trên trang Scanner giải thích từng bước và cách xử lý khi một bước bị lỗi.',
          },
        ],
        cmd: 'cd ~/scanner && source .venv/bin/activate && git pull && python nightly.py',
        where: 'vm',
      },
    ],
  },
  {
    id: 'scan-alerts',
    group: 'scanner',
    icon: '🔔',
    title: { en: 'Telegram alerts from watchlists', vi: 'Cảnh báo Telegram theo watchlist' },
    lead: {
      en: 'You pick the lists and the rules on the <b>Watchlist</b> tab (🔔 Telegram alerts): a price level per ticker, unusual volume, a big move from yesterday’s close — each list with its own switches and thresholds. The app publishes them as `scanner:alerts`; `watchd` on the VM reads them every 5 minutes, checks every minute while that market is open (US, Germany/EU, Vietnam) and messages the same Telegram chat as the scanner.',
      vi: 'Bạn chọn danh sách và quy tắc ở tab <b>Watchlist</b> (🔔 Cảnh báo Telegram): mức giá cho từng mã, khối lượng bất thường, biến động mạnh so với giá đóng cửa hôm qua — mỗi danh sách có công tắc và ngưỡng riêng. App đẩy quy tắc lên khoá `scanner:alerts`; `watchd` trên VM đọc 5 phút một lần, kiểm tra mỗi phút khi thị trường đó đang mở (Mỹ, Đức/EU, Việt Nam) và nhắn vào cùng nhóm Telegram với Scanner.',
    },
    steps: [
      {
        h: { en: 'Once: update the VM and restart watchd', vi: 'Một lần: cập nhật VM rồi khởi động lại watchd' },
        p: [
          {
            en: 'The alerter lives inside `watchd`, which is its own systemd unit. The <b>Update</b> button on the VM panel pulls the code but does not restart `watchd` — this restart does. It never touches `main.py`.',
            vi: 'Bộ cảnh báo nằm trong `watchd`, một unit systemd riêng. Nút <b>Cập nhật</b> ở bảng điều khiển VM chỉ kéo code, không khởi động lại `watchd` — lệnh dưới đây mới làm. Nó không đụng tới `main.py`.',
          },
        ],
        cmd: 'cd ~/scanner && git pull\n.venv/bin/python -m pytest -q tests/test_useralerts.py && sudo systemctl restart watchd\nsystemctl status watchd --no-pager | head -15',
        where: 'vm',
      },
      {
        h: { en: 'Switch lists on and type the levels', vi: 'Bật danh sách và gõ mức giá' },
        p: [
          {
            en: 'Levels are in the ticker’s own currency (EUR for `.DE`, VND for `.VN`). Sync must be on, otherwise the VM cannot see the rules. Under “What the VM says” the panel shows when the VM last read them and what it sent today.',
            vi: 'Mức giá tính theo tiền của chính mã đó (EUR cho `.DE`, VND cho `.VN`). Phải bật đồng bộ ☁️, nếu không VM không đọc được quy tắc. Mục “VM báo lại” cho biết lần cuối VM đọc quy tắc và hôm nay đã gửi gì.',
          },
        ],
        where: 'app',
      },
      {
        h: { en: 'Nothing arrives?', vi: 'Không thấy tin nào?' },
        p: [
          {
            en: 'Look for `useralerts:` lines in the watchd log. A stale quote, a closed market or a missing 20-day volume average is skipped on purpose and named in the panel’s warnings, never sent as an alert.',
            vi: 'Tìm các dòng `useralerts:` trong log của watchd. Báo giá cũ, thị trường đang đóng hay chưa có khối lượng trung bình 20 phiên đều được bỏ qua có chủ đích và hiện trong mục cảnh báo của panel, không bao giờ gửi thành tin.',
          },
        ],
        cmd: 'grep useralerts ~/scanner/state/watchd.log | tail -20',
        where: 'vm',
      },
    ],
    tip: {
      en: 'Defaults: volume ×2 the usual pace for the time of day, move ±4% — both per list. Each rule fires at most once per ticker per day; changing a level arms it again. At most 120 tickers are watched; quotes are about 15 minutes late.',
      vi: 'Mặc định: khối lượng ×2 nhịp thường theo giờ trong phiên, biến động ±4% — cả hai chỉnh theo từng danh sách. Mỗi quy tắc báo tối đa một lần mỗi mã mỗi ngày; đổi mức giá là quy tắc được bật lại. Tối đa 120 mã; giá trễ khoảng 15 phút.',
    },
  },
  {
    id: 'scan-remote',
    group: 'scanner',
    icon: '📡',
    title: { en: 'Run on the VM from here', vi: 'Chạy lệnh trên VM ngay tại đây' },
    lead: {
      en: 'Fixed buttons, no free-text box: each one queues a single whitelisted command, the running scanner picks it up within ~20 s, and the answer appears below. Tokens in the output are blanked out on the VM before they leave it.',
      vi: 'Chỉ có nút bấm cố định, không có ô gõ lệnh: mỗi nút xếp một lệnh nằm trong danh sách cho phép, scanner đang chạy sẽ nhận lệnh trong khoảng 20 giây và kết quả hiện ngay bên dưới. Token trong kết quả bị che ngay trên VM trước khi gửi ra ngoài.',
    },
    steps: [
      {
        h: { en: 'Turn it on, once: name yourself the admin', vi: 'Bật một lần: đặt bạn làm admin' },
        p: [
          {
            en: 'Until this secret exists the server refuses every command, for everyone. Paste the id shown in the panel above when wrangler asks for the value, then deploy again (Website › Deploy). Several ids: separate them with commas.',
            vi: 'Khi chưa có secret này, server từ chối mọi lệnh của tất cả mọi người. Khi wrangler hỏi giá trị, dán id đang hiện ở khung phía trên, rồi deploy lại (Trang web › Deploy). Nhiều id thì cách nhau bằng dấu phẩy.',
          },
        ],
        cmd: 'cd lux-lookthrough/screener-ts/apps/desktop\nnpx wrangler pages secret put SCANNER_ADMIN --project-name the-professional\nnpx wrangler pages deploy dist --project-name the-professional',
        where: 'cf',
      },
      {
        h: { en: 'Get the new scanner code onto the VM, once', vi: 'Đưa code scanner mới lên VM, một lần' },
        p: [
          {
            en: 'The listener lives in `main.py`, so the service needs one restart by hand. After that, “Update code + restart” does this for you.',
            vi: 'Phần nhận lệnh nằm trong `main.py`, nên lần đầu phải khởi động lại service bằng tay. Từ lần sau, nút “Cập nhật code + khởi động lại” sẽ tự làm việc này.',
          },
        ],
        cmd: 'cd ~/scanner && git pull\n.venv/bin/python -m pytest -q tests/test_remote.py\nsudo systemctl restart scanner',
        where: 'vm',
      },
      {
        h: { en: 'What each button may do — and what none can', vi: 'Mỗi nút được làm gì — và không nút nào làm được gì' },
        p: [
          {
            en: '<b>Status</b>: systemd state, uptime, the scanner’s heartbeat, the commit, disk and memory. <b>Log</b>: the last 60 lines of one log in `state/`. <b>Push data now</b>: `push.py --all`. <b>Test scan</b>: one scoring pass inside the running scanner — nothing sent to Telegram, nothing saved. <b>Last nightly run</b>: `nightly.py --status`. <b>Who holds the DB</b>: `scripts/db_lock.py`.',
            vi: '<b>Trạng thái</b>: trạng thái systemd, uptime, nhịp tim của scanner, commit đang chạy, ổ đĩa và RAM. <b>Log</b>: 60 dòng cuối của một file log trong `state/`. <b>Đẩy dữ liệu ngay</b>: `push.py --all`. <b>Quét thử</b>: một vòng chấm điểm ngay trong scanner đang chạy — không gửi Telegram, không lưu gì. <b>Lần chạy đêm gần nhất</b>: `nightly.py --status`. <b>Ai đang giữ DB</b>: `scripts/db_lock.py`.',
          },
          {
            en: '<b>Update code + restart</b>: `git pull --ff-only`, then a check that the new code imports; only then does the scanner exit and systemd starts it again (~30 s). If `requirements.txt` changed it stops and tells you to run pip by hand. <b>Restart</b>: the same exit, without the pull.',
            vi: '<b>Cập nhật code + khởi động lại</b>: `git pull --ff-only`, rồi kiểm tra code mới import được; chỉ khi đó scanner mới tự thoát và systemd chạy lại (~30 giây). Nếu `requirements.txt` đổi thì dừng lại và nhắc bạn chạy pip bằng tay. <b>Khởi động lại</b>: thoát y như vậy nhưng không pull.',
          },
        ],
        warn: {
          en: 'Never possible from here: an arbitrary command, editing `.env` or the crontab, the firewall, or a second `main.py`. Each command runs once, and one older than 5 minutes is dropped.',
          vi: 'Từ đây KHÔNG BAO GIỜ làm được: chạy lệnh tùy ý, sửa `.env` hay crontab, đụng firewall, hoặc mở `main.py` thứ hai. Mỗi lệnh chỉ chạy một lần, lệnh cũ hơn 5 phút bị bỏ qua.',
        },
      },
      {
        h: { en: 'When a button says the VM did not pick it up', vi: 'Khi nút báo VM chưa nhận lệnh' },
        p: [
          {
            en: 'The listener is part of the live scanner, so a stopped service means no buttons — that is the one case that still needs SSH.',
            vi: 'Phần nhận lệnh nằm trong scanner đang chạy, nên service dừng thì nút cũng không chạy — đây là trường hợp duy nhất vẫn phải SSH.',
          },
        ],
        cmd: 'sudo systemctl status scanner\ntail -30 ~/scanner/state/service.log | grep -i remote',
        where: 'vm',
      },
    ],
    tip: {
      en: 'The commands travel with your sync code, so the admin list is what keeps a shared code from becoming a key to the VM. The VM’s `SCANNER_TOKEN` never reaches the browser.',
      vi: 'Lệnh đi kèm mã sync của bạn, nên danh sách admin là thứ ngăn một mã sync dùng chung trở thành chìa khóa vào VM. `SCANNER_TOKEN` của VM không bao giờ xuống trình duyệt.',
    },
  },
  {
    id: 'scan-cron',
    group: 'scanner',
    icon: '⏰',
    title: { en: 'The schedule (crontab)', vi: 'Lịch chạy (crontab)' },
    lead: {
      en: 'Every scheduled job, in New York time. Edit it as `ubuntu` with `crontab -e` — NOT `sudo crontab -e`, which is root’s, a different file.',
      vi: 'Toàn bộ job chạy theo lịch, tính theo giờ New York. Sửa bằng user `ubuntu` với `crontab -e` — KHÔNG dùng `sudo crontab -e` (đó là crontab của root, một file khác hẳn).',
    },
    steps: [
      {
        h: { en: 'Open the editor', vi: 'Mở editor' },
        cmd: 'crontab -e',
        where: 'vm',
      },
      {
        h: { en: 'The lines that should be there', vi: 'Các dòng cần có' },
        warn: {
          en: 'These are crontab CONTENT. Pasted into the shell instead of the editor, bash answers `0: command not found` — nothing is broken, it was just the wrong window.',
          vi: 'Đây là NỘI DUNG crontab. Lỡ dán vào shell thay vì editor, bash sẽ báo `0: command not found` — không hỏng gì cả, chỉ là dán nhầm chỗ.',
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
        h: { en: 'Check what is installed and that it fires', vi: 'Kiểm tra lịch đã cài và có chạy đúng giờ không' },
        cmd: 'crontab -l\ngrep CRON /var/log/syslog | tail',
        where: 'vm',
      },
    ],
    tip: {
      en: 'Cron OR a systemd timer for the nightly run — never both, or it runs twice and the two fight over the database lock. Keep the 09:05 restart: it gives the live scanner a fresh day.',
      vi: 'Job nightly chạy bằng cron HOẶC systemd timer — không bao giờ cả hai, nếu không nó sẽ chạy hai lần và hai bên tranh nhau khoá cơ sở dữ liệu. Giữ lần khởi động lại lúc 09:05: nhờ nó scanner live bắt đầu ngày mới sạch sẽ.',
    },
  },
  {
    id: 'scan-trouble',
    group: 'scanner',
    icon: '🧯',
    title: { en: 'When something is wrong', vi: 'Khi có sự cố' },
    lead: {
      en: 'The four problems that actually happen, each with its check and its fix.',
      vi: 'Bốn sự cố hay gặp thật sự, kèm cách kiểm tra và cách sửa cho từng cái.',
    },
    steps: [
      {
        h: { en: 'Telegram says 409 Conflict', vi: 'Telegram báo 409 Conflict' },
        p: [
          {
            en: 'Two copies of `main.py` are polling Telegram. Only ONE may ever run. Find the strays, kill them by PID, and restart the service — never start a second one by hand.',
            vi: 'Có hai tiến trình `main.py` cùng gọi Telegram. Chỉ được chạy MỘT bản. Tìm bản thừa, kill theo PID, rồi khởi động lại service — tuyệt đối không tự chạy thêm một bản.',
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
            vi: '`--ping` cho biết lỗi nằm ở đâu: 200 = ổn, 401 = SCANNER_TOKEN trong `.env` và trên Cloudflare không khớp, 404 = trang bị deploy sai thư mục, 403 = push.py đã cũ (git pull), 503 = lỗi cơ sở dữ liệu. Sau đó push bằng tay (chạy `--dry` trước để xem sẽ gửi gì).',
          },
        ],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython push.py --ping\npython push.py --all --dry\npython push.py --all\ntail -30 state/push.log',
        where: 'vm',
      },
      {
        h: { en: '"database is locked"', vi: '"database is locked"' },
        p: [{ en: 'Shows who holds the lock and whether it is safe to go on.', vi: 'Cho biết tiến trình nào đang giữ khoá và tiếp tục có an toàn không.' }],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython scripts/db_lock.py',
        where: 'vm',
      },
      {
        h: { en: 'The nightly run failed', vi: 'Job nightly bị lỗi' },
        p: [
          {
            en: 'See which stage, then re-run it. `--dry-run` shows the plan without doing anything. Only the analysis stages, without downloading again: `--only regime,sectors,structure,setups`.',
            vi: 'Xem bước nào hỏng rồi chạy lại. `--dry-run` chỉ in ra các bước sẽ chạy mà không làm gì. Chỉ chạy lại phần phân tích, không tải lại dữ liệu: `--only regime,sectors,structure,setups`.',
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
      vi: 'Mọi ngưỡng đều nằm trong code Python của repo scanner — trên VM không có màn hình cài đặt nào. Sửa trong repo, commit, rồi `git pull` + khởi động lại trên VM (xem mục Kết nối & cập nhật).',
    },
    steps: [
      {
        h: { en: 'Where each setting lives', vi: 'Mỗi cài đặt nằm ở đâu' },
        p: [
          {
            en: '· `main.py` — live alerts: `ALERT_SCORE`, `COOLDOWN`, `MAX_ALERTS`.<br>· `scorer.py` — the live score: `MIN_RVOL` and friends.<br>· `config.py` — swing thresholds, `BENCH`, `SECTOR_ETFS`, `REGIME`.<br>· `setups.py` — the BO / RV setup rules. If `MAX_AGE` changes there, change `MAX_AGE_DAYS` in this app’s scannerTab.ts too.',
            vi: '· `main.py` — cảnh báo live: `ALERT_SCORE`, `COOLDOWN`, `MAX_ALERTS`.<br>· `scorer.py` — chấm điểm live: `MIN_RVOL` và các ngưỡng đi kèm.<br>· `config.py` — ngưỡng swing, `BENCH`, `SECTOR_ETFS`, `REGIME`.<br>· `setups.py` — luật setup BO / RV. Đổi `MAX_AGE` ở đó thì phải đổi luôn `MAX_AGE_DAYS` trong scannerTab.ts của app này.',
          },
        ],
      },
      {
        h: { en: 'See what is in force', vi: 'Xem cài đặt đang áp dụng' },
        p: [{ en: 'The Scanner page shows the same values under “Thresholds”, as the VM last pushed them.', vi: 'Trang Scanner hiện đúng các giá trị này ở mục “Ngưỡng”, theo lần VM push gần nhất.' }],
        cmd: 'cd ~/scanner && source .venv/bin/activate\npython regime.py --config\npython sectors.py --config',
        where: 'vm',
      },
    ],
  },
  {
    id: 'rules',
    group: 'safety',
    icon: '🛡️',
    title: { en: 'Rules that are never broken', vi: 'Những luật không bao giờ được phá' },
    lead: {
      en: 'Each one was learned by breaking something.',
      vi: 'Điều nào cũng là bài học từ một lần làm hỏng việc.',
    },
    steps: [
      {
        h: { en: 'Secrets', vi: 'Secret' },
        p: [
          {
            en: '· The sync code is typed only into the ☁️ box. `SCANNER_TOKEN` never comes down to the browser and is never typed into this app.<br>· Nothing from `.env` goes into a commit, a chat, or a screenshot.',
            vi: '· Mã đồng bộ chỉ gõ vào ô ☁️. `SCANNER_TOKEN` không bao giờ được gửi xuống trình duyệt và không bao giờ gõ vào app này.<br>· Không thứ gì trong `.env` được lọt vào commit, chat hay ảnh chụp màn hình.',
          },
        ],
      },
      {
        h: { en: 'The VM', vi: 'VM' },
        p: [
          {
            en: '· Only ONE `main.py` at a time (Telegram 409).<br>· Never touch the VM firewall — `sudo ufw enable` can lock you out of SSH for good.<br>· `crontab -e` as `ubuntu`, never `sudo crontab -e`.<br>· Back the database up with sqlite `.backup`, never `cp` (a copy taken mid-write is corrupt).<br>· Do not run `nightly.py` before `bars.py --sync --full` has filled the candle store.',
            vi: '· Mỗi lúc chỉ MỘT `main.py` (nếu không Telegram báo 409).<br>· Không bao giờ đụng vào firewall của VM — `sudo ufw enable` có thể khoá mất SSH vĩnh viễn.<br>· `crontab -e` bằng user `ubuntu`, không bao giờ `sudo crontab -e`.<br>· Sao lưu cơ sở dữ liệu bằng sqlite `.backup`, không bao giờ dùng `cp` (chép giữa lúc đang ghi là ra bản hỏng).<br>· Đừng chạy `nightly.py` khi `bars.py --sync --full` chưa nạp đủ dữ liệu nến.',
          },
        ],
      },
      {
        h: { en: 'The website', vi: 'Trang web' },
        p: [
          {
            en: '· Deploy only from `apps/desktop`.<br>· `npm ci`, and no new packages: the lock file must match or the Cloudflare build fails.<br>· Before any risky change: export a backup.',
            vi: '· Chỉ deploy từ `apps/desktop`.<br>· Dùng `npm ci` và không thêm package: file lock phải khớp, nếu không bản build trên Cloudflare sẽ hỏng.<br>· Trước mọi thay đổi rủi ro: xuất sao lưu.',
          },
        ],
      },
    ],
  },
];
