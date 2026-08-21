/**
 * Derivations for the consumption tools — SAC/RMV and gas planning.
 *
 * Same contract as the rest of this directory: pure, framework-free, emitting
 * `MathStep`s that `MathSteps` renders. These replace hand-written prose
 * modals that restated the arithmetic in words, which is how a derivation and
 * its result come to disagree.
 *
 * Everything here works in the library's own units — bar, litres, metres — and
 * says so. Converting a derivation is worse than not converting it: a diver
 * checking the working against a textbook needs the textbook's units.
 */

import type { SACResult } from '../consumption'
import { ambientPressureStep, num, withUnit } from './math'
import type { MathDerivation, MathStep } from './types'

export interface SacMathInput {
  startPressureBar: number
  endPressureBar: number
  averageDepthMeters: number
  durationMinutes: number
  tankVolumeL: number
  tankLabel: string
  result: SACResult
}

/**
 * How SAC and RMV are derived from one logged dive.
 *
 * The two numbers are the point: SAC is a property of a cylinder, RMV a
 * property of a diver, and conflating them is the usual gas-planning error.
 * The derivation shows them sharing every input but the tank volume.
 */
export function sacDerivation(input: SacMathInput): MathDerivation {
  const {
    startPressureBar,
    endPressureBar,
    averageDepthMeters,
    durationMinutes,
    tankVolumeL,
    tankLabel,
    result,
  } = input

  const pressureUsed = startPressureBar - endPressureBar
  const steps: MathStep[] = []

  steps.push(ambientPressureStep(averageDepthMeters, result.ataAtAverageDepth))

  steps.push({
    label: 'Pressure breathed',
    formula: String.raw`\Delta P = P_\text{start} - P_\text{end}`,
    substitution: String.raw`\Delta P = ${num(startPressureBar, 0)} - ${num(endPressureBar, 0)}`,
    result: String.raw`\Delta P = ${withUnit(pressureUsed, 'bar', 0)}`,
    note: 'What the gauge actually dropped by over the dive.',
  })

  steps.push({
    label: 'Gas breathed, at the surface',
    formula: String.raw`V = \Delta P \times V_\text{tank}`,
    substitution: String.raw`V = ${num(pressureUsed, 0)} \times ${num(tankVolumeL, 1)}`,
    result: String.raw`V = ${withUnit(result.gasUsedLiters, 'L', 0)}`,
    note: `Surface-equivalent volume: the gas the ${tankLabel} gave up, measured as it would occupy at one bar. ${num(tankVolumeL, 1)} L is the cylinder's water volume, not its cubic-foot rating.`,
  })

  steps.push({
    label: 'SAC — the cylinder’s number',
    formula: String.raw`\text{SAC} = \frac{\Delta P}{P_\text{amb} \times t}`,
    substitution: String.raw`\text{SAC} = \frac{${num(pressureUsed, 0)}}{${num(result.ataAtAverageDepth, 2)} \times ${num(durationMinutes, 0)}}`,
    result: String.raw`\text{SAC} = ${withUnit(result.sacBarPerMin, 'bar/min', 2)}`,
    note: `How fast the needle falls on this cylinder. Tank-specific: the same diver on a larger cylinder shows a lower SAC without breathing any differently, which is why this figure does not transfer between tanks.`,
  })

  steps.push({
    label: 'RMV — the diver’s number',
    formula: String.raw`\text{RMV} = \frac{\Delta P \times V_\text{tank}}{t \times P_\text{amb}}`,
    substitution: String.raw`\text{RMV} = \frac{${num(pressureUsed, 0)} \times ${num(tankVolumeL, 1)}}{${num(durationMinutes, 0)} \times ${num(result.ataAtAverageDepth, 2)}}`,
    result: String.raw`\text{RMV} = ${withUnit(result.rmvLitersPerMin, 'L/min', 2)}`,
    note: 'How much gas your lungs move per minute at the surface. A property of you, not of the cylinder — this is the figure worth keeping, and the one gas planning asks for.',
  })

  steps.push({
    label: 'Why average depth, not maximum',
    note: `Consumption is charged at the pressure actually breathed, so the whole dive is evaluated at its average depth (${num(averageDepthMeters, 1)} m). Using maximum depth would overstate the gas used and understate the rate — flattering, and wrong in the unsafe direction when the number is later used to plan.`,
  })

  return { title: 'How SAC and RMV are derived', steps }
}

export interface MinimumGasMathInput {
  maxDepthMeters: number
  rmvLitersPerMin: number
  /** Stress multiplier applied to RMV for the shared-gas ascent. */
  stressMultiplier: number
  problemSolvingMinutes: number
  ascentRateMPerMin: number
  /** Gas breathed while solving the problem at depth, litres. */
  atDepthLiters: number
  /** Gas breathed during the ascent itself, litres. */
  ascentLiters: number
  totalLiters: number
  tankVolumeL: number
  minimumGasBar: number
}

