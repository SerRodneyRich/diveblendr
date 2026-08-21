/**
 * Best-mix recommendation engine.
 *
 * Pure, framework-free, and tested. Import `generateRecommendations` and render
 * the returned data; never reimplement any of this in a component.
 */

export {
  analyseMix,
  ceilingFor,
  generateRecommendations,
  DEFAULT_BOTTOM_TIME_MINUTES,
  DEFAULT_WATER_TEMPERATURE_C,
  MAX_HELIUM_PERCENT,
  MAX_PLANNING_DEPTH_METERS,
} from './engine'

export { FORMULAS, num, withUnit } from './math'

export type {
  DiveMode,
  MathDerivation,
  MathStep,
  MixAnalysis,
  Recommendation,
  RecommendationFailure,
  RecommendationOrigin,
  RecommendationRequest,
  RecommendationRole,
  RecommendationSet,
} from './types'

export type { SafetyWarning, WarningSeverity } from './warningsBridge'
export { severityOrder } from './warningsBridge'
