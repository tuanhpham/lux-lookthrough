import { SECTOR_STOCKS } from '@screener/core';
import { http, isTauri } from './http.js';

/**
 * US equity universes, in three sizes:
 *
 *  - curated   (~543)  : the bundled SECTOR_STOCKS — instant, no network.
 *  - broad     (~1500) : S&P 500 + 400 + 600 constituents from Wikipedia.
 *  - all     (~6000+)  : every common stock listed on NASDAQ + NYSE + AMEX,
 *                        from the official NASDAQ Trader symbol directory files.
 *
 * Desktop (Tauri) fetches the sources directly via the Rust HTTP layer; the web
 * build routes through same-origin `/api/wiki` and `/api/nasdaqtrader` proxies
 * (added to the Vite dev server and the Cloudflare functions) to avoid CORS.
 */
const WIKI_PAGES = [
  'List_of_S%26P_500_companies',
  'List_of_S%26P_400_companies',
  'List_of_S%26P_600_companies',
];

const CURATED = [...new Set(Object.values(SECTOR_STOCKS).flat())];

let broadCache: string[] | null = null;
let allCache: string[] | null = null;

function wikiBase(): string {
  return isTauri() ? 'https://en.wikipedia.org/wiki' : '/api/wiki';
}
function nasdaqBase(): string {
  // NASDAQ Trader serves the symbol-directory files over plain HTTP/HTTPS.
  return isTauri()
    ? 'https://www.nasdaqtrader.com/dynamic/SymDir'
    : '/api/nasdaqtrader';
}

/** Pull tickers from the first column of the `constituents` table. */
function parseTickers(html: string): string[] {
  const start = html.indexOf('id="constituents"');
  if (start < 0) return [];
  const slice = html.slice(start, html.indexOf('</table>', start));
  const out: string[] = [];
  for (const row of slice.split('<tr>').slice(2)) {
    const cell = row.split('</td>')[0] ?? '';
    // The ticker is the first column's link text; tolerate attributes/markup.
    const m = cell.match(/>([A-Z][A-Z.]{0,6})<\/a>/) ?? cell.match(/>([A-Z]{1,6}(?:\.[A-Z])?)</);
    if (m && m[1]) out.push(m[1].replace(/\./g, '-')); // BRK.B → BRK-B (Yahoo style)
  }
  return out;
}

export async function getBroadUniverse(): Promise<string[]> {
  if (broadCache) return broadCache;
  const all = new Set<string>(CURATED); // always include curated names
  let anyParsed = false;
  for (const page of WIKI_PAGES) {
    try {
      const html = await http().getText(`${wikiBase()}/${page}`);
      const tickers = parseTickers(html);
      if (tickers.length > 50) {
        anyParsed = true;
        for (const t of tickers) all.add(t);
      }
    } catch {
      /* skip this page */
    }
  }
  const result = [...all].sort();
  // Only cache a genuinely broad result; otherwise allow a later retry.
  if (anyParsed) broadCache = result;
  return result;
}

// ── Full market (NASDAQ Trader symbol directory) ────────────────────────────

/**
 * Is this a "real" common stock we want to scan? We drop:
 *  - test issues
 *  - ETFs (the pattern engine is for individual equities)
 *  - rights/warrants/units/preferreds (5-char tickers ending in R/W/U/P and the
 *    "$"/"." preferred notations)
 * This trims the raw ~12k directory lines to a clean common-stock universe.
 */
function keepName(name: string): boolean {
  return !/\b(ETF|ETN|Warrant|Right|Unit|Preferred|Depositary|Notes?|Trust Units)\b/i.test(name);
}

/** Yahoo uses '-' where the directory uses '.'/'$' for share classes/preferreds. */
function normalizeSymbol(sym: string): string | null {
  const s = sym.trim().toUpperCase();
  if (!s) return null;
  // Skip preferred/when-issued/test markers and anything non-alphanumeric-ish.
  if (s.includes('$')) return null; // preferred series — not on Yahoo cleanly
  if (/[^A-Z0-9.\-]/.test(s)) return null;
  return s.replace(/\./g, '-'); // BRK.B → BRK-B
}

