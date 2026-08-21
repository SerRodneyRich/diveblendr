/**
 * STANDARDS CONFORMANCE SUITE
 * ===========================
 * Checks the calculation layer against published technical-diving standards
 * across every dive mode — OC nitrox, OC trimix, CCR nitrox and CCR trimix.
 *
 * This suite exists because the unit tests were all *self-consistent* and
 * still let a real defect ship: the MOD check offered air to 51 m on a CCR
 * because it applied the oxygen limit alone. Every individual function was
 * correct; nothing asserted that the combination obeys the standards a diver
 * actually plans against.
 *
 * The cases below are expressed the way an instructor would state them, not
 * the way the code happens to be factored, so they stay meaningful if the
 * implementation is refactored underneath.
 *
 * SOURCES
 * -------
 * - NOAA Diving Manual, 6th ed., Ch. 3 (oxygen exposure; 1.6 bar ceiling)
 * - IANTD / GUE standards: END 30 m working limit, N2-only narcosis model
 * - Anthony & Mitchell (2016), density 5.7 g/L recommended / 6.2 g/L maximum
 * - Agency norms for hypoxic mixes: FO2 below ~0.18 is not surface-breathable
 */

import { describe, expect, it } from 'vitest'
import { AIR, densityAtDepth, endRaw, gas, modRaw, ppo2AtDepth } from './gas'
import {
  DEFAULT_SAFETY_LIMITS,
  HYPOXIA_PPO2_FLOOR,
  normalizeSafetyLimits,
  type SafetyLimits,
} from './limits'
import { operatingDepth, narcosisDepthFor, densityDepthFor } from './operatingDepth'
import { generateRecommendations } from './recommendations/engine'
import { IMPERIAL_FORMATTER, METRIC_FORMATTER } from './units'
import {
  generateGasWarnings,
  generatePlanningWarnings,
  type GasAnalysis,
} from './warnings'

const L = DEFAULT_SAFETY_LIMITS

/** Standard mixes, named as a diver would name them. */
const MIXES = {
  air: AIR,
  ean32: gas(0.32),
  ean36: gas(0.36),
  ean50: gas(0.5),
  oxygen: gas(1.0),
  tmx2135: gas(0.21, 0.35),
  tmx1845: gas(0.18, 0.45),
  tmx1555: gas(0.15, 0.55),
  tmx1070: gas(0.1, 0.7),
  heliox2179: gas(0.21, 0.79),
} as const

/**
 * The four dive modes, with the PPO2 ceiling each one plans its bottom gas
 * against. CCR runs a fixed setpoint, which is why its ceiling is lower.
 */
const MODES = [
  { name: 'OC nitrox', ceiling: L.maxPPO2Work, trimix: false, ccr: false },
  { name: 'OC trimix', ceiling: L.maxPPO2Work, trimix: true, ccr: false },
  { name: 'CCR nitrox', ceiling: L.maxPPO2CCR, trimix: false, ccr: true },
  { name: 'CCR trimix', ceiling: L.maxPPO2CCR, trimix: true, ccr: true },
] as const

describe('standards: the reported operating depth obeys every limit at once', () => {
  // The defect that prompted this suite. Air on a rebreather is narcosis- and
  // density-limited long before oxygen becomes the constraint.
  it('does not offer air past its narcotic limit on a CCR setpoint', () => {
    const result = operatingDepth(MIXES.air, L, { ceilingPPO2: L.maxPPO2CCR })

    // Oxygen alone would allow ~51 m. That must not be the answer.
    expect(result.oxygenDepthMeters).toBeGreaterThan(50)
    expect(result.depthMeters).toBeLessThan(41)
    expect(result.limitedBy).not.toBe('oxygen')

    // END at the reported depth must respect the 30 m standard. Air is its own
    // narcosis reference, so END == depth.
    const end = endRaw(MIXES.air, result.depthMeters, L.oxygenNarcosisModel)
    expect(end).toBeLessThanOrEqual(L.maxEND)
  })

  it.each(MODES)(
    '$name: every mix is limited by whichever constraint binds first',
    ({ ceiling }) => {
      for (const [name, mix] of Object.entries(MIXES)) {
        if (mix.o2 <= 0) continue
        const r = operatingDepth(mix, L, { ceilingPPO2: ceiling })
        const shallowest = Math.min(
          r.oxygenDepthMeters,
          r.narcosisDepthMeters,
          r.densityDepthMeters
        )
        expect(r.depthMeters, `${name}: reported deeper than its tightest limit`).toBe(
          Number.isFinite(shallowest) ? shallowest : 0
        )
      }
    }
  )

  it.each(MODES)('$name: no mix breaches any of the three limits at its own depth', ({ ceiling }) => {
    for (const [name, mix] of Object.entries(MIXES)) {
      if (mix.o2 <= 0) continue
      const r = operatingDepth(mix, L, { ceilingPPO2: ceiling })
      if (r.unusable || r.depthMeters <= 0) continue

      const d = r.depthMeters
      // A metre of rounding slack: depths are floored to the metre, so the
      // limit may be fractionally exceeded by the rounding itself.
      expect(ppo2AtDepth(mix, d), `${name}: ppO2 over ceiling at ${d} m`).toBeLessThanOrEqual(
        ceiling + 0.02
      )
      expect(
        endRaw(mix, d, L.oxygenNarcosisModel),
        `${name}: END over ${L.maxEND} m at ${d} m`
      ).toBeLessThanOrEqual(L.maxEND + 1)
      expect(
        densityAtDepth(mix, d, 20),
        `${name}: density over ${L.maxGasDensity} g/L at ${d} m`
      ).toBeLessThanOrEqual(L.maxGasDensity + 0.15)
    }
  })
})

