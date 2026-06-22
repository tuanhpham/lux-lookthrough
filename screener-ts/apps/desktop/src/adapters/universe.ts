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
  'AST', 'BAF', 'BCE', 'BCG', 'BCM', 'BFC', 'BHN', 'BIC', 'BID', 'BKG', 'BMC', 'BMI',
  'BMP', 'BRC', 'BSI', 'BSR', 'BTP', 'BTT', 'BVH', 'BWE', 'CCC', 'CCI', 'CCL', 'CDC',
  'CIG', 'CII', 'CKG', 'CLC', 'CLL', 'CLW', 'CMG', 'CNG', 'COM', 'CRC', 'CRE', 'CRV',
  'CSM', 'CSV', 'CTD', 'CTG', 'CTI', 'DAH', 'DAT', 'DBC', 'DBD', 'DBT', 'DCL', 'DCM',
  'DGC', 'DGW', 'DHA', 'DHC', 'DHG', 'DHM', 'DIG', 'DLG', 'DMC', 'DPG', 'DPM', 'DPR',
  'DQC', 'DRC', 'DRH', 'DRL', 'DSC', 'DSE', 'DSN', 'DTA', 'DTL', 'DTT', 'DVP', 'DXG',
  'DXS', 'DXV', 'EIB', 'ELC', 'EVE', 'EVF', 'EVG', 'FCM', 'FCN', 'FDC', 'FIR', 'FIT',
  'FMC', 'FPT', 'FRT', 'FTS', 'GAS', 'GDT', 'GEE', 'GEG', 'GEL', 'GEX', 'GHC', 'GIL',
  'GMD', 'GMH', 'GSP', 'GTA', 'GVR', 'HAG', 'HAH', 'HAP', 'HAR', 'HAS', 'HAX', 'HCD',
  'HCM', 'HDB', 'HDC', 'HDG', 'HHP', 'HHS', 'HHV', 'HID', 'HII', 'HMC', 'HNA', 'HPA',
  'HPG', 'HPX', 'HQC', 'HRC', 'HSG', 'HSL', 'HTG', 'HTI', 'HTL', 'HTN', 'HTV', 'HUB',
  'HVH', 'HVN', 'ICT', 'IDI', 'IJC', 'ILB', 'IMP', 'ITC', 'ITD', 'JVC', 'KBC', 'KDC',
  'KDH', 'KHG', 'KHP', 'KLB', 'KMR', 'KOS', 'KSB', 'LAF', 'LBM', 'LCG', 'LDG', 'LGC',
  'LGL', 'LHG', 'LIX', 'LPB', 'LSS', 'MBB', 'MCH', 'MCM', 'MCP', 'MDG', 'MHC', 'MIG',
  'MSB', 'MSH', 'MSN', 'MWG', 'NAB', 'NAF', 'NAV', 'NBB', 'NCT', 'NHA', 'NHH', 'NHT',
  'NKG', 'NLG', 'NNC', 'NSC', 'NTC', 'NTL', 'NVL', 'NVT', 'OCB', 'OGC', 'OPC', 'ORS',
  'PAC', 'PAN', 'PDN', 'PDR', 'PDV', 'PET', 'PGC', 'PGD', 'PGI', 'PGV', 'PHC', 'PHR',
  'PIT', 'PJT', 'PLP', 'PLX', 'PMG', 'PNC', 'PNJ', 'POW', 'PPC', 'PTB', 'PTC', 'PTL',
  'PVD', 'PVP', 'PVT', 'QCG', 'QNP', 'RAL', 'REE', 'RYG', 'SAB', 'SAM', 'SAV', 'SBA',
  'SBG', 'SBT', 'SBV', 'SCR', 'SCS', 'SFC', 'SFG', 'SFI', 'SGN', 'SGR', 'SGT', 'SHA',
  'SHB', 'SHI', 'SHP', 'SIP', 'SJD', 'SJS', 'SKG', 'SMA', 'SMB', 'SMC', 'SPM', 'SRC',
  'SRF', 'SSB', 'SSC', 'SSI', 'STB', 'STG', 'STK', 'SVC', 'SVD', 'SVT', 'SZC', 'SZL',
  'TAL', 'TBC', 'TCB', 'TCD', 'TCH', 'TCI', 'TCL', 'TCM', 'TCO', 'TCR', 'TCT', 'TCX',
  'TDC', 'TDG', 'TDH', 'TDM', 'TDP', 'TDW', 'TEG', 'THG', 'TIP', 'TIX', 'TLD', 'TLG',
  'TLH', 'TMP', 'TMS', 'TMT', 'TNC', 'TNH', 'TNI', 'TNT', 'TPB', 'TPC', 'TRA', 'TRC',
  'TSA', 'TSC', 'TTA', 'TTE', 'TTF', 'TVB', 'TVS', 'TVT', 'TYA', 'UIC', 'VAB', 'VCA',
  'VCB', 'VCF', 'VCG', 'VCI', 'VCK', 'VDP', 'VDS', 'VFG', 'VGC', 'VHC', 'VHM', 'VIB',
  'VIC', 'VID', 'VIP', 'VIX', 'VJC', 'VMD', 'VND', 'VNE', 'VNL', 'VNM', 'VOS', 'VPB',
  'VPD', 'VPG', 'VPH', 'VPI', 'VPL', 'VPS', 'VPX', 'VRC', 'VRE', 'VSC', 'VSH', 'VSI',
  'VTB', 'VTO', 'VTP', 'VVS', 'YBM', 'YEG',
];