/** Parse a NASDAQ Trader pipe-delimited file into kept common-stock tickers. */
function parseNasdaqFile(text: string, kind: 'nasdaq' | 'other'): string[] {
  const lines = text.split('\n');
  if (!lines.length) return [];
  const header = lines[0]!.split('|').map((h) => h.trim());
  const col = (name: string) => header.findIndex((h) => h.toLowerCase() === name.toLowerCase());

  // Column names differ between the two files.
  const symIdx = kind === 'nasdaq' ? col('Symbol') : col('ACT Symbol');
  const nameIdx = col('Security Name');
  const testIdx = col('Test Issue');
  const etfIdx = col('ETF');
  if (symIdx < 0) return [];

  const out: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const raw = lines[i]!.replace(/\r$/, '');
    if (!raw || raw.startsWith('File Creation Time')) continue;
    const f = raw.split('|');
    const sym = f[symIdx];
    if (!sym) continue;
    if (testIdx >= 0 && f[testIdx]?.trim() === 'Y') continue; // test issue
    if (etfIdx >= 0 && f[etfIdx]?.trim() === 'Y') continue; // ETF
    const secName = nameIdx >= 0 ? (f[nameIdx] ?? '') : '';
    if (secName && !keepName(secName)) continue;
    const norm = normalizeSymbol(sym);
    if (norm) out.push(norm);
  }
  return out;
}

/**
 * The full investable US common-stock universe (~6000+) from NASDAQ Trader.
 * Falls back to the broad (S&P 1500) universe if both files fail to load.
 */
export async function getAllUsUniverse(): Promise<string[]> {
  if (allCache) return allCache;
  const all = new Set<string>();
  let anyParsed = false;

  const files: [string, 'nasdaq' | 'other'][] = [
    ['nasdaqlisted.txt', 'nasdaq'],
    ['otherlisted.txt', 'other'],
  ];
  for (const [file, kind] of files) {
    try {
      const text = await http().getText(`${nasdaqBase()}/${file}`);
      const tickers = parseNasdaqFile(text, kind);
      if (tickers.length > 100) {
        anyParsed = true;
        for (const t of tickers) all.add(t);
      }
    } catch {
      /* skip this file */
    }
  }

  if (!anyParsed) {
    // Network/parse failure → degrade gracefully to the S&P 1500.
    return getBroadUniverse();
  }
  // Always include the curated names (some niche tickers help coverage).
  for (const t of CURATED) all.add(t);
  const result = [...all].sort();
  allCache = result;
  return result;
}

export function curatedUniverse(): string[] {
  return [...CURATED].sort();
}

// ── Vietnam (HOSE) ───────────────────────────────────────────────────────────
//
// Yahoo Finance serves Vietnamese equities under a `.VN` suffix (e.g. FPT.VN),
// priced in VND, via the SAME chart endpoint used for US names — so the screener
// math works unchanged. There is no free, CORS-friendly listing directory for
// HOSE (the US path scrapes Wikipedia / NASDAQ Trader), so we bundle curated
// constituent lists instead. Any ticker Yahoo can't resolve is simply dropped by
// the scan, so an occasional stale name is harmless.

/** VN30 — the 30 largest, most liquid HOSE blue chips. */
const VN30 = [
  'ACB', 'BCM', 'BID', 'BVH', 'CTG', 'FPT', 'GAS', 'GVR', 'HDB', 'HPG',
  'MBB', 'MSN', 'MWG', 'PLX', 'POW', 'SAB', 'SHB', 'SSB', 'SSI', 'STB',
  'TCB', 'TPB', 'VCB', 'VHM', 'VIB', 'VIC', 'VJC', 'VNM', 'VPB', 'VRE',
];

