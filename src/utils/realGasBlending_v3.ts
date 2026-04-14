/**
 * Real Gas Blending - Version 3 (accurate partial-pressure algorithm using van der Waals)
 *
 * Algorithm:
 *  - Compute initial moles (n0) from stateFromPressure(P0, mixture)
 *  - Compute final moles (n_final) from stateFromPressure(Pf, targetMixture)
 *  - Determine moles to add for He by solving for n_add_he such that He partial after addition equals target He partial
 *  - Compute remaining moles to add (B) and required pure O2 moles (n_o2) and air moles (n_air) by linear algebra
 *  - Compute actual pressure increments by calling pressureFromMoles(...) before/after each addition
 */

import {
  stateFromPressure,
  pressureFromMoles,
  temperatureUtils,
  shouldUseRealGas,
  R_GAS_CONSTANT,
  type GasMixture
} from './vanDeWaalsPhysics';

export interface RealGasBlendingParams {
  targetO2: number;
  targetHe: number;
  targetPressure: number;
  currentO2: number;
  currentHe: number;
  currentPressure: number;
  availableO2: number;
  availableHe: number;
  availableAir: number;
  tankSize: number;
  topOffO2: number;
  topOffHe: number;
  useRealGas: boolean;
  temperatureCelsius: number;
}

export interface RealGasStep {
  step: number;
  action: string;
  gasType: 'O2' | 'He' | 'Air' | 'Nitrox';
  addPressure: number;
  totalPressure: number;
  resultingO2: number;
  resultingHe: number;
  description: string;
  compressibilityFactor?: number;
  realGasDeviation?: number;
}

export interface RealGasResult {
  method: 'partial-pressure' | 'continuous' | 'top-off';
  steps: RealGasStep[];
  finalMix: { o2: number; he: number; n2: number };
  warnings: Array<{ type: string; message: string }>;
  useRealGas: boolean;
  temperature?: number;
  finalCompressibilityFactor?: number;
  finalRealGasDeviation?: number;
  realGasRecommendation?: boolean;
}

function calculateMixtureFractions(o2Moles: number, heMoles: number, totalMoles: number) {
  if (!isFinite(totalMoles) || totalMoles <= 0) return { o2: 0, he: 0, n2: 0 };
  const o2Frac = o2Moles / totalMoles;
  const heFrac = heMoles / totalMoles;
  const n2Frac = 1 - o2Frac - heFrac;
  return { o2: o2Frac * 100, he: heFrac * 100, n2: n2Frac * 100 };
}