/**
 * How minimum gas (rock bottom) is derived.
 *
 * The reserve that gets two divers from depth to the surface sharing one
 * supply, breathing hard, with time to sort the problem out first. Split into
 * the two phases the library actually computes: the stop at depth is charged at
 * depth pressure, the ascent at the mean pressure of the transit.
 */
export function minimumGasDerivation(input: MinimumGasMathInput): MathDerivation {
  const {
    maxDepthMeters,
    rmvLitersPerMin,
    stressMultiplier,
    problemSolvingMinutes,
    ascentRateMPerMin,
    atDepthLiters,
    ascentLiters,
    totalLiters,
    tankVolumeL,
    minimumGasBar,
  } = input

  const sharedRmv = rmvLitersPerMin * stressMultiplier * 2
  const ascentMinutes = maxDepthMeters / ascentRateMPerMin
  const depthPressure = maxDepthMeters / 10 + 1
  const meanAscentPressure = (depthPressure + 1) / 2

  const steps: MathStep[] = []

  steps.push({
    label: 'Two divers, breathing hard',
    formula: String.raw`\text{RMV}_\text{shared} = \text{RMV} \times k \times 2`,
    substitution: String.raw`\text{RMV}_\text{shared} = ${num(rmvLitersPerMin, 2)} \times ${num(stressMultiplier, 1)} \times 2`,
    result: String.raw`\text{RMV}_\text{shared} = ${withUnit(sharedRmv, 'L/min', 1)}`,
    note: `An out-of-gas ascent is not a relaxed one: your measured rate is multiplied by ${num(stressMultiplier, 1)} for the workload and the stress. Doubled because the whole point of this reserve is that two of you are breathing from one cylinder.`,
  })

  steps.push({
    label: 'Sorting it out, at depth',
    formula: String.raw`V_\text{depth} = \text{RMV}_\text{shared} \times P_\text{amb} \times t_\text{solve}`,
    substitution: String.raw`V_\text{depth} = ${num(sharedRmv, 1)} \times ${num(depthPressure, 2)} \times ${num(problemSolvingMinutes, 0)}`,
    result: String.raw`V_\text{depth} = ${withUnit(atDepthLiters, 'L', 0)}`,
    note: `${num(problemSolvingMinutes, 0)} minute${problemSolvingMinutes === 1 ? '' : 's'} at ${num(maxDepthMeters, 0)} m to notice the problem, donate, and get organised — charged at full depth pressure, because that is where you are.`,
  })

  steps.push({
    label: 'The ascent',
    formula: String.raw`V_\text{ascent} = \text{RMV}_\text{shared} \times \frac{P_\text{depth} + P_\text{surface}}{2} \times t_\text{ascent}`,
    substitution: String.raw`V_\text{ascent} = ${num(sharedRmv, 1)} \times ${num(meanAscentPressure, 2)} \times ${num(ascentMinutes, 1)}`,
    result: String.raw`V_\text{ascent} = ${withUnit(ascentLiters, 'L', 0)}`,
    note: `${num(maxDepthMeters, 0)} m at ${num(ascentRateMPerMin, 0)} m/min is ${num(ascentMinutes, 1)} minutes. Charged at the mean pressure of the transit rather than at depth throughout — you are shallower for most of it, and charging the whole ascent at depth would overstate the reserve by roughly a third.`,
  })

  steps.push({
    label: 'Gas required',
    formula: String.raw`V = V_\text{depth} + V_\text{ascent}`,
    substitution: String.raw`V = ${num(atDepthLiters, 0)} + ${num(ascentLiters, 0)}`,
    result: String.raw`V = ${withUnit(totalLiters, 'L', 0)}`,
    note: 'Surface-equivalent litres — the gas as it would occupy at one bar.',
  })

  steps.push({
    label: 'As a gauge pressure',
    formula: String.raw`P_\text{min} = \frac{V}{V_\text{tank}}`,
    substitution: String.raw`P_\text{min} = \frac{${num(totalLiters, 0)}}{${num(tankVolumeL, 1)}}`,
    result: String.raw`P_\text{min} = ${withUnit(minimumGasBar, 'bar', 0)}`,
    note: 'The number to watch on the gauge. Turn the dive before you reach it, not at it.',
  })

  return { title: 'How minimum gas is derived', steps }
}

// ---------------------------------------------------------------------------
// Gas blending
// ---------------------------------------------------------------------------

export interface BlendMathInput {
  startMix: { o2: number; he: number; n2: number }
  startPressureBar: number
  targetMix: { o2: number; he: number; n2: number }
  targetPressureBar: number
  finalMix: { o2: number; he: number; n2: number }
  finalPressureBar: number
  steps: readonly {
    action: string
    gasName: string
    addPressureBar: number
    totalPressureBar: number
    resultingMix: { o2: number; he: number; n2: number }
  }[]
  eos: 'ideal' | 'vdw'
  compressibilityFactor?: number
  temperatureC: number
}