/** VN30 + ~65 additional liquid HOSE large/mid caps (~VN100 coverage). */
const VN100_EXTRA = [
  'AAA', 'ANV', 'BMP', 'BSI', 'BWE', 'CII', 'CMG', 'CTD', 'CTR', 'DBC',
  'DCM', 'DGC', 'DGW', 'DHC', 'DIG', 'DPM', 'DXG', 'EIB', 'EVF', 'FRT',
  'FTS', 'GEX', 'GMD', 'HAG', 'HCM', 'HDC', 'HDG', 'HHV', 'HSG', 'HT1',
  'IDC', 'IJC', 'IMP', 'KBC', 'KDH', 'LPB', 'NKG', 'NLG', 'NT2', 'OCB',
  'PAN', 'PC1', 'PDR', 'PHR', 'PNJ', 'PPC', 'PTB', 'PVD', 'PVT', 'REE',
  'SBT', 'SCS', 'SIP', 'SJS', 'SZC', 'TCH', 'VCG', 'VCI', 'VGC', 'VHC',
  'VND', 'VPI', 'VSC',
];

/**
 * Every common stock listed on HOSE (Yahoo exchange code "VSE"), ~390 names.
 * Snapshotted from Yahoo's equity screener (exchange = VSE). This is the
 * Vietnam analogue of the US "all stocks" mode — but bundled rather than fetched
 * live, because the screener endpoint needs a POST + crumb that the simple GET
 * proxy/Tauri layer don't do. ETFs (FUE* prefix) are excluded; the pattern
 * engine is for individual equities. Yahoo only indexes HOSE — HNX and UPCoM
 * tickers don't resolve — so this is the full investable VN universe available
 * through the current (Yahoo) data layer.
 */