describe('standards: oxygen exposure (NOAA)', () => {
  // Textbook values every technical diver knows by heart.
  const KNOWN_MODS: Array<[string, number, number, number]> = [
    // [mix name, FO2, PPO2 ceiling, expected MOD in metres]
    ['EAN32 @ 1.4', 0.32, 1.4, 33],
    ['EAN36 @ 1.4', 0.36, 1.4, 28],
    ['EAN50 @ 1.6', 0.5, 1.6, 22],
    ['Oxygen @ 1.6', 1.0, 1.6, 6],
    ['Air @ 1.4', 0.21, 1.4, 56],
  ]

  it.each(KNOWN_MODS)('%s => %s m', (_label, fo2, ceiling, expected) => {
    const mod = Math.floor(modRaw(gas(fo2), ceiling))
    // Agency tables round to the metre; allow one metre of convention drift.
    expect(Math.abs(mod - expected)).toBeLessThanOrEqual(1)
  })

  it('never exceeds the absolute 1.6 bar ceiling on any mode', () => {
    for (const mode of MODES) {
      expect(mode.ceiling).toBeLessThanOrEqual(1.6)
    }
  })

  it('holds the CCR setpoint below the open-circuit working limit', () => {
    // A rebreather runs a constant PPO2 for the whole dive, so its setpoint is
    // conventionally more conservative than an OC bottom-gas spike.
    expect(L.maxPPO2CCR).toBeLessThanOrEqual(L.maxPPO2Work)
  })
})

describe('standards: narcosis (IANTD/GUE END 30 m)', () => {
  it('air reaches the END limit at the END limit', () => {
    // Air is the narcosis reference: its END always equals its depth.
    const d = narcosisDepthFor(MIXES.air, L.maxEND)
    expect(Math.abs(d - L.maxEND)).toBeLessThan(0.5)
  })

  it('adding helium pushes the narcotic limit deeper', () => {
    const airLimit = narcosisDepthFor(MIXES.air, L.maxEND)
    const tmx2135Limit = narcosisDepthFor(MIXES.tmx2135, L.maxEND)
    const tmx1845Limit = narcosisDepthFor(MIXES.tmx1845, L.maxEND)
    const tmx1070Limit = narcosisDepthFor(MIXES.tmx1070, L.maxEND)

    expect(tmx2135Limit).toBeGreaterThan(airLimit)
    expect(tmx1845Limit).toBeGreaterThan(tmx2135Limit)
    expect(tmx1070Limit).toBeGreaterThan(tmx1845Limit)
  })

  it('18/45 clears its whole working range on narcosis', () => {
    // 18/45 is the standard 45-75 m trimix. Narcotic fraction 0.37 against
    // air's 0.79, so END 30 m (4.0 bar) maps to 4.0 x 0.79/0.37 = 8.54 bar,
    // i.e. ~75 m. The mix is therefore narcosis-clear across its whole
    // intended range, and at 60 m its END is only ~23 m.
    const d = narcosisDepthFor(MIXES.tmx1845, L.maxEND)
    expect(d).toBeGreaterThan(70)
    expect(d).toBeLessThan(80)
    expect(endRaw(MIXES.tmx1845, 60, false)).toBeLessThan(L.maxEND)
  })

  it('heliox is never narcosis-limited under the N2-only model', () => {
    expect(narcosisDepthFor(MIXES.heliox2179, L.maxEND, false)).toBe(Infinity)
  })

  it('counting oxygen as narcotic is never less conservative', () => {
    // The NOAA/DCIEM model adds oxygen to the narcotic fraction, so it can
    // only bring the limit shallower, never deeper.
    for (const [name, mix] of Object.entries(MIXES)) {
      const n2Only = narcosisDepthFor(mix, L.maxEND, false)
      const withO2 = narcosisDepthFor(mix, L.maxEND, true)
      expect(withO2, `${name}: O2-narcotic model came out deeper`).toBeLessThanOrEqual(
        n2Only + 1e-6
      )
    }
  })
})