export function performRealGasBlending(params: RealGasBlendingParams): RealGasResult {
  const {
    targetO2,
    targetHe,
    targetPressure,
    currentO2,
    currentHe,
    currentPressure,
    availableO2,
    availableHe,
    availableAir,
    tankSize,
    temperatureCelsius,
    useRealGas
  } = params;

  const steps: RealGasStep[] = [];
  const warnings: Array<{ type: string; message: string }> = [];

  if (!temperatureUtils.isValidTemperature(temperatureCelsius)) {
    throw new Error('Temperature out of range');
  }
  if (currentPressure < 0 || targetPressure <= 0) {
    throw new Error('Invalid pressures');
  }

  const initialMix: GasMixture = { O2: currentO2, He: currentHe, N2: Math.max(0, 100 - currentO2 - currentHe) };
  const targetMix: GasMixture = { O2: targetO2, He: targetHe, N2: Math.max(0, 100 - targetO2 - targetHe) };

  const state0 = stateFromPressure(currentPressure, temperatureCelsius, initialMix, tankSize);
  const stateFinal = stateFromPressure(targetPressure, temperatureCelsius, targetMix, tankSize);

  const n0 = state0.molesInTank;
  const nFinal = stateFinal.molesInTank;

  if (nFinal <= n0 + 1e-12) {
    return {
      method: 'partial-pressure',
      steps: [],
      finalMix: { o2: targetMix.O2, he: targetMix.He, n2: targetMix.N2 },
      warnings,
      useRealGas,
      temperature: temperatureCelsius,
      finalCompressibilityFactor: stateFinal.compressibilityFactor,
      finalRealGasDeviation: stateFinal.deviationPercent,
      realGasRecommendation: shouldUseRealGas(targetPressure, temperatureCelsius, targetMix)
    };
  }

  const n0_o2 = (initialMix.O2 / 100) * n0;
  const n0_he = (initialMix.He / 100) * n0;
  const nFinal_o2 = (targetMix.O2 / 100) * nFinal;
  const nFinal_he = (targetMix.He / 100) * nFinal;

  const targetHePartial = (targetMix.He / 100) * targetPressure;
  const totalMolesToAdd = nFinal - n0;

  function heliumResidual(x: number): number {
    const nAfter = n0 + x;
    const o2_m = n0_o2;
    const he_m = n0_he + x;
    const n2_m = Math.max(0, nAfter - o2_m - he_m);
    const mixAfter: GasMixture = {
      O2: nAfter > 0 ? (o2_m / nAfter) * 100 : 0,
      He: nAfter > 0 ? (he_m / nAfter) * 100 : 0,
      N2: nAfter > 0 ? (n2_m / nAfter) * 100 : 0
    };
    const pAfter = pressureFromMoles(nAfter, temperatureCelsius, mixAfter, tankSize).pressureBar;
    const hePartial = nAfter > 0 ? (he_m / nAfter) * pAfter : 0;
    return hePartial - targetHePartial;
  }

  let lo = 0;
  let hi = Math.max(totalMolesToAdd, 1e-6);
  let rLo = heliumResidual(lo);
  let rHi = heliumResidual(hi);

  let expandCount = 0;
  while (rLo * rHi > 0 && expandCount < 60) {
    hi *= 2;
    rHi = heliumResidual(hi);
    expandCount++;
  }

  let nAddHe = 0;
  if (rLo * rHi > 0) {
    nAddHe = 0; // fallback if no solution found
  } else {
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi);
      const rMid = heliumResidual(mid);
      if (Math.abs(rMid) < 1e-9) {
        nAddHe = mid;
        break;
      }
      if (rMid * rLo <= 0) {
        hi = mid;
        rHi = rMid;
      } else {
        lo = mid;
        rLo = rMid;
      }
      nAddHe = 0.5 * (lo + hi);
    }
  }

  const n1 = n0 + nAddHe;
  const n1_o2 = n0_o2;
  const n1_he = n0_he + nAddHe;

  const B = nFinal - n1;
  const A = nFinal_o2 - n1_o2;

  const nAir = Math.max(0, (B - A) / 0.79);
  const nO2 = Math.max(0, B - nAir);

  let workingTotalMoles = n0;
  let workingO2Moles = n0_o2;
  let workingHeMoles = n0_he;
  let stepCounter = 1;

  function pushStep(action: string, gasType: 'O2' | 'He' | 'Air', addPressure: number, totalPressure: number, o2: number, he: number, desc: string) {
    steps.push({
      step: stepCounter++,
      action,
      gasType,
      addPressure: Number.isFinite(addPressure) ? addPressure : 0,
      totalPressure: Number.isFinite(totalPressure) ? totalPressure : 0,
      resultingO2: o2,
      resultingHe: he,
      description: desc
    });
  }

  // --- Add Helium ---
  if (nAddHe > 1e-12) {
    // Account for helium purity - need more impure gas to get same amount of pure helium
    const actualHeGasMoles = nAddHe / (availableHe / 100);
    const before = pressureFromMoles(workingTotalMoles, temperatureCelsius, initialMix, tankSize).pressureBar;
    const afterMix: GasMixture = {
      O2: (workingO2Moles / (workingTotalMoles + actualHeGasMoles)) * 100,
      He: ((workingHeMoles + nAddHe) / (workingTotalMoles + actualHeGasMoles)) * 100,
      N2: 100 - ((workingO2Moles / (workingTotalMoles + actualHeGasMoles)) * 100) - (((workingHeMoles + nAddHe) / (workingTotalMoles + actualHeGasMoles)) * 100)
    };
    const after = pressureFromMoles(workingTotalMoles + actualHeGasMoles, temperatureCelsius, afterMix, tankSize).pressureBar;
    const addP = after - before;

    workingHeMoles += nAddHe;
    workingTotalMoles += actualHeGasMoles;
    const fractions = calculateMixtureFractions(workingO2Moles, workingHeMoles, workingTotalMoles);

    pushStep('Add He', 'He', addP, after, fractions.o2, fractions.he, `Added ${Number.isFinite(addP) ? addP.toFixed(2) : '0'} bar He (${availableHe}% purity)`);
  }

  // --- Add pure O2 ---
  if (nO2 > 1e-12) {
    // Account for oxygen purity - need more impure gas to get same amount of pure oxygen
    const actualO2GasMoles = nO2 / (availableO2 / 100);
    const before = pressureFromMoles(workingTotalMoles, temperatureCelsius, {
      O2: (workingO2Moles / workingTotalMoles) * 100,
      He: (workingHeMoles / workingTotalMoles) * 100,
      N2: 100 - (workingO2Moles / workingTotalMoles) * 100 - (workingHeMoles / workingTotalMoles) * 100
    }, tankSize).pressureBar;

    const afterMix: GasMixture = {
      O2: ((workingO2Moles + nO2) / (workingTotalMoles + actualO2GasMoles)) * 100,
      He: (workingHeMoles / (workingTotalMoles + actualO2GasMoles)) * 100,
      N2: 100 - (((workingO2Moles + nO2) / (workingTotalMoles + actualO2GasMoles)) * 100) - ((workingHeMoles / (workingTotalMoles + actualO2GasMoles)) * 100)
    };
    const after = pressureFromMoles(workingTotalMoles + actualO2GasMoles, temperatureCelsius, afterMix, tankSize).pressureBar;
    const addP = after - before;

    workingO2Moles += nO2;
    workingTotalMoles += actualO2GasMoles;
    const fractions = calculateMixtureFractions(workingO2Moles, workingHeMoles, workingTotalMoles);

    pushStep('Add O2', 'O2', addP, after, fractions.o2, fractions.he, `Added ${Number.isFinite(addP) ? addP.toFixed(2) : '0'} bar O₂ (${availableO2}% purity)`);
  }

  // --- Add Air (top-off) ---
  if (nAir > 1e-12) {
    const before = pressureFromMoles(workingTotalMoles, temperatureCelsius, {
      O2: (workingO2Moles / workingTotalMoles) * 100,
      He: (workingHeMoles / workingTotalMoles) * 100,
      N2: 100 - (workingO2Moles / workingTotalMoles) * 100 - (workingHeMoles / workingTotalMoles) * 100
    }, tankSize).pressureBar;

    const after = pressureFromMoles(nFinal, temperatureCelsius, targetMix, tankSize).pressureBar;
    const addP = after - before;

    workingTotalMoles = nFinal;
    workingO2Moles = nFinal * (targetMix.O2 / 100);
    workingHeMoles = nFinal * (targetMix.He / 100);

    const fractions = calculateMixtureFractions(workingO2Moles, workingHeMoles, workingTotalMoles);
    pushStep('Add Air', 'Air', addP, after, fractions.o2, fractions.he, `Added ${Number.isFinite(addP) ? addP.toFixed(2) : '0'} bar Air (${availableAir}% O₂)`);
  }

  const finalFractions = calculateMixtureFractions(workingO2Moles, workingHeMoles, workingTotalMoles);
  const finalState = stateFromPressure(targetPressure, temperatureCelsius, targetMix, tankSize);

  return {
    method: 'partial-pressure',
    steps,
    finalMix: { o2: finalFractions.o2, he: finalFractions.he, n2: finalFractions.n2 },
    warnings,
    useRealGas,
    temperature: temperatureCelsius,
    finalCompressibilityFactor: finalState.compressibilityFactor,
    finalRealGasDeviation: finalState.deviationPercent,
    realGasRecommendation: shouldUseRealGas(targetPressure, temperatureCelsius, targetMix)
  };
}