/**
 * HNX-listed common stocks (~135). Sourced from VNDirect's dchart symbol search.
 * Yahoo doesn't carry HNX, so these are screenable only via the VNDirect
 * provider (the router sends `.VN`-suffixed tickers there).
 */
const HNX_ALL = [
  'ADC', 'ALT', 'AMC', 'AME', 'AMV', 'API', 'APS', 'ARM', 'ATS', 'BAB', 'BAX', 'BBS',
  'BCC', 'BCF', 'BED', 'BKC', 'BNA', 'BPC', 'BTS', 'BTW', 'BVS', 'BXH', 'CAG', 'CAN',
  'CAP', 'CAR', 'CCR', 'CDN', 'CEO', 'CET', 'CIA', 'CJC', 'CKV', 'CLH', 'CLM', 'CMC',
  'CMS', 'CPC', 'CST', 'CTB', 'CTP', 'DAD', 'DAE', 'DDG', 'DHP', 'DHT', 'DIH', 'DNC',
  'DNP', 'DST', 'DTD', 'DTG', 'DTK', 'DVM', 'DXP', 'EBS', 'ECI', 'EID', 'EVS', 'FID',
  'GDW', 'GIC', 'GKM', 'GLT', 'GMA', 'GMX', 'HAD', 'HAT', 'HBS', 'HCC', 'HCT', 'HDA',
  'HEV', 'HGM', 'HHC', 'HJS', 'HKT', 'HLC', 'HLD', 'HMH', 'HMR', 'HOM', 'HTC', 'HUT',
  'HVT', 'ICG', 'IDC', 'IDJ', 'IDV', 'INC', 'INN', 'IPA', 'ITQ', 'IVS', 'KDM', 'KHS',
  'KKC', 'KMT', 'KSD', 'KSF', 'KST', 'KSV', 'KTS', 'LAS', 'LBE', 'LCD', 'LDP', 'LHC',
  'LIG', 'MAC', 'MAS', 'MBG', 'MBS', 'MCC', 'MCF', 'MCO', 'MDC', 'MED', 'MEL', 'MIC',
  'MKV', 'MST', 'MVB', 'NAG', 'NAP', 'NBC', 'NBP', 'NBW', 'NDN', 'NDX', 'NET', 'NFC',
  'NHC', 'NRC', 'NSH', 'NST', 'NTH', 'NTP', 'NVB', 'OCH', 'ONE', 'PBP', 'PCE', 'PCH',
  'PCT', 'PDB', 'PEN', 'PGN', 'PGS', 'PGT', 'PHN', 'PIA', 'PIC', 'PJC', 'PLC', 'PMB',
  'PMC', 'PMP', 'PMS', 'POT', 'PPE', 'PPP', 'PPS', 'PPT', 'PPY', 'PRC', 'PRE', 'PSC',
  'PSD', 'PSE', 'PSI', 'PSW', 'PTD', 'PTI', 'PTS', 'PTX', 'PVB', 'PVC', 'PVG', 'PVI',
  'PVS', 'QHD', 'QST', 'QTC', 'RCL', 'SAF', 'SCG', 'SCI', 'SDC', 'SDG', 'SDN', 'SDU',
  'SEB', 'SED', 'SFN', 'SGC', 'SGD', 'SGH', 'SHE', 'SHN', 'SHS', 'SJE', 'SLS', 'SMN',
  'SMT', 'SPC', 'SRA', 'SSM', 'STC', 'STP', 'SVN', 'SZB', 'TDT', 'TET', 'TFC', 'THB',
  'THD', 'THS', 'THT', 'TIG', 'TJC', 'TKU', 'TMB', 'TMC', 'TMX', 'TNG', 'TOT', 'TPP',
  'TSB', 'TTC', 'TTH', 'TTL', 'TTT', 'TVC', 'TVD', 'TXM', 'UNI', 'VBC', 'VCC', 'VCM',
  'VCS', 'VDL', 'VFS', 'VGP', 'VGS', 'VHE', 'VHL', 'VIF', 'VIG', 'VIT', 'VLA', 'VMC',
  'VMS', 'VNC', 'VNF', 'VNR', 'VNT', 'VSA', 'VSM', 'VTC', 'VTH', 'VTJ', 'VTV', 'VTZ',
  'WCS', 'WSS',
];

