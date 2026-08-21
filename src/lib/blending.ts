/**
 * Unified gas-blend planner.
 *
 * Addresses F3, F4 and F5 together, because they are the same defect seen from
 * three angles: there were two independent blend algorithms (an ideal-gas one
 * with drain logic inside `GasBlender.tsx`, and a van der Waals one in
 * `realGasBlending_v3.ts` without it) that could disagree, neither of which
 * modelled supply-gas purity correctly, and the real-gas one reported
 * impossible blends as successful.
 *
 * Design
 * ------
 * Everything is solved in **mole space**. The equation of state is confined to
 * two functions — moles→pressure and pressure→moles — so `ideal` and `vdw`
 * share one identical feasibility/drain/step algorithm and can only differ by
 * the compressibility of the gas, never by logic.
 *
 * Supply gases are full mixtures rather than a scalar "purity". Banked 32%
 * nitrox is `{o2: 0.32, he: 0, n2: 0.68}`, and its nitrogen is properly
 * attributed to the tank's nitrogen inventory. The old code divided the
 * required moles by a purity fraction, added the result to the tank total, and
 * never accounted for what the rest of that gas actually was — so composition
 * tracking drifted, and a purity of 0 produced Infinity.
 *
 * Feasibility is decided **before** any step is generated. If the tank already
 * holds more of any species than the target allows, the planner computes the
 * drain fraction and emits an explicit drain step, rather than clamping the
 * requirement to zero and then forcing the reported final mix to equal the
 * target (which is what made infeasible blends look successful).
 */

import { gas, type GasFractions, isValidGas } from './gas'
import {
  pressureFromMoles,
  stateFromPressure,
  isVanDerWaalsSuitable,
  type GasMixture as VdwMixture,
} from '@/utils/vanDeWaalsPhysics'

/** Which equation of state converts between moles and pressure. */
export type EquationOfState = 'ideal' | 'vdw'

/** A gas available at the fill station. */
export interface SupplyGas {
  /** Human-readable name for the step description, e.g. "Air", "O₂", "banked 32%". */
  name: string
  /** Its actual composition. Fractions must sum to 1. */
  mix: GasFractions
}

export interface BlendRequest {
  /** Desired final composition. */
  target: GasFractions
  /** Desired final pressure, bar. */
  targetPressureBar: number
  /** What is in the tank now. */
  current: GasFractions
  /** Current pressure, bar. Zero for an empty tank. */
  currentPressureBar: number
  /** Tank internal (water) volume, litres. */
  tankVolumeL: number
  /** Gas temperature, °C. */
  temperatureC: number
  /** Equation of state. Defaults to `'ideal'`. */
  eos?: EquationOfState
  /**
   * Supply gases, in the order they should be added. Order matters physically
   * (helium first, then oxygen, then the air/diluent top-off is conventional).
   * Defaults to pure helium, pure oxygen and air.
   */
  supplies?: SupplyGas[]
}

export type BlendWarningType =
  | 'drain-required'
  | 'infeasible'
  | 'non-convergence'
  | 'unreachable-purity'
  | 'hypoxic-result'
  | 'high-pressure'
  | 'oxygen-clean-required'
  | 'accuracy'

export interface BlendWarning {
  type: BlendWarningType
  severity: 'info' | 'warning' | 'danger'
  message: string
}

export interface BlendStep {
  step: number
  /** Short verb phrase, e.g. "Add He", "Drain". */
  action: string
  /** Which supply this step draws from, or `'Drain'`. */
  gasName: string
  /** Pressure change for this step, bar. Negative for a drain. */
  addPressureBar: number
  /** Tank pressure after the step, bar. */
  totalPressureBar: number
  /** Tank composition after the step. */
  resultingMix: GasFractions
  description: string
}

