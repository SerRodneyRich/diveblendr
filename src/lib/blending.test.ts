import { describe, it, expect } from 'vitest'
import {
  planBlend,
  nitroxSupply,
  trimixSupply,
  DEFAULT_SUPPLIES,
  type BlendRequest,
  type BlendPlan,
} from './blending'
import { gas, AIR } from './gas'

const req = (over: Partial<BlendRequest>): BlendRequest => ({
  target: gas(0.32),
  targetPressureBar: 200,
  current: AIR,
  currentPressureBar: 0,
  tankVolumeL: 11.1,
  temperatureC: 20,
  eos: 'ideal',
  ...over,
})

const sumsToOne = (plan: BlendPlan) => {
  const m = plan.finalMix
  return Math.abs(m.o2 + m.he + m.n2 - 1) < 1e-9
}

const warningTypes = (plan: BlendPlan) => plan.warnings.map(w => w.type)

describe('planBlend — empty tank, partial pressure', () => {
  // Golden value, hand-derived by ideal-gas partial pressures.
  // Target EAN32 at 200 bar from an empty tank with pure O2 and air:
  //   Let x = bar of O2 added, y = bar of air added, x + y = 200.
  //   O2 balance: x + 0.21y = 0.32 * 200 = 64
  //   => x + 0.21(200 - x) = 64  =>  0.79x = 22  =>  x = 27.85 bar O2
  //   => y = 172.15 bar air.
  it('fills EAN32 to 200 bar with ~27.8 bar O2 then air', () => {
    const plan = planBlend(req({ target: gas(0.32), targetPressureBar: 200, currentPressureBar: 0 }))
    expect(plan.feasible).toBe(true)
    const o2Step = plan.steps.find(s => s.gasName === 'Oxygen')
    const airStep = plan.steps.find(s => s.gasName === 'Air')
    expect(o2Step).toBeDefined()
    expect(airStep).toBeDefined()
    expect(o2Step!.addPressureBar).toBeCloseTo(27.85, 1)
    expect(o2Step!.addPressureBar + airStep!.addPressureBar).toBeCloseTo(200, 6)
  })

  // Trimix 18/45 at 200 bar from empty, ideal gas:
  //   He: 0.45 * 200 = 90 bar
  //   Remaining 110 bar must give 36 bar of O2 (0.18 * 200) and 74 bar of N2.
  //   Air supplies N2 at 0.79: 74 / 0.79 = 93.67 bar of air, carrying
  //   0.21 * 93.67 = 19.67 bar of O2. Shortfall 36 - 19.67 = 16.33 bar pure O2.
  //   Total: 90 + 93.67 + 16.33 = 200 bar. Checks out.
  it('fills trimix 18/45 to 200 bar with 90 bar He, ~16.3 bar O2 and ~93.7 bar air', () => {
    const plan = planBlend(req({ target: gas(0.18, 0.45), targetPressureBar: 200, currentPressureBar: 0 }))
    expect(plan.feasible).toBe(true)
    const he = plan.steps.find(s => s.gasName === 'Helium')!
    const o2 = plan.steps.find(s => s.gasName === 'Oxygen')!
    const air = plan.steps.find(s => s.gasName === 'Air')!
    expect(he.addPressureBar).toBeCloseTo(90, 1)
    expect(o2.addPressureBar).toBeCloseTo(16.33, 1)
    expect(air.addPressureBar).toBeCloseTo(93.67, 1)
  })

  it('produces exactly the target mix and pressure', () => {
    const plan = planBlend(req({ target: gas(0.18, 0.45), targetPressureBar: 200 }))
    expect(plan.finalMix.o2).toBeCloseTo(0.18, 9)
    expect(plan.finalMix.he).toBeCloseTo(0.45, 9)
    expect(plan.finalMix.n2).toBeCloseTo(0.37, 9)
    expect(plan.finalPressureBar).toBeCloseTo(200, 6)
  })

  it('needs no oxygen step when the target is air itself', () => {
    const plan = planBlend(req({ target: AIR, targetPressureBar: 200 }))
    expect(plan.feasible).toBe(true)
    expect(plan.steps.filter(s => s.gasName === 'Oxygen')).toHaveLength(0)
    expect(plan.steps.filter(s => s.gasName === 'Air')).toHaveLength(1)
  })

  it('needs only oxygen when the target is pure oxygen', () => {
    const plan = planBlend(req({ target: gas(1), targetPressureBar: 200 }))
    expect(plan.feasible).toBe(true)
    expect(plan.steps.filter(s => s.gasName === 'Air')).toHaveLength(0)
    expect(plan.finalMix.o2).toBeCloseTo(1, 9)
  })
})