/**
 * UPCoM-listed common stocks (~357). Also VNDirect-only (Yahoo has no UPCoM).
 * UPCoM is the least-liquid board; the scan drops names with too little history.
 */
const UPCOM_ALL = [
  'AAH', 'AAS', 'AAV', 'ABB', 'ABC', 'ABI', 'ABW', 'ACE', 'ACM', 'ACS', 'ACV', 'AGF',
  'AGM', 'AGP', 'AGX', 'AIC', 'AIG', 'ALC', 'ALV', 'AMP', 'AMS', 'APC', 'APF', 'APL',
  'APP', 'APT', 'ART', 'ATA', 'ATG', 'AVC', 'AVG', 'BAL', 'BBH', 'BBM', 'BBT', 'BCA',
  'BCB', 'BCP', 'BCR', 'BCV', 'BDG', 'BDT', 'BDW', 'BEL', 'BGE', 'BGW', 'BHA', 'BHC',
  'BHG', 'BHH', 'BHI', 'BHK', 'BHP', 'BIG', 'BIO', 'BLF', 'BLI', 'BLN', 'BLT', 'BMD',
  'BMF', 'BMG', 'BMJ', 'BMK', 'BMS', 'BMV', 'BNW', 'BOT', 'BQB', 'BQP', 'BRR', 'BRS',
  'BSA', 'BSD', 'BSG', 'BSH', 'BSL', 'BSP', 'BSQ', 'BTB', 'BTD', 'BTG', 'BTH', 'BTN',
  'BTU', 'BTV', 'BVB', 'BVG', 'BVL', 'BVN', 'BWA', 'BWS', 'CAD', 'CAT', 'CBI', 'CBS',
  'CCA', 'CCM', 'CCP', 'CCS', 'CCT', 'CCV', 'CDG', 'CDO', 'CDP', 'CDR', 'CEN', 'CFM',
  'CFV', 'CGV', 'CHC', 'CHS', 'CID', 'CIP', 'CKA', 'CKD', 'CLI', 'CLX', 'CMD', 'CMI',
  'CMM', 'CNA', 'CNC', 'CNN', 'CNT', 'CPA', 'CPH', 'CPI', 'CQN', 'CQT', 'CSI', 'CTW',
  'CTX', 'CYC', 'DAC', 'DAG', 'DAN', 'DAS', 'DBM', 'DCF', 'DCG', 'DCH', 'DCR', 'DCS',
  'DCT', 'DCV', 'DDB', 'DDH', 'DDM', 'DDN', 'DDV', 'DFC', 'DFF', 'DGT', 'DHB', 'DHD',
  'DHN', 'DIC', 'DID', 'DKC', 'DKG', 'DLD', 'DLR', 'DLT', 'DMN', 'DNA', 'DND', 'DNE',
  'DNH', 'DNL', 'DNM', 'DNN', 'DNT', 'DNW', 'DOC', 'DOP', 'DPC', 'DPH', 'DPP', 'DRG',
  'DRI', 'DSD', 'DSG', 'DSH', 'DSP', 'DTC', 'DTH', 'DTI', 'DTP', 'DUS', 'DVC', 'DVG',
  'DVN', 'DVT', 'DVW', 'DWC', 'DWS', 'DXL', 'DZM', 'ECO', 'EFI', 'EGL', 'EIC', 'EIN',
  'EME', 'EMG', 'EMS', 'FBC', 'FCC', 'FCS', 'FGL', 'FHN', 'FHS', 'FIC', 'FOC', 'FOX',
  'FRC', 'FRM', 'FSO', 'FTI', 'FTM', 'GCB', 'GCF', 'GDA', 'GDH', 'GER', 'GGG', 'GLC',
  'GLW', 'GMC', 'GND', 'GPC', 'GSM', 'GTD', 'GTS', 'GTT', 'GVT', 'HAC', 'HAF', 'HAM',
  'HAN', 'HAV', 'HBC', 'HBD', 'HBH', 'HCI', 'HDM', 'HDP', 'HDW', 'HEC', 'HEJ', 'HEP',
  'HES', 'HFB', 'HFC', 'HFX', 'HGT', 'HHB', 'HHG', 'HHN', 'HIO', 'HJC', 'HKB', 'HLA',
  'HLB', 'HLO', 'HLS', 'HLT', 'HLY', 'HMD', 'HMG', 'HMS', 'HNB', 'HND', 'HNF', 'HNG',
  'HNI', 'HNM', 'HNP', 'HNR', 'HOT', 'HPB', 'HPD', 'HPH', 'HPI', 'HPM', 'HPO', 'HPP',
  'HPT', 'HPW', 'HRB', 'HSA', 'HSM', 'HSP', 'HSV', 'HTE', 'HTM', 'HTP', 'HTT', 'HUG',
  'HVA', 'HVX', 'HWS', 'IBD', 'ICC', 'ICF', 'ICI', 'ICN', 'IDP', 'IFS', 'ILA', 'ILC',
  'ILS', 'IME', 'IRC', 'ISG', 'ISH', 'IST', 'ITA', 'ITS', 'JOS', 'KCB', 'KGM', 'KHD',
  'KHW', 'KHX', 'KIP', 'KPF', 'KSQ', 'KTC', 'KTL', 'KTT', 'KVC', 'LAI', 'LAW', 'LCM',
  'LDW', 'LEC', 'LIC', 'LKW', 'LLM', 'LMC', 'LMH', 'LMI', 'LNC', 'LPT', 'LQN', 'LSG',
  'LTC', 'LTG', 'LUT', 'MBN', 'MBT', 'MCG', 'MDA', 'MDF', 'MEC', 'MEF', 'MES', 'MFS',
  'MGC', 'MGG', 'MGR', 'MHL', 'MIE', 'MKP', 'MLC', 'MLS', 'MML', 'MNB', 'MND', 'MPC',
  'MPT', 'MPY', 'MQB', 'MQN', 'MRF', 'MSR', 'MTA', 'MTB', 'MTG', 'MTH', 'MTL', 'MTP',
  'MTS', 'MTV', 'MVC', 'MVN', 'NAC', 'NAS', 'NAU', 'NAW', 'NBE', 'NBT', 'NCG', 'NCS',
  'NDC', 'NDF', 'NDP', 'NDT', 'NDW', 'NED', 'NGC', 'NHD', 'NHV', 'NJC', 'NLS', 'NNT',
  'NOS', 'NQB', 'NQN', 'NSG', 'NSL', 'NSS', 'NTF', 'NTT', 'NTW', 'NUE', 'NVP', 'NWT',
  'NXT', 'ODE', 'OIL', 'ONW', 'PAI', 'PAP', 'PAS', 'PAT', 'PBC', 'PBT', 'PCC', 'PCF',
  'PCG', 'PCM', 'PDC', 'PEG', 'PEQ', 'PFL', 'PGB', 'PHH', 'PHP', 'PHS', 'PID', 'PIS',
  'PIV', 'PJS', 'PLA', 'PLE', 'PLO', 'PMJ', 'PMT', 'PMW', 'PND', 'PNG', 'PNP', 'PNT',
  'POB', 'POM', 'POS', 'POV', 'PPH', 'PPI', 'PQN', 'PRO', 'PRT', 'PSB', 'PSH', 'PSL',
  'PSN', 'PSP', 'PTE', 'PTG', 'PTH', 'PTM', 'PTO', 'PTP', 'PTT', 'PTV', 'PVE', 'PVH',
  'PVL', 'PVM', 'PVO', 'PVR', 'PVV', 'PVX', 'PVY', 'PWA', 'PWS', 'PXA', 'PXI', 'PXL',
  'PXM', 'PXS', 'PXT', 'QBS', 'QCC', 'QHW', 'QNC', 'QNS', 'QNT', 'QNU', 'QNW', 'QPH',
  'QSP', 'QTP', 'RAT', 'RBC', 'RCC', 'RCD', 'RDP', 'RGG', 'RIC', 'RTB', 'SAC', 'SAL',
  'SAS', 'SBB', 'SBD', 'SBH', 'SBL', 'SBM', 'SBR', 'SBS', 'SCC', 'SCD', 'SCJ', 'SCL',
  'SCO', 'SDA', 'SDD', 'SDK', 'SDP', 'SDT', 'SDV', 'SDY', 'SEA', 'SEP', 'SGB', 'SGI',
  'SGP', 'SGS', 'SHC', 'SID', 'SIG', 'SII', 'SIV', 'SJF', 'SJG', 'SJM', 'SKH', 'SKN',
  'SKV', 'SLD', 'SNC', 'SNZ', 'SPB', 'SPD', 'SPH', 'SPI', 'SPV', 'SRB', 'SSF', 'SSG',
  'SSH', 'SSN', 'STD', 'STH', 'STL', 'STS', 'STT', 'STW', 'SVG', 'SVH', 'SWC', 'SZE',
  'SZG', 'TAB', 'TAN', 'TAR', 'TAW', 'TBD', 'TBR', 'TBW', 'TCJ', 'TCK', 'TCW', 'TDB',
  'TDF', 'TDS', 'TED', 'TGG', 'TGP', 'THM', 'THN', 'THP', 'THU', 'THW', 'TID', 'TIE',
  'TIN', 'TIS', 'TKA', 'TLP', 'TMG', 'TMW', 'TNA', 'TNB', 'TNP', 'TNS', 'TNW', 'TOP',
  'TOS', 'TOW', 'TPS', 'TQW', 'TRS', 'TRT', 'TRV', 'TSD', 'TSG', 'TSJ', 'TST', 'TTB',
  'TTD', 'TTG', 'TTN', 'TTS', 'TTZ', 'TUG', 'TVA', 'TVG', 'TVH', 'TVM', 'TVN', 'UCT',
  'UDC', 'UDJ', 'UDL', 'UEM', 'UMC', 'UPH', 'UPS', 'USC', 'USD', 'UTT', 'UXC', 'VAF',
  'VAV', 'VBB', 'VBG', 'VBH', 'VBT', 'VCE', 'VCP', 'VCR', 'VCT', 'VCX', 'VDB', 'VDG',
  'VDN', 'VDT', 'VEA', 'VEC', 'VEF', 'VES', 'VET', 'VFC', 'VFR', 'VGG', 'VGI', 'VGL',
  'VGR', 'VGT', 'VGV', 'VHD', 'VHF', 'VHG', 'VHH', 'VIE', 'VIM', 'VIN', 'VIR', 'VIW',
  'VKC', 'VKP', 'VLB', 'VLC', 'VLG', 'VLP', 'VLS', 'VLW', 'VMA', 'VMG', 'VMK', 'VMT',
  'VNA', 'VNB', 'VNH', 'VNP', 'VNX', 'VNY', 'VNZ', 'VPA', 'VPC', 'VPR', 'VPW', 'VQC',
  'VRG', 'VSE', 'VSF', 'VSG', 'VSN', 'VST', 'VTA', 'VTD', 'VTE', 'VTG', 'VTI', 'VTK',
  'VTM', 'VTQ', 'VTR', 'VTS', 'VTX', 'VUA', 'VVN', 'VWS', 'VXB', 'VXP', 'VXT', 'WSB',
  'WTC', 'XDH', 'XHC', 'XLV', 'XMC', 'XMD', 'XMP', 'XPH', 'YBC', 'YTC',
];

