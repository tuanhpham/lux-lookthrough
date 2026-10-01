/**
 * What XLK, XLV and the rest actually are.
 *
 * The sector ranking table and the rank-history chart were a grid of four-letter
 * tickers. `XLK` is only obvious once you already know it, and "which sector is
 * leading" is precisely the question someone reading that table does NOT yet know
 * the answer to — so the table was asking the reader to bring the answer with them.
 *
 * Every entry is a fact about the fund, not an opinion: the ticker, the sector it
 * tracks, and — where it helps — the household names inside it, because "Technology"
 * and "Apple, Microsoft, Nvidia" are not equally concrete.
 *
 * `defensive` marks the three baskets money hides in. The scanner computes its own
 * defensive set and sends it in the payload; this flag is only for labelling a row
 * when the payload has not said anything, and the two must not be confused — the
 * banner on that page is driven by the payload, never by this file.
 */
import { getLang } from './i18n.js';

export interface SectorInfo {
  en: string;
  vi: string;
  /** A few holdings or sub-industries, for the tooltip. Same in both languages. */
  holds?: string;
  /** Staples, utilities, health care: where money goes when it leaves risk. */
  defensive?: boolean;
}

/**
 * The eleven S&P sector SPDRs first — those are the basket the ranking runs on —
 * then the industry and thematic funds a rotation screen commonly carries.
 */
export const SECTORS: Record<string, SectorInfo> = {
  XLK: { en: 'Technology', vi: 'Công nghệ', holds: 'Apple, Microsoft, Nvidia' },
  XLV: { en: 'Health Care', vi: 'Y tế', holds: 'Eli Lilly, UnitedHealth, J&J', defensive: true },
  XLF: { en: 'Financials', vi: 'Tài chính', holds: 'Berkshire, JPMorgan, Visa' },
  XLY: { en: 'Consumer Discretionary', vi: 'Tiêu dùng không thiết yếu', holds: 'Amazon, Tesla, Home Depot' },
  XLP: { en: 'Consumer Staples', vi: 'Tiêu dùng thiết yếu', holds: 'Costco, Walmart, P&G', defensive: true },
  XLI: { en: 'Industrials', vi: 'Công nghiệp', holds: 'GE, Caterpillar, Union Pacific' },
  XLE: { en: 'Energy', vi: 'Năng lượng', holds: 'Exxon, Chevron, ConocoPhillips' },
  XLB: { en: 'Materials', vi: 'Nguyên vật liệu', holds: 'Linde, Sherwin-Williams, Freeport' },
  XLU: { en: 'Utilities', vi: 'Dịch vụ tiện ích', holds: 'NextEra, Southern, Duke', defensive: true },
  XLRE: { en: 'Real Estate', vi: 'Bất động sản', holds: 'Prologis, American Tower, Equinix' },
  XLC: { en: 'Communication Services', vi: 'Dịch vụ truyền thông', holds: 'Meta, Alphabet, Netflix' },

  // Industry funds — narrower than a sector, and that is the point: semis lead and
  // lag the wider technology basket by weeks.
  SMH: { en: 'Semiconductors', vi: 'Bán dẫn', holds: 'Nvidia, TSMC, Broadcom' },
  IGV: { en: 'Software', vi: 'Phần mềm', holds: 'Microsoft, Salesforce, Adobe' },
  XBI: { en: 'Biotech (equal weight)', vi: 'Công nghệ sinh học (trọng số đều)' },
  IBB: { en: 'Biotech (large cap)', vi: 'Công nghệ sinh học (vốn hóa lớn)' },
  KRE: { en: 'Regional Banks', vi: 'Ngân hàng khu vực' },
  KIE: { en: 'Insurance', vi: 'Bảo hiểm' },
  ITB: { en: 'Home Construction', vi: 'Xây dựng nhà ở' },
  XHB: { en: 'Homebuilders & suppliers', vi: 'Xây nhà & vật liệu' },
  XRT: { en: 'Retail (equal weight)', vi: 'Bán lẻ (trọng số đều)' },
  XME: { en: 'Metals & Mining', vi: 'Kim loại & khai khoáng' },
  XOP: { en: 'Oil & Gas E&P', vi: 'Thăm dò & khai thác dầu khí' },
  OIH: { en: 'Oil Services', vi: 'Dịch vụ dầu khí' },
  XAR: { en: 'Aerospace & Defense', vi: 'Hàng không & quốc phòng' },
  IYT: { en: 'Transports', vi: 'Vận tải' },
  JETS: { en: 'Airlines', vi: 'Hàng không dân dụng' },
  GDX: { en: 'Gold Miners', vi: 'Khai thác vàng' },
  PAVE: { en: 'US Infrastructure', vi: 'Hạ tầng Mỹ' },
  URA: { en: 'Uranium', vi: 'Uranium' },
  TAN: { en: 'Solar', vi: 'Điện mặt trời' },
  ICLN: { en: 'Clean Energy', vi: 'Năng lượng sạch' },
  LIT: { en: 'Lithium & Battery', vi: 'Lithium & pin' },
  HACK: { en: 'Cybersecurity', vi: 'An ninh mạng' },
  SKYY: { en: 'Cloud Computing', vi: 'Điện toán đám mây' },
  FDN: { en: 'Internet', vi: 'Internet' },
  MOO: { en: 'Agribusiness', vi: 'Nông nghiệp' },
  WOOD: { en: 'Timber & Forestry', vi: 'Gỗ & lâm nghiệp' },

  // Benchmarks. They show up in a rank store as the yardstick, not as a candidate.
  SPY: { en: 'S&P 500', vi: 'S&P 500' },
  QQQ: { en: 'Nasdaq 100', vi: 'Nasdaq 100' },
  IWM: { en: 'Russell 2000 (small caps)', vi: 'Russell 2000 (vốn hóa nhỏ)' },
  DIA: { en: 'Dow 30', vi: 'Dow 30' },
  MDY: { en: 'S&P MidCap 400', vi: 'S&P MidCap 400' },
  RSP: { en: 'S&P 500 (equal weight)', vi: 'S&P 500 (trọng số đều)' },
  GLD: { en: 'Gold', vi: 'Vàng', defensive: true },
  TLT: { en: '20+ year Treasuries', vi: 'Trái phiếu Mỹ 20 năm+', defensive: true },
};

/** The fund's sector in the current language, or `null` if it is not a fund we know. */
export function sectorName(sym: string | null | undefined): string | null {
  if (!sym) return null;
  const info = SECTORS[sym.trim().toUpperCase()];
  if (!info) return null;
  return getLang() === 'vi' ? info.vi : info.en;
}

/** `XLK — Technology · Apple, Microsoft, Nvidia`, for a `title=`. */
export function sectorTip(sym: string | null | undefined): string {
  const name = sectorName(sym);
  if (!name) return sym ?? '';
  const info = SECTORS[(sym ?? '').trim().toUpperCase()];
  const t = `${(sym ?? '').toUpperCase()} — ${name}`;
  return info?.holds ? `${t} · ${info.holds}` : t;
}

/** True for the baskets money rotates INTO when it is leaving risk. */
export function isDefensive(sym: string | null | undefined): boolean {
  return !!SECTORS[(sym ?? '').trim().toUpperCase()]?.defensive;
}
