/**
 * Zero-dependency tabular serializers for CSV and HTML reports (Phase 12).
 * Platform-agnostic — the desktop app turns these strings into downloads.
 */

/** A column definition: a key into each row, a header label, and an optional
 * value formatter (defaults to String()). */
export interface ReportColumn<T> {
  key: keyof T & string;
  label: string;
  format?: (value: T[keyof T], row: T) => string;
}

function cell<T>(row: T, col: ReportColumn<T>): string {
  const raw = row[col.key];
  if (col.format) return col.format(raw, row);
  if (raw == null) return '';
  return String(raw);
}

/** RFC-4180-ish CSV escaping: quote when the value has a comma, quote, or newline. */
function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Serialize rows to CSV (header row + one row per item). */
export function toCsv<T>(rows: readonly T[], columns: readonly ReportColumn<T>[]): string {
  const head = columns.map((c) => csvEscape(c.label)).join(',');
  const body = rows.map((r) => columns.map((c) => csvEscape(cell(r, c))).join(','));
  return [head, ...body].join('\r\n');
}

function htmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface HtmlReportOptions {
  /** Document <title> and <h1>. */
  title?: string;
  /** Optional subtitle / generated-at line under the title. */
  subtitle?: string;
}

/**
 * A self-contained, styled HTML report (a full document with inline CSS, dark
 * theme to match the app). Suitable for download or email.
 */
export function toHtmlTable<T>(
  rows: readonly T[],
  columns: readonly ReportColumn<T>[],
  opts: HtmlReportOptions = {},
): string {
  const title = htmlEscape(opts.title ?? 'Report');
  const sub = opts.subtitle ? `<p class="sub">${htmlEscape(opts.subtitle)}</p>` : '';
  const head = columns.map((c) => `<th>${htmlEscape(c.label)}</th>`).join('');
  const body = rows
    .map(
      (r) => `<tr>${columns.map((c) => `<td>${htmlEscape(cell(r, c))}</td>`).join('')}</tr>`,
    )
    .join('');

  return `<!doctype html>
<html><head><meta charset="utf-8"><title>${title}</title>
<style>
  :root { color-scheme: dark; }
  body { background:#07080b; color:#e9edf4; font:14px/1.5 'Hanken Grotesk',system-ui,sans-serif; margin:0; padding:32px; }
  h1 { font-size:22px; letter-spacing:-.03em; margin:0 0 4px; }
  .sub { color:#99a2b2; margin:0 0 20px; }
  table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; }
  th,td { text-align:left; padding:9px 11px; border-bottom:1px solid #1d222c; }
  th { color:#5c6575; font-size:11px; text-transform:uppercase; letter-spacing:.06em; }
  td { font-family:'JetBrains Mono',ui-monospace,monospace; font-size:13px; }
  tbody tr:hover { background:#12161d; }
  .foot { color:#5c6575; font-size:11px; margin-top:20px; }
</style></head>
<body>
  <h1>${title}</h1>${sub}
  <table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>
  <p class="foot">Educational use only. Not financial advice.</p>
</body></html>`;
}
