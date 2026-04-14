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

/**
 * Solve Van der Waals cubic for molar volume
 */
export function solveMolarVolume(
  pressure: number,
  temperatureK: number,
  constants: VanDerWaalsConstants,
  maxIterations = 50,
  tolerance = 1e-8
): number {
  const { a, b } = constants;
  const RT = R_GAS_CONSTANT * temperatureK;

  let V = RT / pressure; // ideal guess

  for (let i = 0; i < maxIterations; i++) {
    const V2 = V * V;
    const V3 = V2 * V;

    const f = (pressure + a / V2) * (V - b) - RT;
    const df = pressure + a / V2 - (2 * a * (V - b)) / V3;

    if (Math.abs(df) < tolerance) break;
    const newV = V - f / df;

    if (newV > b && Math.abs(newV - V) < tolerance) return newV;
    if (newV <= b || !isFinite(newV)) {
      V = (V + b) / 2;
    } else {
      V = newV;
    }
  }
  return V;
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
      deviationPercent: 0
    };
  }

  if (!temperatureUtils.isValidTemperature(temperatureCelsius)) {
    throw new Error("Temperature outside valid range");
  }

  const T = temperatureUtils.celsiusToKelvin(temperatureCelsius);
  const constants = calculateMixtureConstants(mixture);

  const Vm = solveMolarVolume(pressure, T, constants);
  const Z = (pressure * Vm) / (R_GAS_CONSTANT * T);

  const molesInTank = tankSize / Vm;

  return {
    pressureBar: pressure,
    molarVolume: Vm,
    molesInTank,
    compressibilityFactor: Z,
    deviationPercent: (Z - 1) * 100
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
  
  // Check if Van der Waals is physically meaningful
  // If molar volume is too close to excluded volume, fall back to ideal gas
  if (Vm <= constants.b * 1.1) {
    // Fall back to ideal gas law: PV = nRT → P = nRT/V
    const P_ideal = (moles * R_GAS_CONSTANT * T) / tankSize;
    console.warn(`Van der Waals unphysical for small tank (${tankSize}L) with ${moles.toFixed(3)} moles - using ideal gas approximation`);
    
    return {
      pressureBar: P_ideal,
      molarVolume: Vm,
      compressibilityFactor: 1.0, // Ideal gas has Z = 1
      deviationPercent: 0.0       // No deviation for ideal gas fallback
    };
  }

  const P = (R_GAS_CONSTANT * T) / (Vm - constants.b) - constants.a / (Vm * Vm);
  const Z = (P * Vm) / (R_GAS_CONSTANT * T);

  return {
    pressureBar: P,
    molarVolume: Vm,
    compressibilityFactor: Z,
    deviationPercent: (Z - 1) * 100
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
