/**
 * Thin re-export of the Phase 1 warnings module plus the one helper this
 * package needs that `src/lib/warnings.ts` does not export.
 *
 * `warnings.ts` is owned by another workstream and is read-only here, so the
 * severity ordering used to sort a warning list lives in this package rather
 * than being added there. The ordering matches `severityRank` in
 * `src/components/ui/Banner.tsx` — most serious first.
 */

import type { WarningSeverity } from '../warnings'

export {
  applicablePPO2Limit,
  classifyGasRole,
  generateGasWarnings,
  generatePlanningWarnings,
} from '../warnings'

export type {
  DiveMode,
  GasAnalysis,
  GasRole,
  PlanningParams,
  SafetyWarning,
  WarningSeverity,
} from '../warnings'

const ORDER: Record<WarningSeverity, number> = { danger: 0, warning: 1, info: 2 }

/** Sort key for a warning severity. Lower sorts first (most serious first). */
export function severityOrder(severity: WarningSeverity): number {
  return ORDER[severity] ?? 99
}