describe('standards: gas density (Anthony & Mitchell 2016)', () => {
  it('air passes the 5.7 g/L working limit before 40 m', () => {
    // The finding that motivated the density limit: air is already too dense
    // to be a good working gas at ordinary recreational-deep depths.
    const d = densityDepthFor(MIXES.air, L.maxGasDensity, 20)
    expect(d).toBeLessThan(40)
    expect(densityAtDepth(MIXES.air, 40, 20)).toBeGreaterThan(L.maxGasDensity)
  })

  it('helium lowers density at every depth', () => {
    const depth = 60
    const rhoAir = densityAtDepth(MIXES.air, depth, 20)
    const rho1845 = densityAtDepth(MIXES.tmx1845, depth, 20)
    const rho1070 = densityAtDepth(MIXES.tmx1070, depth, 20)
    expect(rho1845).toBeLessThan(rhoAir)
    expect(rho1070).toBeLessThan(rho1845)
  })

  it('18/45 stays under the working density limit at 60 m', () => {
    expect(densityAtDepth(MIXES.tmx1845, 60, 20)).toBeLessThanOrEqual(L.maxGasDensity)
  })

  it('the critical ceiling is never below the working limit', () => {
    expect(L.maxGasDensityCritical).toBeGreaterThanOrEqual(L.maxGasDensity)
  })

  it('colder water is denser, so it never permits a deeper limit', () => {
    const warm = densityDepthFor(MIXES.air, L.maxGasDensity, 30)
    const cold = densityDepthFor(MIXES.air, L.maxGasDensity, 4)
    expect(cold).toBeLessThanOrEqual(warm)
  })
})

describe('standards: hypoxic mixes are not surface-breathable', () => {
  const HYPOXIC = ['tmx1555', 'tmx1070'] as const

  it.each(HYPOXIC)('%s has a hypoxic ceiling below the surface', (name) => {
    const r = operatingDepth(MIXES[name], L, { ceilingPPO2: L.maxPPO2Work })
    expect(r.ceilingMeters).toBeGreaterThan(0)
    // And the ceiling is where PPO2 actually reaches the hypoxia floor.
    expect(ppo2AtDepth(MIXES[name], r.ceilingMeters)).toBeGreaterThanOrEqual(
      HYPOXIA_PPO2_FLOOR - 0.01
    )
  })

  it('normoxic mixes have no ceiling', () => {
    for (const name of ['air', 'ean32', 'ean50', 'tmx2135'] as const) {
      const r = operatingDepth(MIXES[name], L, { ceilingPPO2: L.maxPPO2Work })
      expect(r.ceilingMeters, `${name} should be surface-breathable`).toBe(0)
    }
  })

  it('a hypoxic mix with a real window is usable between ceiling and limit', () => {
    // EAN8: breathable from 10 m (ppO2 hits 0.16) down to 24 m, where narcosis
    // binds. A narrow but genuine window, so this is usable — not a defect.
    const r = operatingDepth(gas(0.08, 0.0), L, { ceilingPPO2: L.maxPPO2Work })
    expect(r.ceilingMeters).toBeGreaterThan(0)
    expect(r.depthMeters).toBeGreaterThan(r.ceilingMeters)
    expect(r.unusable).toBe(false)
  })

  it('flags a mix with no window at all as unusable', () => {
    // Tighten END until the narcotic limit rises above the hypoxic ceiling:
    // the gas cannot be taken deep enough to become breathable without
    // exceeding its own narcosis limit on the way.
    const tight = normalizeSafetyLimits({ ...L, maxEND: 20 })
    const r = operatingDepth(gas(0.06, 0.0), tight, { ceilingPPO2: L.maxPPO2Work })
    expect(r.ceilingMeters).toBeGreaterThan(r.depthMeters)
    expect(r.unusable).toBe(true)
  })
})