describe('F3 — infeasible blends are reported, not disguised', () => {
  // The tank holds 200 bar of EAN40 and the diver wants EAN32 at 200 bar.
  // There is no way to remove oxygen by adding gas, so gas must be drained.
  it('emits an explicit drain step when the current fill is too rich', () => {
    const plan = planBlend(
      req({
        target: gas(0.32),
        targetPressureBar: 200,
        current: gas(0.4),
        currentPressureBar: 200,
      })
    )
    const drain = plan.steps.find(s => s.gasName === 'Drain')
    expect(drain).toBeDefined()
    expect(drain!.addPressureBar).toBeLessThan(0)
    expect(warningTypes(plan)).toContain('drain-required')
  })

  // F3: this case previously returned zero steps and finalMix = target,
  // reading as "already done" when the truth is "you must drain".
  it('does not report a full tank of the wrong mix as already complete', () => {
    const plan = planBlend(
      req({
        target: gas(0.32),
        targetPressureBar: 200,
        current: gas(0.5),
        currentPressureBar: 200,
      })
    )
    expect(plan.steps.length).toBeGreaterThan(0)
    expect(plan.steps.some(s => s.gasName === 'Drain')).toBe(true)
  })

  it('reaches the target after draining', () => {
    const plan = planBlend(
      req({
        target: gas(0.32),
        targetPressureBar: 200,
        current: gas(0.4),
        currentPressureBar: 200,
      })
    )
    expect(plan.feasible).toBe(true)
    expect(plan.finalMix.o2).toBeCloseTo(0.32, 6)
    expect(plan.finalPressureBar).toBeCloseTo(200, 3)
  })

  it('drains when the tank already holds too much helium', () => {
    const plan = planBlend(
      req({
        target: gas(0.18, 0.3),
        targetPressureBar: 200,
        current: gas(0.18, 0.45),
        currentPressureBar: 200,
      })
    )
    expect(plan.steps.some(s => s.gasName === 'Drain')).toBe(true)
    expect(plan.finalMix.he).toBeCloseTo(0.3, 6)
  })

  // F3: the warnings array was declared but never populated anywhere.
  it('populates the warnings array rather than always returning it empty', () => {
    const plan = planBlend(
      req({ target: gas(0.5), targetPressureBar: 200, current: gas(0.6), currentPressureBar: 150 })
    )
    expect(plan.warnings.length).toBeGreaterThan(0)
  })

  it('reports infeasible when no helium source is available for a trimix target', () => {
    const plan = planBlend(
      req({
        target: gas(0.18, 0.45),
        supplies: [
          { name: 'Oxygen', mix: gas(1) },
          { name: 'Air', mix: AIR },
        ],
      })
    )
    expect(plan.feasible).toBe(false)
    expect(warningTypes(plan)).toContain('infeasible')
  })

  it('reports infeasible when only air is available for an enriched target', () => {
    const plan = planBlend(req({ target: gas(0.32), supplies: [{ name: 'Air', mix: AIR }] }))
    expect(plan.feasible).toBe(false)
  })

  // A helium-free target leaner than air cannot be produced from O2, He and
  // air: nothing in the supply set lowers the oxygen fraction below 21%.
  it('reports infeasible for a sub-21% nitrox target with no helium', () => {
    const plan = planBlend(req({ target: gas(0.16), targetPressureBar: 200 }))
    expect(plan.feasible).toBe(false)
    expect(warningTypes(plan)).toContain('infeasible')
  })

  it('still returns a mixture summing to 1 when infeasible', () => {
    const plan = planBlend(req({ target: gas(0.16), targetPressureBar: 200 }))
    expect(sumsToOne(plan)).toBe(true)
  })

  it('never claims feasible while reporting a mix far from the target', () => {
    const plan = planBlend(
      req({ target: gas(0.18, 0.45), supplies: [{ name: 'Air', mix: AIR }] })
    )
    if (plan.feasible) {
      expect(Math.abs(plan.finalMix.o2 - 0.18)).toBeLessThan(0.005)
      expect(Math.abs(plan.finalMix.he - 0.45)).toBeLessThan(0.005)
    } else {
      expect(plan.warnings.length).toBeGreaterThan(0)
    }
  })
})

