/** Browser file-download helpers for report export (Phase 12). Mirrors the
 * Blob-download already used by the watchlist JSON export in miscTabs.ts. */

function download(content: string, filename: string, mime: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** A YYYY-MM-DD stamp for filenames. */
export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadCsv(csv: string, basename: string): void {
  download(csv, `${basename}-${dateStamp()}.csv`, 'text/csv;charset=utf-8');
}

export function downloadHtml(html: string, basename: string): void {
  download(html, `${basename}-${dateStamp()}.html`, 'text/html;charset=utf-8');
}