describe('standards: conservatism invariants hold for any diver preferences', () => {
  // Rather than a handful of examples, sweep the whole configurable space.
  const PPO2_SET = [1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6]
  const END_SET = [20, 25, 30, 40, 50, 60]
  const DENSITY_SET = [4.0, 5.0, 5.7, 6.2]

  it('a tighter limit never yields a deeper operating depth', () => {
    for (const [name, mix] of Object.entries(MIXES)) {
      if (mix.o2 <= 0) continue
      let previous = Infinity
      for (const end of [...END_SET].sort((a, b) => a - b)) {
        const limits: SafetyLimits = normalizeSafetyLimits({ ...L, maxEND: end })
        const r = operatingDepth(mix, limits, { ceilingPPO2: L.maxPPO2Work })
        // Sorted ascending: a larger END allowance must not go shallower.
        if (previous !== Infinity) {
          expect(r.depthMeters, `${name}: END ${end} went shallower than a tighter END`).toBeGreaterThanOrEqual(
            previous - 1e-9
          )
        }
        previous = r.depthMeters
      }
    }
  })

  it('a lower PPO2 ceiling never yields a deeper operating depth', () => {
    for (const [name, mix] of Object.entries(MIXES)) {
      if (mix.o2 <= 0) continue
      let previous = 0
      for (const ppo2 of PPO2_SET) {
        const r = operatingDepth(mix, L, { ceilingPPO2: ppo2 })
        expect(r.depthMeters, `${name}: ppO2 ${ppo2} went shallower than a lower ceiling`).toBeGreaterThanOrEqual(
          previous - 1e-9
        )
        previous = r.depthMeters
      }
    }
  })

  it('a tighter density limit never yields a deeper operating depth', () => {
    for (const [name, mix] of Object.entries(MIXES)) {
      if (mix.o2 <= 0) continue
      let previous = 0
      for (const density of DENSITY_SET) {
        const limits = normalizeSafetyLimits({
          ...L,
          maxGasDensity: density,
          maxGasDensityCritical: Math.max(density, L.maxGasDensityCritical),
        })
        const r = operatingDepth(mix, limits, { ceilingPPO2: L.maxPPO2Work })
        expect(r.depthMeters, `${name}: density ${density} went shallower than a tighter one`).toBeGreaterThanOrEqual(
          previous - 1e-9
        )
        previous = r.depthMeters
      }
    }
  })

  it('every operating depth is a whole metre, floored', () => {
    for (const mode of MODES) {
      for (const [name, mix] of Object.entries(MIXES)) {
        if (mix.o2 <= 0) continue
        const r = operatingDepth(mix, L, { ceilingPPO2: mode.ceiling })
        if (!Number.isFinite(r.depthMeters)) continue
        expect(
          Number.isInteger(r.depthMeters),
          `${mode.name}/${name}: ${r.depthMeters} is not a whole metre`
        ).toBe(true)
      }
    }
  })
})

describe('standards: reporting a shallower depth must not suppress warnings', () => {
  // A trap worth a permanent test. Clamping the analysis depth to the
  // operating depth makes every gas evaluate as clean by construction: the
  // depth was chosen *because* it satisfies the limits, so END and density
  // always come back inside them and the warnings vanish. The safety fix would
  // then hide the very breaches it exists to surface.
  it('still warns about density at the depth the diver asked for', () => {
    const strict = normalizeSafetyLimits({
      ...L,
      maxGasDensity: 4.2,
      maxGasDensityCritical: 4.5,
    })
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 40,
        bottomTimeMinutes: 20,
        desiredPPO2: 1.4,
        maxEndMeters: L.maxEND,
      },
      strict
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')
    expect(bottom).toBeDefined()
    expect(
      bottom!.warnings.some((w) => /density/i.test(w.message)),
      'density breach at the requested depth was silently dropped'
    ).toBe(true)
  })

  it('reports an operating depth shallower than the requested depth rather than hiding it', () => {
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 40,
        bottomTimeMinutes: 20,
        desiredPPO2: 1.4,
        maxEndMeters: L.maxEND,
      },
      normalizeSafetyLimits({ ...L, maxGasDensity: 4.2, maxGasDensityCritical: 4.5 })
    )
    const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')!
    // The gas cannot legally reach 40 m under this density limit, and the
    // analysis must say so rather than quietly re-scoping the dive.
    expect(bottom.analysis.operatingDepthMeters).toBeLessThan(40)
    expect(bottom.analysis.limitedBy).not.toBe('oxygen')
  })
})