describe('F5 — supply gases are full mixtures, not a scalar purity', () => {
  // Blending EAN32 from banked EAN36 and air. Hand check at 200 bar:
  //   Let x = bar of EAN36, y = bar of air, x + y = 200.
  //   0.36x + 0.21y = 64  =>  0.36x + 0.21(200 - x) = 64
  //   => 0.15x = 22  =>  x = 146.67 bar EAN36, y = 53.33 bar air.
  it('blends EAN32 from banked EAN36 and air', () => {
    const plan = planBlend(
      req({
        target: gas(0.32),
        targetPressureBar: 200,
        supplies: [nitroxSupply('EAN36', 36), { name: 'Air', mix: AIR }],
      })
    )
    expect(plan.feasible).toBe(true)
    const banked = plan.steps.find(s => s.gasName === 'EAN36')!
    expect(banked.addPressureBar).toBeCloseTo(146.67, 1)
    expect(plan.finalMix.o2).toBeCloseTo(0.32, 9)
  })

  it('blends a trimix from a banked trimix supply plus pure helium', () => {
    const plan = planBlend(
      req({
        target: gas(0.18, 0.3),
        targetPressureBar: 200,
        supplies: [
          trimixSupply('21/35', 21, 35),
          { name: 'Helium', mix: gas(0, 1) },
          { name: 'Oxygen', mix: gas(1) },
          { name: 'Air', mix: AIR },
        ],
      })
    )
    expect(plan.feasible).toBe(true)
    expect(plan.finalMix.he).toBeCloseTo(0.3, 6)
    expect(plan.finalMix.o2).toBeCloseTo(0.18, 6)
  })

  // Hand check: to reach 18/30 you need, per 200 bar, 36 bar O2, 60 bar He and
  // 104 bar N2. Banked 21/35 is the only helium source, so it is pinned at
  // 60/0.35 = 171.4 bar, which already carries 36 bar of O2 — exactly the
  // target — and only 75.4 bar of N2. The remaining 28.6 bar of N2 can only
  // come from air, which would push oxygen over. The blend is genuinely
  // impossible from these three supplies, and must be reported as such.
  it('reports infeasible when a banked trimix pins helium and oxygen against each other', () => {
    const plan = planBlend(
      req({
        target: gas(0.18, 0.3),
        targetPressureBar: 200,
        supplies: [trimixSupply('21/35', 21, 35), { name: 'Oxygen', mix: gas(1) }, { name: 'Air', mix: AIR }],
      })
    )
    expect(plan.feasible).toBe(false)
    expect(warningTypes(plan)).toContain('infeasible')
  })

  // F5: a purity of 0 used to produce Infinity via nAddHe / (purity/100).
  it('rejects an invalid supply composition instead of producing Infinity', () => {
    expect(() =>
      planBlend(
        req({
          supplies: [{ name: 'Broken', mix: { o2: 0, he: 0, n2: 0 } }],
        })
      )
    ).toThrow(/invalid composition/i)
  })

  it('attributes the nitrogen carried by an impure oxygen supply', () => {
    // A 95% "oxygen" supply carries 5% nitrogen; that nitrogen must land in
    // the tank's nitrogen inventory, not vanish.
    const plan = planBlend(
      req({
        target: gas(0.32),
        targetPressureBar: 200,
        supplies: [nitroxSupply('O₂ (95%)', 95), { name: 'Air', mix: AIR }],
      })
    )
    expect(sumsToOne(plan)).toBe(true)
    expect(plan.finalMix.o2 + plan.finalMix.n2).toBeCloseTo(1, 9)
  })

  it('keeps the mixture summing to 1 after every step, for every supply set', () => {
    const supplySets = [
      DEFAULT_SUPPLIES,
      [nitroxSupply('EAN32', 32), { name: 'Oxygen', mix: gas(1) }, { name: 'Air', mix: AIR }],
      [trimixSupply('18/45', 18, 45), { name: 'Helium', mix: gas(0, 1) }, { name: 'Oxygen', mix: gas(1) }, { name: 'Air', mix: AIR }],
    ]
    for (const supplies of supplySets) {
      const plan = planBlend(req({ target: gas(0.21, 0.35), targetPressureBar: 200, supplies }))
      for (const step of plan.steps) {
        const m = step.resultingMix
        expect(Math.abs(m.o2 + m.he + m.n2 - 1)).toBeLessThan(1e-9)
      }
    }
  })
})

