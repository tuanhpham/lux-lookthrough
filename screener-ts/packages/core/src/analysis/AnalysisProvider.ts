import type { PatternResult } from '../types/signals.js';
import type { Fundamentals } from '../types/market.js';

/**
 * Optional qualitative summary provider (e.g. an LLM). SCAFFOLD ONLY — no
 * concrete implementation yet.
 *
 * Hard rule: every NUMBER comes from the DataProvider / pattern engine and is
 * passed in here. The provider only INTERPRETS the supplied data; it must never
 * invent figures. It returns STRUCTURED data, which the app renders via fixed
 * templates — never inject raw LLM HTML.
 */
export interface AnalysisInput {
  symbol: string;
  pattern: PatternResult;
  fundamentals: Fundamentals;
  /** Optional extra numeric context the caller already computed. */
  context?: Record<string, number | string | null>;
}

export interface AnalysisResult {
  summary: string;
  strengths: string[];
  risks: string[];
}

export interface AnalysisProvider {
  summarize(input: AnalysisInput): Promise<AnalysisResult>;
}
