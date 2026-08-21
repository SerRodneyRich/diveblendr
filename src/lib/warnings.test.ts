import { describe, it, expect } from 'vitest'
import {
  generateGasWarnings,
  generatePlanningWarnings,
  classifyGasRole,
  applicablePPO2Limit,
  type GasAnalysis,
  type DiveMode,
} from './warnings'
import { DEFAULT_SAFETY_LIMITS, type SafetyLimits } from './limits'

const base: GasAnalysis = {
  oxygenPercent: 21,
  depthMeters: 40,
  ppo2: 1.05,
  endMeters: 40,
  densityGramsPerLiter: 5.0,
}

const analysis = (over: Partial<GasAnalysis>): GasAnalysis => ({ ...base, ...over })
const limits = (over: Partial<SafetyLimits>): SafetyLimits => ({ ...DEFAULT_SAFETY_LIMITS, ...over })

const messages = (w: { message: string }[]): string => w.map(x => x.message).join(' | ')

describe('classifyGasRole', () => {
  it('treats 50%+ oxygen as a deco gas', () => {
    expect(classifyGasRole(50, 22)).toBe('deco')
    expect(classifyGasRole(100, 6)).toBe('deco')
    expect(classifyGasRole(80, 10)).toBe('deco')
  })

  it('treats 40%+ oxygen at shallow depth as a deco gas', () => {
    expect(classifyGasRole(40, 18)).toBe('deco')
  })

  it('treats enriched-but-not-deco gas at depth as a travel gas', () => {
    expect(classifyGasRole(32, 33)).toBe('travel')
  })

  it('treats air and hypoxic mixes as working gas', () => {
    expect(classifyGasRole(21, 40)).toBe('working')
    expect(classifyGasRole(18, 60)).toBe('working')
    expect(classifyGasRole(10, 100)).toBe('working')
  })
})

describe('applicablePPO2Limit', () => {
  const L = DEFAULT_SAFETY_LIMITS

  it('uses the open-circuit working limit for a working gas on OC', () => {
    expect(applicablePPO2Limit(L, 'oc', 'working')).toBe(L.maxPPO2Work)
    expect(applicablePPO2Limit(L, 'oc-trimix', 'working')).toBe(L.maxPPO2Work)
  })

  it('uses the CCR limit for a working gas on a rebreather', () => {
    expect(applicablePPO2Limit(L, 'ccr', 'working')).toBe(L.maxPPO2CCR)
    expect(applicablePPO2Limit(L, 'ccr-trimix', 'working')).toBe(L.maxPPO2CCR)
  })

  it('uses the deco limit for a deco gas on any circuit', () => {
    for (const mode of ['oc', 'oc-trimix', 'ccr', 'ccr-trimix'] as DiveMode[]) {
      expect(applicablePPO2Limit(L, mode, 'deco')).toBe(L.maxPPO2Deco)
    }
  })
})

/**
 * F1 is specifically that these preferences were ignored. Each block below
 * changes one preference and asserts the corresponding threshold moved.
 */