export interface BlendPlan {
  feasible: boolean
  steps: BlendStep[]
  /** The mix the steps actually produce — never assumed to equal the target. */
  finalMix: GasFractions
  /** The pressure the steps actually reach, bar. */
  finalPressureBar: number
  warnings: BlendWarning[]
  eos: EquationOfState
  /** Compressibility factor at the final state, for display. */
  finalCompressibilityFactor?: number
}

/** Default supply set: pure helium, pure oxygen, air. */
export const DEFAULT_SUPPLIES: SupplyGas[] = [
  { name: 'Helium', mix: { o2: 0, he: 1, n2: 0 } },
  { name: 'Oxygen', mix: { o2: 1, he: 0, n2: 0 } },
  { name: 'Air', mix: { o2: 0.21, he: 0, n2: 0.79 } },
]

const EPS = 1e-9

/** Species inventory in moles. */
interface Moles {
  o2: number
  he: number
  n2: number
}

function totalMoles(m: Moles): number {
  return m.o2 + m.he + m.n2
}

function toFractions(m: Moles): GasFractions {
  const total = totalMoles(m)
  if (total <= EPS) return { o2: 0, he: 0, n2: 0 }
  return { o2: m.o2 / total, he: m.he / total, n2: m.n2 / total }
}

function toVdw(mix: GasFractions): VdwMixture {
  return { O2: mix.o2 * 100, He: mix.he * 100, N2: mix.n2 * 100 }
}

/**
 * Moles → pressure under the chosen EOS.
 *
 * F9-adjacent: the EOS is chosen once per blend by the caller, never switched
 * mid-plan, so step pressures cannot show a discontinuity from the model
 * silently changing between steps.
 */
function molesToPressure(
  moles: number,
  mix: GasFractions,
  tankVolumeL: number,
  temperatureC: number,
  eos: EquationOfState
): number {
  if (moles <= EPS) return 0
  if (eos === 'ideal') {
    // PV = nRT, R in L·bar/(mol·K)
    return (moles * 0.083144626 * (temperatureC + 273.15)) / tankVolumeL
  }
  return pressureFromMoles(moles, temperatureC, toVdw(mix), tankVolumeL).pressureBar
}

/** Pressure → moles under the chosen EOS. */
function pressureToMoles(
  pressureBar: number,
  mix: GasFractions,
  tankVolumeL: number,
  temperatureC: number,
  eos: EquationOfState
): number {
  if (pressureBar <= EPS) return 0
  if (eos === 'ideal') {
    return (pressureBar * tankVolumeL) / (0.083144626 * (temperatureC + 273.15))
  }
  return stateFromPressure(pressureBar, temperatureC, toVdw(mix), tankVolumeL).molesInTank
}

/**
 * Solves for how many moles of each supply gas must be added to move the tank's
 * inventory by `needed` (moles of O2, He and N2).
 *
 * This is the linear system  A · x = b  where A's columns are the supply gas
 * compositions, x is the quantity drawn from each supply, and b is `needed`.
 * A solution is only usable when every component of x is non-negative — you
 * cannot add a negative amount of gas. A negative component is precisely the
 * signal that the target is unreachable by addition alone and the tank must be
 * drained first.
 *
 * The species are coupled: blending EAN32 from banked EAN36 and air constrains
 * oxygen and nitrogen simultaneously, so they cannot be eliminated one at a
 * time. This uses Gaussian elimination with partial pivoting over the three
 * species rows, then searches subsets when there are more supplies than species
 * (an underdetermined system with many valid answers — the first non-negative
 * one found is used, preferring to draw from the supplies listed first).
 *
 * @returns The quantity to draw from each supply, or `null` if no non-negative
 *   solution exists.
 */