describe('F4 — ideal and van der Waals share one algorithm', () => {
  it('produces the same step structure under both equations of state', () => {
    const base = req({ target: gas(0.18, 0.45), targetPressureBar: 200 })
    const ideal = planBlend({ ...base, eos: 'ideal' })
    const vdw = planBlend({ ...base, eos: 'vdw' })
    expect(vdw.steps.map(s => s.gasName)).toEqual(ideal.steps.map(s => s.gasName))
  })

  it('agrees within 2% on step pressures for pressures <= 100 bar and He <= 30%', () => {
    for (const pressure of [50, 75, 100]) {
      for (const he of [0, 0.15, 0.3]) {
        const base = req({ target: gas(0.21, he), targetPressureBar: pressure, tankVolumeL: 12 })
        const ideal = planBlend({ ...base, eos: 'ideal' })
        const vdw = planBlend({ ...base, eos: 'vdw' })
        expect(vdw.steps).toHaveLength(ideal.steps.length)
        for (let i = 0; i < ideal.steps.length; i++) {
          const a = ideal.steps[i].addPressureBar
          const b = vdw.steps[i].addPressureBar
          if (Math.abs(a) < 1) continue
          expect(Math.abs(b - a) / Math.abs(a)).toBeLessThan(0.02)
        }
      }
    }
  })

  it('reaches the same final composition under both equations of state', () => {
    const base = req({ target: gas(0.18, 0.45), targetPressureBar: 200 })
    const ideal = planBlend({ ...base, eos: 'ideal' })
    const vdw = planBlend({ ...base, eos: 'vdw' })
    expect(vdw.finalMix.o2).toBeCloseTo(ideal.finalMix.o2, 6)
    expect(vdw.finalMix.he).toBeCloseTo(ideal.finalMix.he, 6)
  })

  it('applies drain logic under the vdw path too, which it previously lacked', () => {
    const plan = planBlend(
      req({
        eos: 'vdw',
        target: gas(0.32),
        targetPressureBar: 200,
        current: gas(0.4),
        currentPressureBar: 200,
      })
    )
    expect(plan.steps.some(s => s.gasName === 'Drain')).toBe(true)
  })

  it('falls back to ideal once per blend rather than mid-plan', () => {
    // A tiny tank at high pressure is where vdw becomes unphysical.
    const plan = planBlend(req({ eos: 'vdw', tankVolumeL: 0.5, targetPressureBar: 300 }))
    expect(plan.eos).toBe('ideal')
    // And it says so, rather than emitting a console warning.
    expect(warningTypes(plan)).toContain('non-convergence')
  })
})