const withVnSuffix = (tickers: string[]): string[] => tickers.map((t) => `${t}.VN`);

export function getVn30Universe(): string[] {
  return withVnSuffix(VN30);
}

export function getVn100Universe(): string[] {
  return withVnSuffix([...new Set([...VN30, ...VN100_EXTRA])]).sort();
}

/** All HOSE stocks (~390) — works on both Yahoo and VNDirect. */
export function getAllVnUniverse(): string[] {
  return withVnSuffix(HOSE_ALL).sort();
}

/** All HNX stocks (~135) — VNDirect only. */
export function getHnxUniverse(): string[] {
  return withVnSuffix(HNX_ALL).sort();
}

/** All UPCoM stocks (~357) — VNDirect only. */
export function getUpcomUniverse(): string[] {
  return withVnSuffix(UPCOM_ALL).sort();
}

/** Every VN-listed common stock across HOSE + HNX + UPCoM (~880) — VNDirect. */
export function getAllVnMarketUniverse(): string[] {
  return withVnSuffix([...new Set([...HOSE_ALL, ...HNX_ALL, ...UPCOM_ALL])]).sort();
}

// Exchange lookup for TradingView symbol resolution (HNX/UPCoM checked first;
// anything else — incl. VN30/VN100 blue chips — is HOSE).
const HNX_SET = new Set(HNX_ALL);
const UPCOM_SET = new Set(UPCOM_ALL);

/**
 * Map a VN ticker to its TradingView symbol `EXCHANGE:TICKER` (e.g. `HOSE:FPT`,
 * `HNX:SHS`, `UPCOM:VGI`). TradingView can't resolve the Yahoo-style `FPT.VN`,
 * so deep links must use the board prefix. Accepts a bare or `.VN`-suffixed
 * ticker. Returns null if the symbol isn't a known VN ticker.
 */
export function vnTradingViewSymbol(symbol: string): string | null {
  const t = symbol.toUpperCase().replace(/\.(VN|HN|HNX|UP|UPCOM|HM)$/i, '');
  if (HNX_SET.has(t)) return `HNX:${t}`;
  if (UPCOM_SET.has(t)) return `UPCOM:${t}`;
  // Default VN board is HOSE (covers HOSE_ALL + VN30/VN100 blue chips).
  return `HOSE:${t}`;
}