function solveAdditions(needed: Moles, supplies: SupplyGas[]): number[] | null {
  const n = supplies.length
  const b = [needed.o2, needed.he, needed.n2]

  // Nothing to add.
  if (b.every(v => Math.abs(v) < 1e-12)) return new Array<number>(n).fill(0)

  // Any negative requirement cannot be met by addition.
  if (b.some(v => v < -1e-9)) return null

  /** Solves the square/overdetermined system for a chosen subset of supplies. */
  const solveSubset = (indices: number[]): number[] | null => {
    const k = indices.length
    // Augmented 3 x (k+1) matrix.
    const M: number[][] = [
      [...indices.map(i => supplies[i].mix.o2), b[0]],
      [...indices.map(i => supplies[i].mix.he), b[1]],
      [...indices.map(i => supplies[i].mix.n2), b[2]],
    ]

    const rows = 3
    const pivotCols: number[] = []
    let row = 0

    for (let col = 0; col < k && row < rows; col++) {
      // Partial pivoting: pick the row with the largest magnitude in this column.
      let pivot = row
      for (let r = row + 1; r < rows; r++) {
        if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r
      }
      if (Math.abs(M[pivot][col]) < 1e-12) continue

      ;[M[row], M[pivot]] = [M[pivot], M[row]]

      const lead = M[row][col]
      for (let c = col; c <= k; c++) M[row][c] /= lead

      for (let r = 0; r < rows; r++) {
        if (r === row) continue
        const factor = M[r][col]
        if (Math.abs(factor) < 1e-15) continue
        for (let c = col; c <= k; c++) M[r][c] -= factor * M[row][c]
      }

      pivotCols.push(col)
      row++
    }

    // Rows that are all-zero on the left but non-zero on the right mean the
    // system is inconsistent — these supplies cannot produce this target.
    for (let r = row; r < rows; r++) {
      if (Math.abs(M[r][k]) > 1e-7) return null
    }

    // Free variables are set to zero; pivot variables read off the RHS.
    const x = new Array<number>(k).fill(0)
    for (let i = 0; i < pivotCols.length; i++) {
      x[pivotCols[i]] = M[i][k]
    }

    // Verify and require non-negativity.
    for (const v of x) {
      if (!Number.isFinite(v) || v < -1e-7) return null
    }
    const clamped = x.map(v => Math.max(0, v))

    const check = [0, 0, 0]
    for (let i = 0; i < k; i++) {
      const mix = supplies[indices[i]].mix
      check[0] += clamped[i] * mix.o2
      check[1] += clamped[i] * mix.he
      check[2] += clamped[i] * mix.n2
    }
    const scale = Math.max(1, Math.abs(b[0]) + Math.abs(b[1]) + Math.abs(b[2]))
    for (let s = 0; s < 3; s++) {
      if (Math.abs(check[s] - b[s]) > 1e-6 * scale) return null
    }

    return clamped
  }

  // Try the full supply set first, then progressively smaller subsets. Subsets
  // are enumerated in an order that prefers the supplies listed first, which
  // makes the plan stable and reproducible rather than depending on solver
  // internals.
  const orders: number[][] = []
  const all = Array.from({ length: n }, (_, i) => i)
  orders.push(all)
  for (let size = Math.min(3, n); size >= 1; size--) {
    const combine = (start: number, acc: number[]) => {
      if (acc.length === size) {
        orders.push([...acc])
        return
      }
      for (let i = start; i < n; i++) combine(i + 1, [...acc, i])
    }
    combine(0, [])
  }

  for (const indices of orders) {
    const partial = solveSubset(indices)
    if (partial) {
      const full = new Array<number>(n).fill(0)
      indices.forEach((supplyIndex, j) => {
        full[supplyIndex] += partial[j]
      })
      return full
    }
  }

  return null
}

/**
 * Plans a blend.
 *
 * The returned `finalMix` and `finalPressureBar` are always what the emitted
 * steps actually produce, computed by replaying them, never assumed to equal
 * the target. When the target cannot be reached, `feasible` is false and the
 * warnings say why.
 */
