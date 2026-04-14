import { useUnits, UnitPreferences } from '../contexts/UnitsContext';
import convert from 'convert';

interface ConversionResult {
  value: number;
  unit: string;
  formatted: string;
}

export const useUnitConversion = () => {
  const { preferences } = useUnits();

  // Pressure conversions (internal calculations always in bar)
  const convertPressure = (valueInBar: number, precision: number = 1): ConversionResult => {
    if (preferences.pressure === 'psi') {
      const psiValue = convert(valueInBar, 'bar').to('psi');
      return {
        value: psiValue,
        unit: 'psi',
        formatted: `${psiValue.toFixed(precision)} psi`
      };
    }
    
    return {
      value: valueInBar,
      unit: 'bar',
      formatted: `${valueInBar.toFixed(precision)} bar`
    };
  };

  // Depth conversions (internal calculations always in meters)
  const convertDepth = (valueInMeters: number, precision: number = 1): ConversionResult => {
    if (preferences.depth === 'feet') {
      const feetValue = convert(valueInMeters, 'm').to('ft');
      return {
        value: feetValue,
        unit: 'ft',
        formatted: `${feetValue.toFixed(precision)} ft`
      };
    }
    
    return {
      value: valueInMeters,
      unit: 'm',
      formatted: `${valueInMeters.toFixed(precision)} m`
    };
  };

  // Temperature conversions (internal calculations always in Celsius)
  const convertTemperature = (valueInCelsius: number, precision: number = 1): ConversionResult => {
    if (preferences.temperature === 'fahrenheit') {
      const fahrenheitValue = convert(valueInCelsius, 'C').to('F');
      return {
        value: fahrenheitValue,
        unit: '°F',
        formatted: `${fahrenheitValue.toFixed(precision)}°F`
      };
    }
    
    return {
      value: valueInCelsius,
      unit: '°C',
      formatted: `${valueInCelsius.toFixed(precision)}°C`
    };
  };

  // Volume conversions (internal calculations always in liters)
  const convertVolume = (valueInLiters: number, precision: number = 1): ConversionResult => {
    if (preferences.volume === 'cubic_feet') {
      const cubicFeetValue = convert(valueInLiters, 'l').to('ft3');
      return {
        value: cubicFeetValue,
        unit: 'ft³',
        formatted: `${cubicFeetValue.toFixed(precision)} ft³`
      };
    }
    
    return {
      value: valueInLiters,
      unit: 'L',
      formatted: `${valueInLiters.toFixed(precision)} L`
    };
  };

  // Density conversions (internal calculations always in g/L)
  const convertDensity = (valueInGramsPerLiter: number, precision: number = 2): ConversionResult => {
    if (preferences.system === 'imperial') {
      // Convert g/L to lb/ft³
      // 1 g/L = 0.062428 lb/ft³
      const lbPerCubicFeet = valueInGramsPerLiter * 0.062428;
      return {
        value: lbPerCubicFeet,
        unit: 'lb/ft³',
        formatted: `${lbPerCubicFeet.toFixed(precision)} lb/ft³`
      };
    }
    
    return {
      value: valueInGramsPerLiter,
      unit: 'g/L',
      formatted: `${valueInGramsPerLiter.toFixed(precision)} g/L`
    };
  };

  // Parse input values back to metric for calculations
  const parsePressureInput = (value: number): number => {
    if (preferences.pressure === 'psi') {
      return convert(value, 'psi').to('bar');
    }
    return value;
  };

  const parseDepthInput = (value: number): number => {
    if (preferences.depth === 'feet') {
      return convert(value, 'ft').to('m');
    }
    return value;
  };

  const parseTemperatureInput = (value: number): number => {
    if (preferences.temperature === 'fahrenheit') {
      return convert(value, 'F').to('C');
    }
    return value;
  };

  const parseVolumeInput = (value: number): number => {
    if (preferences.volume === 'cubic_feet') {
      return convert(value, 'ft3').to('l');
    }
    return value;
  };

  // Unit labels for UI display
  const getUnitLabels = () => ({
    pressure: preferences.pressure === 'psi' ? 'psi' : 'bar',
    depth: preferences.depth === 'feet' ? 'ft' : 'm',
    temperature: preferences.temperature === 'fahrenheit' ? '°F' : '°C',
    volume: preferences.volume === 'cubic_feet' ? 'ft³' : 'L',
    density: preferences.system === 'imperial' ? 'lb/ft³' : 'g/L',
  });

  // Conversion ranges for input validation
  const getConversionRanges = () => {
    if (preferences.system === 'imperial') {
      return {
        pressure: { min: 0, max: 6000 }, // PSI
        depth: { min: 0, max: 1000 }, // feet
        temperature: { min: 32, max: 212 }, // Fahrenheit
        volume: { min: 0, max: 10 }, // cubic feet
      };
    }
    
    return {
      pressure: { min: 0, max: 400 }, // bar
      depth: { min: 0, max: 300 }, // meters
      temperature: { min: 0, max: 100 }, // Celsius
      volume: { min: 0, max: 300 }, // liters
    };
  };

  return {
    convertPressure,
    convertDepth,
    convertTemperature,
    convertVolume,
    convertDensity,
    parsePressureInput,
    parseDepthInput,
    parseTemperatureInput,
    parseVolumeInput,
    getUnitLabels,
    getConversionRanges,
    preferences,
  };
};