describe('planBlend — safety warnings on the result', () => {
  it('flags a hypoxic result with its breathable ceiling', () => {
    const plan = planBlend(req({ target: gas(0.1, 0.7), targetPressureBar: 200 }))
    expect(warningTypes(plan)).toContain('hypoxic-result')
    expect(plan.warnings.find(w => w.type === 'hypoxic-result')!.severity).toBe('danger')
  })

  it('flags an oxygen-clean requirement above 40% O2', () => {
    const plan = planBlend(req({ target: gas(0.5), targetPressureBar: 200 }))
    expect(warningTypes(plan)).toContain('oxygen-clean-required')
  })

  it('does not flag oxygen-clean for air', () => {
    const plan = planBlend(req({ target: AIR, targetPressureBar: 200 }))
    expect(warningTypes(plan)).not.toContain('oxygen-clean-required')
  })

  it('flags an unusually high target pressure', () => {
    const plan = planBlend(req({ target: AIR, targetPressureBar: 320 }))
    expect(warningTypes(plan)).toContain('high-pressure')
  })

  it('stays quiet for a routine EAN32 fill', () => {
    const plan = planBlend(req({ target: gas(0.32), targetPressureBar: 200 }))
    expect(plan.warnings).toHaveLength(0)
  })
})

describe('planBlend — input validation', () => {
  it('rejects a non-positive target pressure', () => {
    expect(() => planBlend(req({ targetPressureBar: 0 }))).toThrow()
    expect(() => planBlend(req({ targetPressureBar: -10 }))).toThrow()
  })

  it('rejects a negative current pressure', () => {
    expect(() => planBlend(req({ currentPressureBar: -1 }))).toThrow()
  })

  it('rejects a non-positive tank volume', () => {
    expect(() => planBlend(req({ tankVolumeL: 0 }))).toThrow()
  })

  it('rejects an empty supply list', () => {
    expect(() => planBlend(req({ supplies: [] }))).toThrow()
  })

  it('rejects mixtures that do not sum to 1', () => {
    expect(() => planBlend(req({ target: { o2: 0.5, he: 0.5, n2: 0.5 } }))).toThrow()
    expect(() => planBlend(req({ current: { o2: 0.5, he: 0.5, n2: 0.5 } }))).toThrow()
  })
})

describe('planBlend — properties over a seeded grid', () => {
  // Targets leaner than 21% oxygen with no helium are unreachable from
  // O2/He/air — there is nothing to add that lowers the oxygen fraction — so
  // the grid starts at air.
  it('keeps fractions summing to 1 and pressures finite across many blends', () => {
    for (let o2 = 0.21; o2 <= 0.6; o2 += 0.07) {
      for (let he = 0; he <= 0.5; he += 0.1) {
        if (o2 + he > 1) continue
        for (const pressure of [100, 200, 232]) {
          const plan = planBlend(
            req({ target: gas(o2, he), targetPressureBar: pressure, currentPressureBar: 0 })
          )
          expect(sumsToOne(plan)).toBe(true)
          expect(Number.isFinite(plan.finalPressureBar)).toBe(true)
          for (const step of plan.steps) {
            expect(Number.isFinite(step.addPressureBar)).toBe(true)
            expect(Number.isFinite(step.totalPressureBar)).toBe(true)
          }
        }
      }
    }
  })

  it('has step pressures that sum to the final pressure', () => {
    for (const target of [gas(0.32), gas(0.18, 0.45), gas(0.21, 0.35), AIR]) {
      const plan = planBlend(req({ target, targetPressureBar: 200, currentPressureBar: 0 }))
      const sum = plan.steps.reduce((acc, s) => acc + s.addPressureBar, 0)
      expect(sum).toBeCloseTo(plan.finalPressureBar, 3)
    }
  })

  it('has monotonically increasing running pressure after any drain', () => {
    const plan = planBlend(req({ target: gas(0.18, 0.45), targetPressureBar: 200 }))
    let prev = -1
    for (const step of plan.steps) {
      if (step.gasName === 'Drain') continue
      expect(step.totalPressureBar).toBeGreaterThan(prev)
      prev = step.totalPressureBar
    }
  })

  it('tops up an existing partial fill of the same mix without draining', () => {
    const plan = planBlend(
      req({ target: gas(0.32), targetPressureBar: 200, current: gas(0.32), currentPressureBar: 50 })
    )
    expect(plan.feasible).toBe(true)
    expect(plan.steps.some(s => s.gasName === 'Drain')).toBe(false)
    expect(plan.finalPressureBar).toBeCloseTo(200, 3)
    expect(plan.finalMix.o2).toBeCloseTo(0.32, 6)
  })
})