const HOSE_ALL = [
  'AAA', 'AAM', 'AAN', 'AAT', 'ABR', 'ABS', 'ABT', 'ACB', 'ACC', 'ACG', 'ACL', 'ADG',
  'ADP', 'ADS', 'AFX', 'AGG', 'AGR', 'ANT', 'ANV', 'APG', 'APH', 'ASG', 'ASM', 'ASP',
  'AST', 'BAF', 'BCE', 'BCM', 'BFC', 'BHN', 'BIC', 'BID', 'BKG', 'BMC', 'BMI', 'BMP',
  'BRC', 'BSI', 'BSR', 'BTP', 'BTT', 'BVH', 'BWE', 'C32', 'C47', 'CCC', 'CCI', 'CCL',
  'CDC', 'CHP', 'CIG', 'CII', 'CKG', 'CLC', 'CLL', 'CLW', 'CMG', 'CMX', 'CNG', 'COM',
  'CRC', 'CRE', 'CRV', 'CSM', 'CSV', 'CTD', 'CTF', 'CTG', 'CTI', 'CTR', 'CTS', 'CVT',
  'D2D', 'DAH', 'DAT', 'DBC', 'DBD', 'DBT', 'DC4', 'DCL', 'DCM', 'DGC', 'DGW', 'DHA',
  'DHC', 'DHG', 'DHM', 'DIG', 'DLG', 'DMC', 'DPG', 'DPM', 'DPR', 'DQC', 'DRC', 'DRH',
  'DRL', 'DSC', 'DSE', 'DSN', 'DTA', 'DTL', 'DVP', 'DXG', 'DXS', 'DXV', 'EIB', 'ELC',
  'EVE', 'EVF', 'EVG', 'FCM', 'FCN', 'FDC', 'FIR', 'FIT', 'FMC', 'FPT', 'FRT', 'FTS',
  'GAS', 'GDT', 'GEE', 'GEG', 'GEL', 'GEX', 'GHC', 'GIL', 'GMD', 'GMH',
  'GSP', 'GVR', 'HAG', 'HAH', 'HAP', 'HAR', 'HAS', 'HAX', 'HCD', 'HCM', 'HDB', 'HDC',
  'HDG', 'HHP', 'HHS', 'HHV', 'HID', 'HII', 'HMC', 'HNA', 'HPA', 'HPG', 'HPX', 'HQC',
  'HRC', 'HSG', 'HSL', 'HT1', 'HTG', 'HTI', 'HTL', 'HTN', 'HTV', 'HU1', 'HUB', 'HVH',
  'HVN', 'ICT', 'IDI', 'IJC', 'ILB', 'IMP', 'ITC', 'ITD', 'JVC', 'KBC', 'KDC', 'KDH',
  'KHG', 'KHP', 'KLB', 'KMR', 'KOS', 'KSB', 'LAF', 'LBM', 'LCG', 'LDG', 'LGL', 'LHG',
  'LIX', 'LPB', 'LSS', 'MBB', 'MCH', 'MCM', 'MCP', 'MDG', 'MHC', 'MIG', 'MSB', 'MSH',
  'MSN', 'MWG', 'NAB', 'NAF', 'NAV', 'NBB', 'NCT', 'NHA', 'NHH', 'NHT', 'NKG', 'NLG',
  'NNC', 'NO1', 'NSC', 'NT2', 'NTC', 'NTL', 'NVL', 'NVT', 'OCB', 'OGC', 'OPC', 'ORS',
  'PAC', 'PAN', 'PC1', 'PDN', 'PDR', 'PDV', 'PET', 'PGC', 'PGD', 'PGI', 'PGV', 'PHC',
  'PHR', 'PIT', 'PJT', 'PLP', 'PLX', 'PMG', 'PNJ', 'POW', 'PPC', 'PTB', 'PTC', 'PTL',
  'PVD', 'PVP', 'PVT', 'QCG', 'QNP', 'RAL', 'REE', 'RYG', 'SAB', 'SAM', 'SAV', 'SBA',
  'SBG', 'SBT', 'SBV', 'SC5', 'SCR', 'SCS', 'SFG', 'SFI', 'SGN', 'SGR', 'SGT', 'SHA',
  'SHB', 'SHI', 'SHP', 'SIP', 'SJD', 'SJS', 'SKG', 'SMA', 'SMB', 'SMC', 'SPM', 'SRC',
  'SRF', 'SSB', 'SSC', 'SSI', 'ST8', 'STB', 'STG', 'STK', 'SVC', 'SVD', 'SVT', 'SZC',
  'SZL', 'TAL', 'TBC', 'TCB', 'TCH', 'TCI', 'TCL', 'TCM', 'TCO', 'TCR', 'TCT', 'TCX',
  'TDC', 'TDG', 'TDH', 'TDM', 'TDP', 'TDW', 'TEG', 'THG', 'TIP', 'TIX', 'TLD', 'TLG',
  'TLH', 'TMP', 'TMS', 'TMT', 'TN1', 'TNC', 'TNH', 'TNI', 'TNT', 'TPB', 'TPC', 'TRA',
  'TRC', 'TSA', 'TSC', 'TTA', 'TTF', 'TV2', 'TVB', 'TVS', 'TVT', 'TYA', 'UIC', 'VAB',
  'VCA', 'VCB', 'VCF', 'VCG', 'VCI', 'VCK', 'VDP', 'VDS', 'VFG', 'VGC', 'VHC', 'VHM',
  'VIB', 'VIC', 'VID', 'VIP', 'VIX', 'VJC', 'VMD', 'VND', 'VNE', 'VNG', 'VNL', 'VNM',
  'VNS', 'VOS', 'VPB', 'VPD', 'VPG', 'VPH', 'VPI', 'VPL', 'VPS', 'VPX', 'VRC', 'VRE',
  'VSC', 'VSH', 'VSI', 'VTB', 'VTO', 'VTP', 'VVS', 'YBM', 'YEG',
];

const withVnSuffix = (tickers: string[]): string[] => tickers.map((t) => `${t}.VN`);

export function getVn30Universe(): string[] {
  return withVnSuffix(VN30);
}

export function getVn100Universe(): string[] {
  return withVnSuffix([...new Set([...VN30, ...VN100_EXTRA])]).sort();
}

export function getAllVnUniverse(): string[] {
  return withVnSuffix(HOSE_ALL).sort();
}
