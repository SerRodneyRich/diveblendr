/**
 * Van der Waals Real Gas Physics Calculations for Diving Gas Blending
 *
 * Van der Waals Equation: (P + a/V²)(V - b) = RT
 *
 * Units:
 * - P = pressure (bar)
 * - V = molar volume (L/mol)
 * - n = number of moles
 * - R = universal gas constant (0.083144626 L·bar/(mol·K))
 * - T = absolute temperature (K)
 * - a, b = Van der Waals constants
 */

export const R_GAS_CONSTANT = 0.083144626; // L·bar/(mol·K)
export const STP_TEMP_K = 273.15;
export const STP_PRESSURE_BAR = 1.01325;

export interface VanDerWaalsConstants {
  a: number;       // L²·bar/mol²
  b: number;       // L/mol
  molarMass: number; // g/mol
}

export const GAS_CONSTANTS: Record<string, VanDerWaalsConstants> = {
  O2: { a: 1.382, b: 0.03186, molarMass: 31.998 },
  N2: { a: 1.370, b: 0.03870, molarMass: 28.014 },
  He: { a: 0.0346, b: 0.02380, molarMass: 4.003 },
  Ar: { a: 1.355, b: 0.03201, molarMass: 39.948 }
};

export interface GasMixture {
  O2: number;
  He: number;
  N2: number;
}

/**
 * Quadratic mixing rule for a, linear for b and molar mass
 */
export function calculateMixtureConstants(mixture: GasMixture): VanDerWaalsConstants {
  const fractions = {
    O2: mixture.O2 / 100,
    He: mixture.He / 100,
    N2: mixture.N2 / 100
  };

  // quadratic mixing rule for "a"
  let aMix = 0;
  const gases = ["O2", "He", "N2"] as const;

  for (let i = 0; i < gases.length; i++) {
    for (let j = 0; j < gases.length; j++) {
      const yi = fractions[gases[i]];
      const yj = fractions[gases[j]];
      const ai = GAS_CONSTANTS[gases[i]].a;
      const aj = GAS_CONSTANTS[gases[j]].a;
      const kij = 0; // assume no binary interaction correction
      aMix += yi * yj * Math.sqrt(ai * aj) * (1 - kij);
    }
  }

  // linear mixing rule for "b"
  const bMix =
    fractions.O2 * GAS_CONSTANTS.O2.b +
    fractions.He * GAS_CONSTANTS.He.b +
    fractions.N2 * GAS_CONSTANTS.N2.b;

  // molar mass is linear average
  const molarMass =
    fractions.O2 * GAS_CONSTANTS.O2.molarMass +
    fractions.He * GAS_CONSTANTS.He.molarMass +
    fractions.N2 * GAS_CONSTANTS.N2.molarMass;

  return { a: aMix, b: bMix, molarMass };
}

export const temperatureUtils = {
  celsiusToKelvin: (c: number): number => c + 273.15,
  kelvinToCelsius: (k: number): number => k - 273.15,
  isValidTemperature: (c: number): boolean => c >= -10 && c <= 50
};

/** A numerical result that reports whether the solver actually converged. */
export interface ConvergenceResult {
  value: number;
  converged: boolean;
  /** Iterations actually performed. */
  iterations: number;
}

/**
 * Solve the Van der Waals cubic for molar volume by Newton iteration.
 *
 * F9: this previously returned the last iterate with no convergence signal, so
 * a caller could not distinguish a converged root from a value the solver had
 * simply given up on. It now returns `{ value, converged, iterations }`; use
 * {@link solveMolarVolume} for the bare value where the caller does not care.
 */
export function solveMolarVolumeChecked(
  pressure: number,
  temperatureK: number,
  constants: VanDerWaalsConstants,
  maxIterations = 50,
  tolerance = 1e-8
): ConvergenceResult {
  const { a, b } = constants;
  const RT = R_GAS_CONSTANT * temperatureK;

  if (!isFinite(pressure) || pressure <= 0) {
    return { value: Infinity, converged: false, iterations: 0 };
  }

  let V = RT / pressure; // ideal guess

  for (let i = 0; i < maxIterations; i++) {
    const V2 = V * V;
    const V3 = V2 * V;

    const f = (pressure + a / V2) * (V - b) - RT;
    const df = pressure + a / V2 - (2 * a * (V - b)) / V3;

    // A vanishing derivative means Newton cannot make progress from here.
    if (Math.abs(df) < tolerance) {
      return { value: V, converged: false, iterations: i + 1 };
    }

    const newV = V - f / df;

    if (newV > b && Math.abs(newV - V) < tolerance) {
      return { value: newV, converged: true, iterations: i + 1 };
    }
    if (newV <= b || !isFinite(newV)) {
      // The step left the physically meaningful region (molar volume must
      // exceed the excluded volume b); bisect back toward it instead.
      V = (V + b) / 2;
    } else {
      V = newV;
    }
  }

  // Exhausted the iteration budget without meeting the tolerance.
  return { value: V, converged: false, iterations: maxIterations };
}

