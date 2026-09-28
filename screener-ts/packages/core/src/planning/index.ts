// Barrel for the trade-planning layer (Phase 8).
export { buildTradePlan, DEFAULT_TRADE_PLAN_CONFIG } from './tradePlan.js';
export type { TradePlan, TradePlanAccount, TradePlanConfig } from './tradePlan.js';
export { explainPlan } from './narrative.js';
export type { TradeExplanation, Bilingual } from './narrative.js';

// The playbook's own market regime (4 states on SPY) — deliberately NOT the same
// thing as `momentum/marketRegime.detectRegime` (3 states on QQQ); see the file header.
export {
  detectPlaybookRegime, atrRatioOf, REGIME_MIN_BARS, ATR_EXPANDED,
} from './playbookRegime.js';
export type { PlaybookRegime, RegimeRead } from './playbookRegime.js';

// Per-setup stop/target rules, the risk ladder, and position sizing.
export {
  DEFAULT_SETUP_RULES, DEFAULT_RISK_LADDER, SETUP_KEYS, RATING_KEYS,
  isSetupKey, isRating, ratingScale, rulesFor, closedTradePnls, riskStageOf, riskBudget,
  suggestLevels, suggestSize, openRiskOf,
} from './setupPlaybook.js';
export type {
  SetupKey, SetupRule, SetupRuleOverrides, StopAnchor, TargetKind, ConvictionRating,
  RiskLadderConfig, RiskStage, StageRead, RiskBudget, RiskCut,
  LevelSuggestion, LevelWarning, SizeInput, SizeSuggestion, SizeLimit, SizeWarning,
} from './setupPlaybook.js';

// The conviction grade, scored from named criteria instead of picked from a dropdown.
export {
  gradeTrade, gradeByGroup, isAutoCriterion,
  GRADE_CRITERIA, GRADE_GROUPS, GRADE_BARS, DEFAULT_GRADE_THRESHOLDS,
} from './tradeGrader.js';
export type {
  GradeGroup, GradeCriterion, GradeEvidence, GradeAnswers,
  CriterionOutcome, GradeResult, GradeThresholds,
} from './tradeGrader.js';
