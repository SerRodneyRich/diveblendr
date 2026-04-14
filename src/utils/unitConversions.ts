import convert from 'convert';

/**
 * Unit conversion utilities for DiveBlendr
 * Maintains safety-first approach with conservative rounding
 */

export interface ConversionOptions {
  precision?: number;
  conservative?: boolean; // For safety-critical calculations
}

/**
 * Conservative rounding for safety-critical diving calculations
 * - Oxygen percentages round DOWN (safer for MOD calculations)
 * - Helium percentages round UP (safer for narcosis calculations)
 * - Pressure values round conservatively based on context
 */
export const safeRound = (value: number, precision: number = 1, roundDown: boolean = false): number => {
  const factor = Math.pow(10, precision);
  if (roundDown) {
    return Math.floor(value * factor) / factor;
  }
  return Math.round(value * factor) / factor;
};

/**
 * Pressure conversions (bar ↔ psi, bar ↔ atm)
 */
export const convertPressure = {
  barToPsi: (bar: number, options: ConversionOptions = {}): number => {
    const psi = convert(bar, 'bar').to('psi');
    return safeRound(psi, options.precision || 1, options.conservative);
  },
  
  psiToBar: (psi: number, options: ConversionOptions = {}): number => {
    const bar = convert(psi, 'psi').to('bar');
    return safeRound(bar, options.precision || 2, options.conservative);
  },
  
  barToAtm: (bar: number, options: ConversionOptions = {}): number => {
    const atm = convert(bar, 'bar').to('atm');
    return safeRound(atm, options.precision || 3, options.conservative);
  },
  
  atmToBar: (atm: number, options: ConversionOptions = {}): number => {
    const bar = convert(atm, 'atm').to('bar');
    return safeRound(bar, options.precision || 2, options.conservative);
  }
};

/**
 * Depth conversions (meters ↔ feet)
 */
export const convertDepth = {
  metersToFeet: (meters: number, options: ConversionOptions = {}): number => {
    const feet = convert(meters, 'm').to('ft');
    return safeRound(feet, options.precision || 1, options.conservative);
  },
  
  feetToMeters: (feet: number, options: ConversionOptions = {}): number => {
    const meters = convert(feet, 'ft').to('m');
    return safeRound(meters, options.precision || 1, options.conservative);
  }
};

/**
 * Temperature conversions (Celsius ↔ Fahrenheit)
 */
export const convertTemperature = {
  celsiusToFahrenheit: (celsius: number, options: ConversionOptions = {}): number => {
    const fahrenheit = convert(celsius, 'C').to('F');
    return safeRound(fahrenheit, options.precision || 1);
  },
  
  fahrenheitToCelsius: (fahrenheit: number, options: ConversionOptions = {}): number => {
    const celsius = convert(fahrenheit, 'F').to('C');
    return safeRound(celsius, options.precision || 1);
  }
};

/**
 * Volume conversions (liters ↔ cubic feet, liters ↔ cubic inches)
 */
export const convertVolume = {
  litersToCubicFeet: (liters: number, options: ConversionOptions = {}): number => {
    const cubicFeet = convert(liters, 'l').to('ft3');
    return safeRound(cubicFeet, options.precision || 2);
  },
  
  cubicFeetToLiters: (cubicFeet: number, options: ConversionOptions = {}): number => {
    const liters = convert(cubicFeet, 'ft3').to('l');
    return safeRound(liters, options.precision || 1);
  },
  
  litersToCubicInches: (liters: number, options: ConversionOptions = {}): number => {
    const cubicInches = convert(liters, 'l').to('in3');
    return safeRound(cubicInches, options.precision || 0);
  },
  
  cubicInchesToLiters: (cubicInches: number, options: ConversionOptions = {}): number => {
    const liters = convert(cubicInches, 'in3').to('l');
    return safeRound(liters, options.precision || 2);
  }
};

/**
 * Gas consumption rate conversions
 */
export const convertGasConsumption = {
  sacMetricToImperial: (litersPerMinute: number, options: ConversionOptions = {}): number => {
    // Convert L/min to ft³/min (convert volume, rate stays the same)
    const cubicFeetPerMinute = convert(litersPerMinute, 'l').to('ft3');
    return safeRound(cubicFeetPerMinute, options.precision || 2);
  },
  
  sacImperialToMetric: (cubicFeetPerMinute: number, options: ConversionOptions = {}): number => {
    // Convert ft³/min to L/min (convert volume, rate stays the same)
    const litersPerMinute = convert(cubicFeetPerMinute, 'ft3').to('l');
    return safeRound(litersPerMinute, options.precision || 1);
  }
};

/**
 * Convenience functions for common diving calculations
 */
export const divingConversions = {
  // MOD calculation with safety margin
  modMetersToFeet: (meters: number): number => {
    return convertDepth.metersToFeet(meters, { conservative: true });
  },
  
  modFeetToMeters: (feet: number): number => {
    return convertDepth.feetToMeters(feet, { conservative: true });
  },
  
  // Tank pressure with safety considerations
  workingPressureBarToPsi: (bar: number): number => {
    return convertPressure.barToPsi(bar, { precision: 0 });
  },
  
  workingPressurePsiToBar: (psi: number): number => {
    return convertPressure.psiToBar(psi, { precision: 1 });
  }
};

/**
 * Unit system detection and defaults
 */
export const getRegionalDefaults = () => {
  const locale = navigator.language || 'en-US';
  const isUSLocale = locale.startsWith('en-US') || locale.startsWith('en_US');
  
  return {
    system: isUSLocale ? 'imperial' : 'metric',
    pressure: isUSLocale ? 'psi' : 'bar',
    depth: isUSLocale ? 'feet' : 'meters',
    temperature: isUSLocale ? 'fahrenheit' : 'celsius',
    volume: isUSLocale ? 'cubic_feet' : 'liters',
  };
};