describe('standards: gas recommendations respect every limit', () => {
  it('never recommends air for a dive deeper than air may be dived', () => {
    // Air's oxygen MOD is 56 m, but narcosis binds it to 30 m. Recommending it
    // for a 50 m dive because ppO2 allows it was the engine's version of the
    // same defect.
    for (const depth of [35, 40, 45, 50]) {
      const set = generateRecommendations(
        {
          mode: 'oc',
          targetDepthMeters: depth,
          bottomTimeMinutes: 20,
          desiredPPO2: 1.4,
          maxEndMeters: L.maxEND,
        },
        L
      )
      const air = set.recommendations.find((r) => r.id === 'air')
      expect(air, `air was recommended for a ${depth} m dive`).toBeUndefined()
    }
  })

  it('recommends air only where it is genuinely within every limit', () => {
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 25,
        bottomTimeMinutes: 20,
        desiredPPO2: 1.4,
        maxEndMeters: L.maxEND,
      },
      L
    )
    const air = set.recommendations.find((r) => r.id === 'air')
    expect(air).toBeDefined()
    const r = operatingDepth(AIR, L, { ceilingPPO2: L.maxPPO2Work })
    expect(r.depthMeters).toBeGreaterThanOrEqual(25)
  })

  it('a bottom gas that cannot reach the planned depth is never offered silently', () => {
    // Trimix modes must produce a gas that genuinely reaches the depth. Nitrox
    // modes have no helium to trade, so at depth they legitimately cannot —
    // but then the diver must be told, loudly, rather than handed a gas that
    // narcosis binds 14 m shallower with nothing on screen to say so.
    for (const mode of ['oc', 'oc-trimix', 'ccr', 'ccr-trimix'] as const) {
      for (const depth of [30, 45, 60]) {
        const set = generateRecommendations(
          {
            mode,
            targetDepthMeters: depth,
            bottomTimeMinutes: 20,
            desiredPPO2: 1.3,
            maxEndMeters: L.maxEND,
          },
          L
        )
        const ceiling = mode.startsWith('ccr') ? L.maxPPO2CCR : L.maxPPO2Work
        for (const rec of set.recommendations) {
          if (rec.role !== 'bottom' && rec.role !== 'diluent') continue
          const r = operatingDepth(rec.mix, L, { ceilingPPO2: ceiling })
          if (r.depthMeters >= depth) continue

          // Short of the planned depth: a danger-level warning is mandatory.
          const warned = set.planningWarnings.some(
            (w) => w.type === 'danger' && /reaches only/i.test(w.message)
          )
          expect(
            warned,
            `${mode} ${depth} m: ${rec.title} only reaches ${r.depthMeters} m (${r.limitedBy}) with no warning`
          ).toBe(true)
        }
      }
    }
  })

  it('tells a nitrox diver that a deep dive needs trimix', () => {
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 45,
        bottomTimeMinutes: 20,
        desiredPPO2: 1.3,
        maxEndMeters: L.maxEND,
      },
      L
    )
    const warning = set.planningWarnings.find((w) => /reaches only/i.test(w.message))
    expect(warning).toBeDefined()
    expect(warning!.type).toBe('danger')
    expect(warning!.message).toMatch(/trimix/i)
  })

  it('a trimix mode produces a bottom gas that does reach the depth', () => {
    for (const depth of [45, 60]) {
      const set = generateRecommendations(
        {
          mode: 'oc-trimix',
          targetDepthMeters: depth,
          bottomTimeMinutes: 20,
          desiredPPO2: 1.3,
          maxEndMeters: L.maxEND,
        },
        L
      )
      const bottom = set.recommendations.find((r) => r.id === 'optimised-bottom')
      if (!bottom) continue
      const r = operatingDepth(bottom.mix, L, { ceilingPPO2: L.maxPPO2Work })
      expect(
        r.depthMeters,
        `trimix ${depth} m: bottom gas only reaches ${r.depthMeters} m (${r.limitedBy})`
      ).toBeGreaterThanOrEqual(depth)
    }
  })
})

