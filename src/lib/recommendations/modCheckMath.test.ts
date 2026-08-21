import { describe, expect, it } from 'vitest'
import { modCheckDerivation } from './modCheckMath'
import { operatingDepth } from '../operatingDepth'
import { DEFAULT_SAFETY_LIMITS } from '../limits'
import { densityAtDepth, endRaw, modRaw, ppo2AtDepth } from '../gas'
import type { GasFractions } from '../gas'

/** Builds the derivation the page would build, for a mix and a ppO2 ceiling. */
function derive(mix: GasFractions, ceilingPPO2: number, label = 'Test mix') {
  const operating = operatingDepth(mix, DEFAULT_SAFETY_LIMITS, { ceilingPPO2 })
  const depth = operating.depthMeters
  return modCheckDerivation({
    mix,
    label,
    limits: DEFAULT_SAFETY_LIMITS,
    operating,
    workingPPO2: ceilingPPO2,
    oxygenModRaw: modRaw(mix, ceilingPPO2),
    endAtWorkingMod: endRaw(mix, depth),
    densityAtWorkingMod: densityAtDepth(mix, depth, 20),
    temperatureC: 20,
    hypoxicFloor: operating.ceilingMeters,
    isHypoxic: operating.ceilingMeters > 0,
    cns: { percent: 4.8, limitMinutes: 180 },
    plannedMinutes: 20,
    ppo2AtWorkingMod: ppo2AtDepth(mix, depth),
  })
}

const AIR: GasFractions = { o2: 0.21, he: 0, n2: 0.79 }

describe('the MOD-check derivation shows the competing limits', () => {
  it('states all three candidate depths and which one wins', () => {
    // Air on a 1.30 bar CCR setpoint is the case the whole operating-depth
    // rule exists for: oxygen alone allows 51 m, narcosis binds at 30 m.
    const d = derive(AIR, 1.3, 'Air')
    const compare = d.steps.find((s) => s.label === 'Which limit binds')

    expect(compare, 'expected a comparison step').toBeDefined()
    expect(compare!.result).toContain('30')
    expect(compare!.note).toMatch(/Narcosis \(END\) binds first at 30 m/)
    // The losers are named with their own depths, so a diver can check why
    // they did not bind rather than taking it on trust.
    expect(compare!.note).toMatch(/oxygen \(51 m\)/)
    expect(compare!.note).toMatch(/density \(38 m\)/)
  })

  it('derives each candidate depth before comparing them', () => {
    const labels = derive(AIR, 1.3).steps.map((s) => s.label)
    expect(labels).toContain('Maximum operating depth')
    expect(labels).toContain('Depth at the narcosis limit')
    expect(labels).toContain('Depth at the density limit')
    // Order matters: the comparison must come after its inputs.
    expect(labels.indexOf('Which limit binds')).toBeGreaterThan(
      labels.indexOf('Depth at the density limit')
    )
  })

  it('reports the same depths the engine does, not a re-derivation', () => {
    const operating = operatingDepth(AIR, DEFAULT_SAFETY_LIMITS, { ceilingPPO2: 1.3 })
    const compare = derive(AIR, 1.3).steps.find((s) => s.label === 'Which limit binds')!
    // Every figure in the substitution is one of the engine's own outputs.
    for (const depth of [
      operating.oxygenDepthMeters,
      operating.narcosisDepthMeters,
      operating.densityDepthMeters,
    ]) {
      expect(compare.substitution).toContain(String(Math.round(depth)))
    }
  })

  it('names oxygen as the binding limit when it genuinely is', () => {
    // EAN50 at a deco ceiling: oxygen binds at 22 m against narcosis 53 m.
    const compare = derive({ o2: 0.5, he: 0, n2: 0.5 }, 1.6, 'EAN50').steps.find(
      (s) => s.label === 'Which limit binds'
    )!
    expect(compare.note).toMatch(/Oxygen \(ppO₂\) binds first/)
  })

  it('includes the hypoxic ceiling only for a hypoxic mix', () => {
    const normoxic = derive(AIR, 1.4).steps.map((s) => s.label)
    expect(normoxic).not.toContain('Hypoxic ceiling')

    const hypoxic = derive({ o2: 0.16, he: 0.45, n2: 0.39 }, 1.4, '16/45').steps.map(
      (s) => s.label
    )
    expect(hypoxic).toContain('Hypoxic ceiling')
  })

  it('substitutes real numbers, leaving no bare symbols in the working', () => {
    // A substitution line still carrying R or T is not a substitution.
    for (const step of derive(AIR, 1.3).steps) {
      if (!step.substitution) continue
      expect(step.substitution, `${step.label} left a symbol unsubstituted`).not.toMatch(
        /\\cdot R \\cdot T/
      )
    }
  })

  it('titles itself with the mix being checked', () => {
    expect(derive(AIR, 1.3, 'Air').title).toBe('How Air was checked')
    expect(derive({ o2: 0.18, he: 0.45, n2: 0.37 }, 1.3, '18/45').title).toBe(
      'How 18/45 was checked'
    )
  })
})