describe('F1 — safety-limit preferences drive the thresholds', () => {
  describe('maxPPO2Work', () => {
    const a = analysis({ oxygenPercent: 21, depthMeters: 60, ppo2: 1.35, endMeters: 20, densityGramsPerLiter: 5.0 })

    it('does not warn at 1.35 bar when the working limit is the default 1.4', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxPPO2Work: 1.4 }))
      expect(w.filter(x => x.type !== 'info' && /PPO₂/.test(x.message))).toHaveLength(0)
    })

    it('warns at 1.35 bar when the diver lowers the working limit to 1.2', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxPPO2Work: 1.2 }))
      const ppo2Warnings = w.filter(x => x.type === 'warning' && /PPO₂/.test(x.message))
      expect(ppo2Warnings.length).toBeGreaterThan(0)
      expect(messages(ppo2Warnings)).toContain('1.2')
    })

    it('quotes the configured limit in the message rather than a hardcoded 1.4', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxPPO2Work: 1.1 }))
      expect(messages(w)).toContain('1.1')
    })
  })

  describe('maxPPO2Deco', () => {
    const a = analysis({ oxygenPercent: 50, depthMeters: 22, ppo2: 1.55, endMeters: 10, densityGramsPerLiter: 2.0 })

    it('does not raise a danger at 1.55 bar when the deco limit is 1.6', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxPPO2Deco: 1.6 }))
      expect(w.filter(x => x.type === 'danger')).toHaveLength(0)
    })

    it('raises a danger at 1.55 bar when the diver lowers the deco limit to 1.4', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxPPO2Deco: 1.4, maxPPO2Work: 1.4 }))
      expect(w.filter(x => x.type === 'danger').length).toBeGreaterThan(0)
    })
  })

  describe('maxPPO2CCR', () => {
    const a = analysis({ oxygenPercent: 18, depthMeters: 60, ppo2: 1.25, endMeters: 20, densityGramsPerLiter: 5.0 })

    it('warns on CCR at 1.25 bar when the CCR limit is the default 1.3... it does not', () => {
      const w = generateGasWarnings(a, 'ccr-trimix', limits({ maxPPO2CCR: 1.3 }))
      expect(w.filter(x => x.type === 'warning' && /PPO₂/.test(x.message))).toHaveLength(0)
    })

    it('warns on CCR at 1.25 bar once the diver lowers the CCR limit to 1.1', () => {
      const w = generateGasWarnings(a, 'ccr-trimix', limits({ maxPPO2CCR: 1.1 }))
      const ppo2 = w.filter(x => x.type === 'warning' && /PPO₂/.test(x.message))
      expect(ppo2.length).toBeGreaterThan(0)
      expect(messages(ppo2)).toContain('1.1')
    })

    it('applies the CCR limit on a rebreather but the OC limit on open circuit', () => {
      const L = limits({ maxPPO2CCR: 1.1, maxPPO2Work: 1.4 })
      const onCCR = generateGasWarnings(a, 'ccr-trimix', L)
      const onOC = generateGasWarnings(a, 'oc-trimix', L)
      expect(onCCR.filter(x => x.type === 'warning' && /PPO₂/.test(x.message)).length).toBeGreaterThan(0)
      expect(onOC.filter(x => x.type === 'warning' && /PPO₂/.test(x.message))).toHaveLength(0)
    })
  })

  describe('maxGasDensity', () => {
    const a = analysis({ oxygenPercent: 21, depthMeters: 40, ppo2: 1.05, endMeters: 40, densityGramsPerLiter: 5.5 })

    it('does not warn at 5.5 g/L when the target is the default 5.7', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxGasDensity: 5.7 }))
      expect(w.filter(x => x.type === 'warning' && /density/i.test(x.message))).toHaveLength(0)
    })

    it('warns at 5.5 g/L when the diver lowers the target to 5.0', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxGasDensity: 5.0 }))
      const d = w.filter(x => /density/i.test(x.message))
      expect(d.length).toBeGreaterThan(0)
      expect(messages(d)).toContain('5')
    })
  })

  describe('maxGasDensityCritical', () => {
    const a = analysis({ oxygenPercent: 21, depthMeters: 60, ppo2: 1.4, endMeters: 60, densityGramsPerLiter: 6.0 })

    it('does not raise a density danger at 6.0 g/L when the critical limit is 6.2', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxGasDensityCritical: 6.2 }))
      expect(w.filter(x => x.type === 'danger' && /density/i.test(x.message))).toHaveLength(0)
    })

    it('raises a density danger at 6.0 g/L once the critical limit drops to 5.5', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxGasDensity: 5.0, maxGasDensityCritical: 5.5 }))
      expect(w.filter(x => x.type === 'danger' && /density/i.test(x.message)).length).toBeGreaterThan(0)
    })
  })

  describe('maxEND', () => {
    const a = analysis({ oxygenPercent: 21, depthMeters: 35, ppo2: 0.95, endMeters: 35, densityGramsPerLiter: 4.0 })

    it('warns at END 35 m against the default 30 m limit', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxEND: 30 }))
      const e = w.filter(x => /END/.test(x.message))
      expect(e.length).toBeGreaterThan(0)
      expect(messages(e)).toContain('30')
    })

    it('stops warning once the diver raises the END limit to 40 m', () => {
      const w = generateGasWarnings(a, 'oc', limits({ maxEND: 40 }))
      expect(w.filter(x => x.type === 'warning' && /END/.test(x.message))).toHaveLength(0)
    })

    it('quotes the configured END limit, not a hardcoded 30', () => {
      const w = generateGasWarnings(analysis({ endMeters: 50 }), 'oc', limits({ maxEND: 45 }))
      expect(messages(w)).toContain('45')
    })
  })
})

describe('hypoxia warnings', () => {
  it('raises a danger below the 0.16 bar floor', () => {
    const w = generateGasWarnings(
      analysis({ oxygenPercent: 10, depthMeters: 0, ppo2: 0.1, endMeters: 0, densityGramsPerLiter: 1 }),
      'oc-trimix',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.filter(x => x.type === 'danger' && /hypox/i.test(x.message)).length).toBeGreaterThan(0)
  })

  it('raises a margin warning between 0.16 and 0.18 bar', () => {
    const w = generateGasWarnings(
      analysis({ oxygenPercent: 17, depthMeters: 0, ppo2: 0.17, endMeters: 0, densityGramsPerLiter: 1 }),
      'oc-trimix',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.filter(x => /hypoxic floor/i.test(x.message)).length).toBeGreaterThan(0)
  })

  it('stays silent for a normoxic gas', () => {
    const w = generateGasWarnings(analysis({ ppo2: 0.21, depthMeters: 0 }), 'oc', DEFAULT_SAFETY_LIMITS)
    expect(w.filter(x => /hypox/i.test(x.message))).toHaveLength(0)
  })
})