describe('standards: mode-appropriate gas selection', () => {
  it('a nitrox mode gas carries no helium', () => {
    for (const name of ['air', 'ean32', 'ean36', 'ean50'] as const) {
      expect(MIXES[name].he).toBe(0)
    }
  })

  it('CCR runs shallower than OC on the same gas, because its setpoint is lower', () => {
    for (const [name, mix] of Object.entries(MIXES)) {
      if (mix.o2 <= 0) continue
      const oc = operatingDepth(mix, L, { ceilingPPO2: L.maxPPO2Work })
      const ccr = operatingDepth(mix, L, { ceilingPPO2: L.maxPPO2CCR })
      expect(ccr.depthMeters, `${name}: CCR came out deeper than OC`).toBeLessThanOrEqual(
        oc.depthMeters
      )
    }
  })

  it('trimix reaches deeper than the nitrox equivalent at the same FO2', () => {
    // 21/35 vs air: same oxygen, so the same oxygen limit — but helium buys
    // narcotic and density headroom, so the usable depth must be greater.
    const air = operatingDepth(MIXES.air, L, { ceilingPPO2: L.maxPPO2Work })
    const tmx = operatingDepth(MIXES.tmx2135, L, { ceilingPPO2: L.maxPPO2Work })
    expect(tmx.depthMeters).toBeGreaterThan(air.depthMeters)
  })
})

/**
 * C1 — warning text speaks the diver's units.
 *
 * The bug this guards: `generateGasWarnings` wrote "END 39 m exceeds your
 * limit of 30 m" on a page whose result cards read 128 ft, and two pages
 * carried a footnote apologising for it. A metric-only assertion cannot catch
 * that, because metric was always right — the imperial path is the one that
 * was broken, so it is asserted here explicitly.
 *
 * Expectations are re-derived from the foot's exact definition (0.3048 m),
 * not read off what the formatter currently prints.
 */
describe('C1: messages are written in the diver\'s units', () => {
  const airAt50m: GasAnalysis = {
    oxygenPercent: 21,
    depthMeters: 50,
    ppo2: 1.26,
    endMeters: 50,
    densityGramsPerLiter: 7.5,
  }

  it('states an END breach in feet for an imperial diver', () => {
    const warnings = generateGasWarnings(airAt50m, 'oc', {}, IMPERIAL_FORMATTER)
    const end = warnings.find((w) => /END/.test(w.message))
    expect(end).toBeDefined()
    // 50 m = 164.04 ft; the 30 m default limit = 98.43 ft.
    expect(end!.message).toContain('164 ft')
    expect(end!.message).toContain('98 ft')
    expect(end!.message).not.toMatch(/\bm\b/)
  })

  it('states a density breach in lb/ft³ for an imperial diver', () => {
    const warnings = generateGasWarnings(airAt50m, 'oc', {}, IMPERIAL_FORMATTER)
    const density = warnings.find((w) => /density/i.test(w.message))
    expect(density).toBeDefined()
    expect(density!.message).toContain('lb/ft³')
    expect(density!.message).not.toContain('g/L')
  })

  it('leaves ppO₂ in bar for an imperial diver — every agency states it in bar', () => {
    const hot: GasAnalysis = {
      oxygenPercent: 32,
      depthMeters: 45,
      ppo2: 1.76,
      endMeters: 45,
      densityGramsPerLiter: 6.9,
    }
    const warnings = generateGasWarnings(hot, 'oc', {}, IMPERIAL_FORMATTER)
    const ppo2 = warnings.find((w) => /PPO₂/.test(w.message))
    expect(ppo2).toBeDefined()
    expect(ppo2!.message).toContain('bar')
  })

  it('writes the fixed depth-band advisories in feet too', () => {
    const warnings = generatePlanningWarnings(
      { targetModMeters: 45, maxEndMeters: 30, desiredPPO2: 1.3 },
      'oc',
      {},
      IMPERIAL_FORMATTER
    )
    const band = warnings.find((w) => /recreational air limit/.test(w.message))
    expect(band).toBeDefined()
    // The 40 m threshold itself is agency practice and stays fixed; only how
    // it is written follows the diver. 40 m = 131.23 ft.
    expect(band!.message).toContain('131 ft')
    expect(band!.message).not.toContain('40 m')
  })

  it('defaults to metric when no formatter is supplied, so nothing else changed', () => {
    const withDefault = generateGasWarnings(airAt50m, 'oc', {})
    const explicitMetric = generateGasWarnings(airAt50m, 'oc', {}, METRIC_FORMATTER)
    expect(withDefault.map((w) => w.message)).toEqual(explicitMetric.map((w) => w.message))
    expect(withDefault.some((w) => w.message.includes(' m'))).toBe(true)
  })

  it('writes the engine\'s "reaches only" warning in feet', () => {
    // OC nitrox at 45 m: no helium to trade, so narcosis binds the optimised
    // mix well short of the planned depth and the engine says so at top level.
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 45,
        maxEndMeters: 30,
        desiredPPO2: 1.3,
        bottomTimeMinutes: 20,
        units: IMPERIAL_FORMATTER,
      },
      {}
    )
    const warning = set.planningWarnings.find((w) => /reaches only/i.test(w.message))
    expect(warning).toBeDefined()
    expect(warning!.message).toContain('ft')
    // 45 m = 147.6 ft — the planned depth must be restated in feet as well.
    expect(warning!.message).toContain('148 ft')
    expect(warning!.message).not.toMatch(/\d+ m\b/)
  })

  it('writes engine rationale in feet', () => {
    const set = generateRecommendations(
      {
        mode: 'oc',
        targetDepthMeters: 30,
        maxEndMeters: 30,
        desiredPPO2: 1.4,
        bottomTimeMinutes: 20,
        units: IMPERIAL_FORMATTER,
      },
      {}
    )
    const air = set.recommendations.find((r) => r.id === 'air')
    expect(air).toBeDefined()
    expect(air!.rationale).toContain('ft')
    expect(air!.rationale).not.toMatch(/\d+ m\b/)
  })
})