/**
 * Solve Van der Waals cubic for molar volume, returning the bare value.
 * Prefer {@link solveMolarVolumeChecked} when the caller can act on
 * non-convergence.
 */
export function solveMolarVolume(
  pressure: number,
  temperatureK: number,
  constants: VanDerWaalsConstants,
  maxIterations = 50,
  tolerance = 1e-8
): number {
  return solveMolarVolumeChecked(pressure, temperatureK, constants, maxIterations, tolerance).value;
}

/**
 * State at given P, T, mixture
 */
export function stateFromPressure(
  pressure: number,
  temperatureCelsius: number,
  mixture: GasMixture,
  tankSize: number
) {
  // Gracefully handle invalid or zero pressure
  if (pressure <= 0 || !isFinite(pressure)) {
    return {
      pressureBar: 0,
      molarVolume: Infinity,
      molesInTank: 0,
      compressibilityFactor: 1,
      deviationPercent: 0,
      converged: true
    };
  }

  if (!temperatureUtils.isValidTemperature(temperatureCelsius)) {
    throw new Error("Temperature outside valid range");
  }

  const T = temperatureUtils.celsiusToKelvin(temperatureCelsius);
  const constants = calculateMixtureConstants(mixture);

  const solution = solveMolarVolumeChecked(pressure, T, constants);
  const Vm = solution.value;
  const Z = (pressure * Vm) / (R_GAS_CONSTANT * T);

  const molesInTank = tankSize / Vm;

  return {
    pressureBar: pressure,
    molarVolume: Vm,
    molesInTank,
    compressibilityFactor: Z,
    deviationPercent: (Z - 1) * 100,
    // F9: callers can now surface non-convergence as a blender warning rather
    // than silently consuming a value the solver never settled on.
    converged: solution.converged
  };
}

/**
 * Pressure from n, T, mixture
 */
export function pressureFromMoles(
  moles: number,
  temperatureCelsius: number,
  mixture: GasMixture,
  tankSize: number
) {
  if (moles < 0) throw new Error("Moles must be positive");
  if (!temperatureUtils.isValidTemperature(temperatureCelsius)) throw new Error("Temperature outside valid range");

  const T = temperatureUtils.celsiusToKelvin(temperatureCelsius);
  const constants = calculateMixtureConstants(mixture);

  const Vm = tankSize / moles;

  // Check if Van der Waals is physically meaningful. If the molar volume
  // approaches the excluded volume b, the equation has no useful root.
  //
  // F9: this used to emit a console.warn and switch to the ideal gas law
  // silently, mid-blend, which both violated the no-console rule and produced
  // a discontinuity between consecutive step pressures. The fallback value is
  // unchanged, but the switch is now reported through `converged: false` so
  // callers can decide once per blend rather than being surprised per step.
  // `src/lib/blending.ts` selects the equation of state up front for exactly
  // this reason.
  if (Vm <= constants.b * 1.1) {
    const P_ideal = (moles * R_GAS_CONSTANT * T) / tankSize;

    return {
      pressureBar: P_ideal,
      molarVolume: Vm,
      compressibilityFactor: 1.0, // Ideal gas has Z = 1
      deviationPercent: 0.0,      // No deviation for ideal gas fallback
      converged: false
    };
  }

  const P = (R_GAS_CONSTANT * T) / (Vm - constants.b) - constants.a / (Vm * Vm);
  const Z = (P * Vm) / (R_GAS_CONSTANT * T);

  return {
    pressureBar: P,
    molarVolume: Vm,
    compressibilityFactor: Z,
    deviationPercent: (Z - 1) * 100,
    converged: true
  };
}

/**
 * Should we apply real gas correction?
 */
export function shouldUseRealGas(
  pressure: number,
  temperatureCelsius: number,
  mixture: GasMixture
): boolean {
  if (pressure > 150) return true;
  if (temperatureCelsius < 10 && pressure > 100) return true;
  if (mixture.He > 50 && pressure > 200) return true;
  return false;
}

/**
 * Check if tank size and conditions are suitable for Van der Waals calculations
 * Very small tanks at high pressure can lead to unphysical states
 */
export function isVanDerWaalsSuitable(
  tankSize: number,
  pressure: number,
  temperatureCelsius: number,
  mixture: GasMixture
): boolean {
  // Basic criteria for real gas effects
  if (!shouldUseRealGas(pressure, temperatureCelsius, mixture)) {
    return false;
  }
  
  // Estimate molar volume at target conditions to check if VdW is physically meaningful
  // Using rough ideal gas estimate: n ≈ PV/RT
  const T = temperatureUtils.celsiusToKelvin(temperatureCelsius);
  const roughMoles = (pressure * tankSize) / (R_GAS_CONSTANT * T);
  const roughVm = tankSize / roughMoles;
  
  const constants = calculateMixtureConstants(mixture);
  
  // If estimated molar volume is too close to excluded volume, VdW is unsuitable
  if (roughVm <= constants.b * 1.2) {
    return false;
  }
  
  // Also avoid very small tanks where numerical precision becomes an issue
  if (tankSize < 1.0) {
    return false;
  }
  
  return true;
}