describe('generateGasWarnings — general behaviour', () => {
  it('returns no warnings for a benign gas well inside every limit', () => {
    const w = generateGasWarnings(
      analysis({ oxygenPercent: 32, depthMeters: 20, ppo2: 0.96, endMeters: 15, densityGramsPerLiter: 3.5 }),
      'oc',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w).toHaveLength(0)
  })

  it('accepts a partial limits object and fills the rest from defaults', () => {
    const w = generateGasWarnings(analysis({ endMeters: 45 }), 'oc', { maxEND: 30 })
    expect(w.length).toBeGreaterThan(0)
  })

  it('escalates severity as a value moves further past the limit', () => {
    const L = limits({ maxGasDensity: 5.0, maxGasDensityCritical: 6.0 })
    const mild = generateGasWarnings(analysis({ densityGramsPerLiter: 5.5 }), 'oc', L)
    const severe = generateGasWarnings(analysis({ densityGramsPerLiter: 6.5 }), 'oc', L)
    expect(mild.some(x => x.type === 'warning')).toBe(true)
    expect(severe.some(x => x.type === 'danger')).toBe(true)
  })

  it('never returns a warning with an empty message', () => {
    for (let ppo2 = 0.1; ppo2 <= 1.8; ppo2 += 0.1) {
      for (const density of [1, 4, 6, 8]) {
        for (const end of [0, 25, 45]) {
          const w = generateGasWarnings(
            analysis({ ppo2, densityGramsPerLiter: density, endMeters: end }),
            'oc',
            DEFAULT_SAFETY_LIMITS
          )
          for (const item of w) {
            expect(item.message.length).toBeGreaterThan(0)
            expect(['info', 'warning', 'danger']).toContain(item.type)
          }
        }
      }
    }
  })
})

describe('generatePlanningWarnings', () => {
  it('flags a target PPO2 above the diver deco limit as a danger', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 40, maxEndMeters: 30, desiredPPO2: 1.65 },
      'oc',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.some(x => x.type === 'danger')).toBe(true)
  })

  it('flags a target PPO2 above the working limit as a warning', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 40, maxEndMeters: 30, desiredPPO2: 1.5 },
      'oc',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.some(x => x.type === 'warning' && /PPO₂/.test(x.message))).toBe(true)
  })

  // F1: this path also hardcoded 1.4/1.6.
  it('respects a lowered working limit when flagging the planning target', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 40, maxEndMeters: 30, desiredPPO2: 1.25 },
      'oc',
      limits({ maxPPO2Work: 1.2 })
    )
    expect(w.some(x => /PPO₂/.test(x.message) && x.message.includes('1.2'))).toBe(true)
  })

  it('uses the CCR limit for planning on a rebreather', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 30, maxEndMeters: 30, desiredPPO2: 1.35 },
      'ccr',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.some(x => /CCR working limit/.test(x.message))).toBe(true)
  })

  it('respects a raised END limit when flagging the planning target', () => {
    const strict = generatePlanningWarnings(
      { targetModMeters: 60, maxEndMeters: 35, desiredPPO2: 1.2 },
      'oc-trimix',
      limits({ maxEND: 30 })
    )
    const relaxed = generatePlanningWarnings(
      { targetModMeters: 60, maxEndMeters: 35, desiredPPO2: 1.2 },
      'oc-trimix',
      limits({ maxEND: 40 })
    )
    expect(strict.some(x => /END/.test(x.message))).toBe(true)
    expect(relaxed.some(x => /END/.test(x.message))).toBe(false)
  })

  it('flags CCR beyond 40 m as requiring trimix', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 45, maxEndMeters: 30, desiredPPO2: 1.2 },
      'ccr',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.some(x => x.type === 'danger' && /trimix diluent/.test(x.message))).toBe(true)
  })

  it('flags the recreational air limit on open circuit', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 45, maxEndMeters: 30, desiredPPO2: 1.2 },
      'oc',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w.some(x => /recreational air limit/.test(x.message))).toBe(true)
  })

  it('returns nothing for a conservative shallow plan', () => {
    const w = generatePlanningWarnings(
      { targetModMeters: 25, maxEndMeters: 25, desiredPPO2: 1.2 },
      'oc',
      DEFAULT_SAFETY_LIMITS
    )
    expect(w).toHaveLength(0)
  })
})