describe('a hypoxic mix is never reported as breathable at the surface', () => {
  const air = (o2: number) => ({ o2, he: 0, n2: 1 - o2 })

  it('gives every sub-18% mix a real hypoxic ceiling', () => {
    // 16% was reported with a ceiling of 0 m — breathable on the boat. The
    // check used HYPOXIA_PPO2_FLOOR (0.16 bar), which is the depth at which a
    // diver loses consciousness, not the depth at which a gas becomes
    // breathable. At sea level 16% oxygen *is* 0.16 bar, so it sat exactly on
    // the threshold and passed.
    for (const percent of [14, 15, 16, 17]) {
      const result = operatingDepth(air(percent / 100), DEFAULT_SAFETY_LIMITS, {
        ceilingPPO2: 1.4,
      })
      expect(result.ceilingMeters, `${percent}% must not be surface-breathable`).toBeGreaterThan(0)
    }
  })

  it('leaves normoxic mixes with no ceiling', () => {
    // 18% is the normoxic boundary every technical agency draws, and the whole
    // point of a normoxic mix is that it needs no travel gas.
    for (const percent of [18, 19, 21, 32]) {
      const result = operatingDepth(air(percent / 100), DEFAULT_SAFETY_LIMITS, {
        ceilingPPO2: 1.4,
      })
      expect(result.ceilingMeters, `${percent}% is normoxic`).toBe(0)
    }
  })

  it('warns in words a diver can act on, and says who it is for', () => {
    const warnings = generateGasWarnings(
      {
        oxygenPercent: 16,
        depthMeters: 30,
        ppo2: 0.64,
        endMeters: 25,
        densityGramsPerLiter: 3,
      },
      'oc',
      {}
    )
    const hypoxic = warnings.find((w) => /hypoxic at the surface/.test(w.message))
    expect(hypoxic, 'expected a surface-hypoxia warning').toBeDefined()
    expect(hypoxic!.type).toBe('danger')
    expect(hypoxic!.message).toMatch(/travel gas/)
    expect(hypoxic!.message).toMatch(/trained technical divers/)
  })

  it('does not fire on a normoxic mix breathed deep', () => {
    // The surface check must be about the surface. A 21% mix at 40 m has a
    // perfectly good ppO2 and must not be called hypoxic.
    const warnings = generateGasWarnings(
      {
        oxygenPercent: 21,
        depthMeters: 40,
        ppo2: 1.05,
        endMeters: 40,
        densityGramsPerLiter: 5,
      },
      'oc',
      {}
    )
    expect(warnings.some((w) => /hypoxic at the surface/.test(w.message))).toBe(false)
  })
})
