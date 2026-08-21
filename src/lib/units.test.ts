/**
 * C1: warning and rationale text must speak the diver's units.
 *
 * These tests are written against the physics of the conversion, not against
 * another formatted string: 30 m is 98.4252 ft because a foot is exactly
 * 0.3048 m, and 5.7 g/L is 0.3558 lb/ft³ because 1 g/L is 1 kg/m³. Each
 * expectation below is re-derived from those definitions rather than copied
 * from what the code currently prints.
 */

import { describe, expect, it } from 'vitest'
import {
  IMPERIAL_FORMATTER,
  METRIC_FORMATTER,
  barToPsi,
  formatterFor,
} from './units'

describe('METRIC_FORMATTER', () => {
  it('writes depths in metres', () => {
    expect(METRIC_FORMATTER.depth(30)).toBe('30 m')
  })

  it('trims a trailing zero rather than printing "30.0 m"', () => {
    expect(METRIC_FORMATTER.depth(30, 1)).toBe('30 m')
  })

  it('writes densities in g/L at one decimal by default', () => {
    expect(METRIC_FORMATTER.density(5.7)).toBe('5.7 g/L')
  })

  it('leaves partial pressures in bar', () => {
    expect(METRIC_FORMATTER.pressure(1.4)).toBe('1.4 bar')
  })
})

describe('IMPERIAL_FORMATTER', () => {
  it('converts metres to feet at the exact 0.3048 definition', () => {
    // 30 / 0.3048 = 98.4251968…, so a whole-foot render is 98 ft.
    expect(IMPERIAL_FORMATTER.depth(30)).toBe('98 ft')
  })

  it('converts a 40 m recreational limit to 131 ft', () => {
    // 40 / 0.3048 = 131.2335…
    expect(IMPERIAL_FORMATTER.depth(40)).toBe('131 ft')
  })

  it('converts density to lb/ft³', () => {
    // 5.7 g/L = 5.7 kg/m³; 1 kg/m³ = 0.0624279606 lb/ft³ → 0.35584 lb/ft³.
    expect(IMPERIAL_FORMATTER.density(5.7)).toBe('0.36 lb/ft³')
  })

  it('keeps two decimals on density, because one collapses the useful range', () => {
    // 5.7 and 7.0 g/L must not both render as "0.4 lb/ft³" — that would make a
    // target and a critical limit indistinguishable in the message text.
    expect(IMPERIAL_FORMATTER.density(5.7)).not.toBe(IMPERIAL_FORMATTER.density(7.0))
  })

  it('leaves partial pressure in bar — no agency or computer states ppO₂ in psi', () => {
    expect(IMPERIAL_FORMATTER.pressure(1.4)).toBe('1.4 bar')
  })
})

describe('formatterFor', () => {
  it('selects imperial for a feet preference', () => {
    expect(formatterFor('feet').depthUnit).toBe('ft')
  })

  it('selects metric for a metres preference', () => {
    expect(formatterFor('meters').depthUnit).toBe('m')
  })
})

describe('barToPsi', () => {
  it('converts using the exact Pa definitions of bar and psi', () => {
    // 1 bar = 100000 Pa; 1 psi = 6894.757293168 Pa → 14.5037738…
    expect(barToPsi(1)).toBeCloseTo(14.5037738, 6)
    expect(barToPsi(200)).toBeCloseTo(2900.75477, 4)
  })
})