export function planBlend(request: BlendRequest): BlendPlan {
  const {
    target,
    targetPressureBar,
    current,
    currentPressureBar,
    tankVolumeL,
    temperatureC,
    supplies = DEFAULT_SUPPLIES,
  } = request

  const warnings: BlendWarning[] = []

  // --- Input validation ----------------------------------------------------
  if (!isValidGas(target)) throw new Error('Target mixture fractions must be non-negative and sum to 1')
  if (!isValidGas(current)) throw new Error('Current mixture fractions must be non-negative and sum to 1')
  if (!Number.isFinite(targetPressureBar) || targetPressureBar <= 0) {
    throw new Error(`Target pressure must be positive (got ${targetPressureBar} bar)`)
  }
  if (!Number.isFinite(currentPressureBar) || currentPressureBar < 0) {
    throw new Error(`Current pressure cannot be negative (got ${currentPressureBar} bar)`)
  }
  if (!Number.isFinite(tankVolumeL) || tankVolumeL <= 0) {
    throw new Error(`Tank volume must be positive (got ${tankVolumeL} L)`)
  }
  if (supplies.length === 0) throw new Error('At least one supply gas is required')
  for (const s of supplies) {
    // F5: a purity of zero used to divide by zero and yield Infinity.
    if (!isValidGas(s.mix)) {
      throw new Error(`Supply gas "${s.name}" has an invalid composition (fractions must sum to 1)`)
    }
  }

  // --- Choose the EOS once, for the whole blend ----------------------------
  // F9: deciding per-step let the model flip mid-plan and produce a
  // discontinuity between consecutive step pressures.
  let eos: EquationOfState = request.eos ?? 'ideal'
  if (eos === 'vdw' && !isVanDerWaalsSuitable(tankVolumeL, targetPressureBar, temperatureC, toVdw(target))) {
    eos = 'ideal'
    warnings.push({
      type: 'non-convergence',
      severity: 'info',
      message:
        'Van der Waals corrections are not physically meaningful for this tank size and pressure; the plan uses the ideal gas law throughout.',
    })
  }

  // --- Inventory in moles --------------------------------------------------
  const n0 = pressureToMoles(currentPressureBar, current, tankVolumeL, temperatureC, eos)
  const nTarget = pressureToMoles(targetPressureBar, target, tankVolumeL, temperatureC, eos)

  let held: Moles = { o2: current.o2 * n0, he: current.he * n0, n2: current.n2 * n0 }
  const wanted: Moles = { o2: target.o2 * nTarget, he: target.he * nTarget, n2: target.n2 * nTarget }

  const steps: BlendStep[] = []
  let stepNumber = 1

  // --- Feasibility: does anything need draining? ---------------------------
  // F3: the old code clamped required additions to Math.max(0, ...), so an
  // over-rich starting fill produced steps that could not reach the target,
  // and the final air step then forced the reported totals to the target mix.
  //
  // The first bound is per species: keeping more than targetMoles_i of any
  // species is impossible, since addition cannot remove gas.
  //   keepFraction <= min over species of (targetMoles_i / currentMoles_i)
  //
  // That bound is necessary but not sufficient. Draining is a uniform rescale,
  // so it lowers every species together; a fill that is over-rich in oxygen is
  // simultaneously made short of nitrogen, and the supplies may not be able to
  // restore the nitrogen without adding yet more oxygen. Concretely: a tank of
  // EAN40 drained only far enough to fix its oxygen still cannot reach EAN32,
  // because topping it up with air raises oxygen again.
  //
  // Since feasibility is monotone in keepFraction (draining further can only
  // help — an empty tank is always blendable from a sufficient supply set), the
  // largest feasible value is found by bisection on the solver itself.
  let keepFraction = 1
  for (const species of ['o2', 'he', 'n2'] as const) {
    if (held[species] > wanted[species] + 1e-12) {
      const allowed = held[species] > EPS ? wanted[species] / held[species] : 0
      keepFraction = Math.min(keepFraction, allowed)
    }
  }
  keepFraction = Math.max(0, Math.min(1, keepFraction))

  const feasibleAt = (fraction: number): boolean => {
    const kept: Moles = {
      o2: held.o2 * fraction,
      he: held.he * fraction,
      n2: held.n2 * fraction,
    }
    return (
      solveAdditions(
        { o2: wanted.o2 - kept.o2, he: wanted.he - kept.he, n2: wanted.n2 - kept.n2 },
        supplies
      ) !== null
    )
  }

  if (n0 > EPS && !feasibleAt(keepFraction)) {
    // Bisect for the largest keepable fraction. 40 iterations resolves to
    // roughly 1e-12 of the fill, far finer than any gauge.
    let lo = 0
    let hi = keepFraction
    if (feasibleAt(0)) {
      for (let i = 0; i < 40; i++) {
        const mid = 0.5 * (lo + hi)
        if (feasibleAt(mid)) lo = mid
        else hi = mid
      }
      keepFraction = lo
    } else {
      // Even a fully drained tank cannot reach the target from these supplies.
      keepFraction = 0
    }
  }

  if (keepFraction < 1 - 1e-9) {
    const pressureBefore = molesToPressure(totalMoles(held), toFractions(held), tankVolumeL, temperatureC, eos)
    held = { o2: held.o2 * keepFraction, he: held.he * keepFraction, n2: held.n2 * keepFraction }
    const pressureAfter = molesToPressure(totalMoles(held), toFractions(held), tankVolumeL, temperatureC, eos)

    steps.push({
      step: stepNumber++,
      action: 'Drain',
      gasName: 'Drain',
      addPressureBar: pressureAfter - pressureBefore,
      totalPressureBar: pressureAfter,
      resultingMix: toFractions(held),
      description: `Drain the tank down to ${pressureAfter.toFixed(1)} bar — the current fill is richer than the target in at least one gas, so part of it must be released before blending.`,
    })

    warnings.push({
      type: 'drain-required',
      severity: 'warning',
      message: `This blend requires draining to ${pressureAfter.toFixed(1)} bar first. The tank currently holds more of at least one gas than the target mix allows.`,
    })
  }

  // --- Solve the additions -------------------------------------------------
  const needed: Moles = {
    o2: wanted.o2 - held.o2,
    he: wanted.he - held.he,
    n2: wanted.n2 - held.n2,
  }

  const additions = solveAdditions(needed, supplies)

  if (additions === null) {
    warnings.push({
      type: 'infeasible',
      severity: 'danger',
      message:
        'This target cannot be reached from the available supply gases. Check that a helium, oxygen and diluent source are all present and that the target is not leaner in some gas than the supplies can produce.',
    })
    const finalPressure = molesToPressure(totalMoles(held), toFractions(held), tankVolumeL, temperatureC, eos)
    // When nothing is left in the tank there is no composition to report; keep
    // the target so callers always receive a mixture that sums to 1 rather than
    // three zeros, and rely on `feasible === false` to convey that no plan
    // exists. The pressure is reported as the truth: zero.
    const residualMix = totalMoles(held) > EPS ? toFractions(held) : target
    return {
      feasible: false,
      steps,
      finalMix: residualMix,
      finalPressureBar: finalPressure,
      warnings,
      eos,
    }
  }

  // --- Emit one step per supply gas actually used --------------------------
  for (let i = 0; i < supplies.length; i++) {
    const qty = additions[i]
    if (qty <= 1e-9) continue

    const supply = supplies[i]
    const pressureBefore = molesToPressure(totalMoles(held), toFractions(held), tankVolumeL, temperatureC, eos)

    held = {
      o2: held.o2 + qty * supply.mix.o2,
      he: held.he + qty * supply.mix.he,
      n2: held.n2 + qty * supply.mix.n2,
    }

    const mixAfter = toFractions(held)
    const pressureAfter = molesToPressure(totalMoles(held), mixAfter, tankVolumeL, temperatureC, eos)
    const delta = pressureAfter - pressureBefore

    steps.push({
      step: stepNumber++,
      action: `Add ${supply.name}`,
      gasName: supply.name,
      addPressureBar: delta,
      totalPressureBar: pressureAfter,
      resultingMix: mixAfter,
      description: `Add ${delta.toFixed(1)} bar of ${supply.name} — tank reaches ${pressureAfter.toFixed(1)} bar at ${(mixAfter.o2 * 100).toFixed(1)}% O₂ / ${(mixAfter.he * 100).toFixed(1)}% He.`,
    })
  }

  // --- Report what the steps actually produced -----------------------------
  const finalMix = toFractions(held)
  const finalPressureBar = molesToPressure(totalMoles(held), finalMix, tankVolumeL, temperatureC, eos)

  const o2ErrorPoints = Math.abs(finalMix.o2 - target.o2) * 100
  const heErrorPoints = Math.abs(finalMix.he - target.he) * 100
  const pressureError = Math.abs(finalPressureBar - targetPressureBar)

  if (o2ErrorPoints > 0.5 || heErrorPoints > 0.5) {
    warnings.push({
      type: 'accuracy',
      severity: 'warning',
      message: `The achievable mix is ${finalMix.o2 * 100 >= target.o2 * 100 ? 'richer' : 'leaner'} than the target: ${(finalMix.o2 * 100).toFixed(1)}% O₂ / ${(finalMix.he * 100).toFixed(1)}% He against a target of ${(target.o2 * 100).toFixed(1)}% / ${(target.he * 100).toFixed(1)}%. Analyse the tank before diving.`,
    })
  }

  if (pressureError > 1) {
    warnings.push({
      type: 'accuracy',
      severity: 'info',
      message: `The plan reaches ${finalPressureBar.toFixed(1)} bar against a target of ${targetPressureBar.toFixed(1)} bar.`,
    })
  }

  // --- Safety warnings on the resulting gas --------------------------------
  if (finalMix.o2 < 0.16 && finalMix.o2 > 0) {
    const ceiling = (0.16 / finalMix.o2 - 1) * 10
    warnings.push({
      type: 'hypoxic-result',
      severity: 'danger',
      message: `The resulting mix is hypoxic at ${(finalMix.o2 * 100).toFixed(1)}% O₂ — not breathable shallower than ${Math.ceil(ceiling)} m. A travel gas is required for the descent.`,
    })
  }

  if (finalMix.o2 > 0.4) {
    warnings.push({
      type: 'oxygen-clean-required',
      severity: 'warning',
      message: `The resulting mix is ${(finalMix.o2 * 100).toFixed(1)}% O₂ — oxygen-clean cylinder and valve are required.`,
    })
  }

  if (targetPressureBar > 300) {
    warnings.push({
      type: 'high-pressure',
      severity: 'warning',
      message: `Target pressure ${targetPressureBar.toFixed(0)} bar is above normal cylinder working pressures — confirm the cylinder rating and current hydro.`,
    })
  }

  const feasible = o2ErrorPoints <= 0.5 && heErrorPoints <= 0.5 && pressureError <= 1

  return {
    feasible,
    steps,
    finalMix,
    finalPressureBar,
    warnings,
    eos,
    finalCompressibilityFactor:
      eos === 'vdw' && finalPressureBar > 0
        ? stateFromPressure(finalPressureBar, temperatureC, toVdw(finalMix), tankVolumeL)
            .compressibilityFactor
        : 1,
  }
}

/** Convenience: builds a supply gas from a nitrox percentage. */
export function nitroxSupply(name: string, o2Percent: number): SupplyGas {
  return { name, mix: gas(o2Percent / 100) }
}

/** Convenience: builds a supply gas from a trimix percentage pair. */
export function trimixSupply(name: string, o2Percent: number, hePercent: number): SupplyGas {
  return { name, mix: gas(o2Percent / 100, hePercent / 100) }
}