/**
 * How a fill plan was solved.
 *
 * Blending is mass balance, not pressure arithmetic: what is conserved is the
 * quantity of each species, and pressure is only how a gauge reports it. The
 * derivation shows the balance for every step, so a blender can check the
 * running composition rather than trusting the final number.
 */
export function blendDerivation(input: BlendMathInput): MathDerivation {
  const {
    startMix,
    startPressureBar,
    targetMix,
    targetPressureBar,
    finalMix,
    finalPressureBar,
    steps,
    eos,
    compressibilityFactor,
    temperatureC,
  } = input

  const out: MathStep[] = []

  out.push({
    label: 'What is in the cylinder now',
    formula: String.raw`P_{i} = F_{i} \times P_\text{start}`,
    substitution: String.raw`P_{O_2} = ${num(startMix.o2, 3)} \times ${num(startPressureBar, 0)} = ${num(startMix.o2 * startPressureBar, 1)}\,\text{bar}`,
    result: String.raw`${num(startMix.o2 * 100, 1)}/${num(startMix.he * 100, 1)} \text{ at } ${withUnit(startPressureBar, 'bar', 0)}`,
    note: 'Each species has its own partial pressure. A fill adds to those, and the resulting mix is whatever the totals come to — this is why a top-off changes the mix rather than diluting it evenly.',
  })

  out.push({
    label: 'What is wanted',
    formula: String.raw`P_{i,\text{target}} = F_{i,\text{target}} \times P_\text{target}`,
    substitution: String.raw`P_{O_2} = ${num(targetMix.o2, 3)} \times ${num(targetPressureBar, 0)} = ${num(targetMix.o2 * targetPressureBar, 1)},\quad P_{He} = ${num(targetMix.he, 3)} \times ${num(targetPressureBar, 0)} = ${num(targetMix.he * targetPressureBar, 1)}`,
    result: String.raw`${num(targetMix.o2 * 100, 1)}/${num(targetMix.he * 100, 1)} \text{ at } ${withUnit(targetPressureBar, 'bar', 0)}`,
    note: 'The difference between these partial pressures and the ones above is what has to be added — of each species separately, which is what sets the fill order.',
  })

  steps.forEach((step, i) => {
    out.push({
      label: `Step ${i + 1} — ${step.action}${step.gasName ? ` (${step.gasName})` : ''}`,
      formula: String.raw`F_{i}' = \frac{F_{i} P + F_{i,\text{added}} \Delta P}{P + \Delta P}`,
      substitution: String.raw`\Delta P = ${num(step.addPressureBar, 1)}\,\text{bar} \;\Rightarrow\; P = ${num(step.totalPressureBar, 0)}\,\text{bar}`,
      result: String.raw`${num(step.resultingMix.o2 * 100, 1)}/${num(step.resultingMix.he * 100, 1)}`,
      note: `Composition after this step. The mix is recomputed from the totals rather than tracked forward, so a rounding error cannot accumulate across steps.`,
    })
  })

  out.push({
    label: 'Equation of state',
    formula:
      eos === 'vdw'
        ? String.raw`\left(P + \frac{a n^2}{V^2}\right)\left(V - nb\right) = nRT`
        : String.raw`PV = nRT`,
    substitution:
      eos === 'vdw' && compressibilityFactor
        ? String.raw`Z = ${num(compressibilityFactor, 3)} \text{ at } ${num(finalPressureBar, 0)}\,\text{bar},\; ${num(temperatureC, 0)}\,^\circ\text{C}`
        : undefined,
    note:
      eos === 'vdw'
        ? `Van der Waals. Real gases are not ideal at fill pressures: the compressibility factor Z = ${num(compressibilityFactor ?? 1, 3)} says the cylinder holds ${compressibilityFactor && compressibilityFactor < 1 ? 'more' : 'less'} gas than the ideal gas law predicts, and the plan accounts for it.`
        : 'Ideal gas law. Below roughly 150 bar the real-gas correction is smaller than the accuracy of the gauge you are filling against, so it buys nothing.',
  })

  out.push({
    label: 'What the plan actually produces',
    formula: String.raw`F_{i,\text{final}} = \frac{P_{i,\text{final}}}{P_\text{final}}`,
    result: String.raw`${num(finalMix.o2 * 100, 1)}/${num(finalMix.he * 100, 1)} \text{ at } ${withUnit(finalPressureBar, 'bar', 0)}`,
    note: 'Computed from the steps, never assumed to equal the target. Where whole-bar fills cannot hit the target exactly, this is what you will actually have — analyse the cylinder before diving it.',
  })

  return { title: 'How this fill was solved', steps: out }
}
