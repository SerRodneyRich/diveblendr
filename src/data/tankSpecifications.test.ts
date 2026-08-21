import { describe, it, expect } from 'vitest'
import { tankSpecifications, getTankById, getCommonTanks, type TankSpecification } from './tankSpecifications'
import { stateFromPressure } from '@/utils/vanDeWaalsPhysics'

/**
 * F12 — tank data verification.
 *
 * TWO SCHEMA FINDINGS THE AUDIT DID NOT ANTICIPATE
 * ------------------------------------------------
 * 1. The audit proposed asserting `waterVolumeCuFt ≈ waterVolumeL × 0.0353`.
 *    That relation holds for no entry and should not: the field does not hold a
 *    water volume. It holds the cylinder's free-gas **capacity rating** — the
 *    "80" in AL80. An AL80 has a water volume of 11.1 L (0.39 cu ft) and a
 *    rating of 77.4 cu ft; they differ by the compression ratio (~204x).
 *
 * 2. A capacity rating is not quoted at the stamped service pressure for every
 *    cylinder family. US "low pressure" steels are stamped 2400 psi but sold as
 *    "LP85 / LP95 / LP120" against the +10% overfill pressure permitted under a
 *    DOT special permit. `ratingPressureBar` now records that explicitly.
 *
 * THE MODEL USED BELOW
 * --------------------
 * Capacity is computed with real-gas compressibility rather than the ideal gas
 * law, using the Van der Waals machinery already in `vanDeWaalsPhysics.ts`:
 *
 *   capacity [cu ft] = waterVolumeL × (P_rating / 1 atm) × 0.0353147 / Z(P, T)
 *
 * where Z is evaluated for air at 15 °C. This matters: Z is 0.954 at 165 bar
 * (gas is MORE compressible than ideal, so a cylinder holds ~5% more than the
 * ideal figure) but 1.090 at 300 bar (LESS compressible, holding ~8% less).
 * An ideal-gas check therefore mis-estimates in opposite directions at the two
 * ends of the range, which is why one tolerance could not cover the dataset.
 *
 * WHAT REMAINS UNVERIFIED
 * -----------------------
 * The tolerance below is 8%, which is wide. Manufacturers round nominal ratings
 * heavily (a "100" is not 100.0), and the exact fill temperature a rating is
 * quoted at is not standardised across Faber, Worthington, Luxfer and Catalina.
 * The check is therefore a guard against gross data errors — a transposed
 * figure, a copied row, a rating attached to the wrong pressure — and not a
 * claim that every value has been reconciled to a manufacturer spec sheet.
 * Entries whose true values remain unconfirmed are flagged in the data file.
 */

const LITERS_TO_CUBIC_FEET = 0.0353147
const BAR_TO_PSI = 14.5038
const ATM_BAR = 1.01325

/** Air, in the percentage shape `vanDeWaalsPhysics` expects. */
const AIR_VDW = { O2: 21, He: 0, N2: 79 }

/** Reference temperature for a capacity rating. */
const RATING_TEMP_C = 15

/** The pressure a cylinder's capacity rating is quoted at. */
function ratingPressure(tank: TankSpecification): number {
  return tank.ratingPressureBar ?? tank.workingPressureBar
}

/**
 * Expected free-gas capacity in cubic feet, corrected for real-gas
 * compressibility at the rating pressure.
 */
function expectedCapacityCuFt(tank: TankSpecification): number {
  const p = ratingPressure(tank)
  const z = stateFromPressure(p, RATING_TEMP_C, AIR_VDW, 1).compressibilityFactor
  return (tank.waterVolumeL * (p / ATM_BAR) * LITERS_TO_CUBIC_FEET) / z
}

describe('tankSpecifications — structural integrity', () => {
  it('has entries', () => {
    expect(tankSpecifications.length).toBeGreaterThan(0)
  })

  it('has a unique id for every tank', () => {
    const ids = tankSpecifications.map(t => t.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('has a non-empty name and common name for every tank', () => {
    for (const tank of tankSpecifications) {
      expect(tank.name.length, tank.id).toBeGreaterThan(0)
      expect(tank.commonName.length, tank.id).toBeGreaterThan(0)
    }
  })

  it('has positive, finite numeric fields for every tank', () => {
    for (const tank of tankSpecifications) {
      for (const field of ['waterVolumeL', 'waterVolumeCuFt', 'workingPressureBar', 'workingPressurePSI'] as const) {
        expect(Number.isFinite(tank[field]), `${tank.id}.${field}`).toBe(true)
        expect(tank[field], `${tank.id}.${field}`).toBeGreaterThan(0)
      }
    }
  })

  it('uses only the declared enum values', () => {
    for (const tank of tankSpecifications) {
      expect(['aluminum', 'steel', 'carbon'], tank.id).toContain(tank.material)
      expect(['single', 'twinset'], tank.id).toContain(tank.type)
      expect(['metric', 'imperial', 'universal'], tank.id).toContain(tank.region)
    }
  })
})

describe('tankSpecifications — helper functions', () => {
  it('finds a tank by id', () => {
    expect(getTankById('al80-metric')?.name).toBe('AL80')
    expect(getTankById('does-not-exist')).toBeUndefined()
  })

  // Regression: getCommonTanks listed 's19-catalina', but the entry's id is
  // 's19', so that tank silently never appeared in the common list.
  it('returns a tank for every id getCommonTanks references', () => {
    const common = getCommonTanks()
    expect(common.length).toBeGreaterThan(0)
    for (const tank of common) {
      expect(getTankById(tank.id)).toBeDefined()
    }
    // The list names eight cylinders; all eight must resolve.
    expect(common).toHaveLength(8)
  })
})

describe('tankSpecifications — unit-pair consistency', () => {
  // This is the check the audit specified, and it holds for every entry.
  it('has workingPressurePSI within 2% of workingPressureBar × 14.5038', () => {
    for (const tank of tankSpecifications) {
      const expected = tank.workingPressureBar * BAR_TO_PSI
      const error = Math.abs(tank.workingPressurePSI - expected) / expected
      expect(
        error,
        `${tank.id}: ${tank.workingPressureBar} bar vs ${tank.workingPressurePSI} psi (expected ~${expected.toFixed(0)})`
      ).toBeLessThan(0.02)
    }
  })

  it('never quotes a rating pressure below the working pressure without reason', () => {
    for (const tank of tankSpecifications) {
      if (tank.ratingPressureBar === undefined) continue
      // A rating pressure only exists to capture the +10% overfill convention,
      // so it must be above the stamped pressure and no more than 25% above.
      expect(tank.ratingPressureBar, tank.id).toBeGreaterThan(tank.workingPressureBar)
      expect(tank.ratingPressureBar, tank.id).toBeLessThanOrEqual(tank.workingPressureBar * 1.25)
    }
  })
})

describe('tankSpecifications — capacity rating vs water volume', () => {
  /**
   * The AL80 is the reference the audit named as already correct: 11.1 L water
   * volume, 207 bar, rated 77.4 cu ft actual rather than the marketing "80".
   * With Z = 0.983 for air at 207 bar and 15 °C:
   *   11.1 × (207 / 1.01325) × 0.0353147 / 0.983 = 81.4 cu ft
   * against a published 77.4, i.e. Luxfer rates it ~5% under the physical
   * figure. That conservatism is consistent across the aluminium range.
   */
  it('uses AL80 as the reference: 11.1 L at 207 bar rated 77.4 cu ft', () => {
    const al80 = getTankById('al80-metric')
    expect(al80).toBeDefined()
    expect(al80!.waterVolumeL).toBeCloseTo(11.1, 2)
    expect(al80!.workingPressureBar).toBe(207)
    expect(al80!.waterVolumeCuFt).toBeCloseTo(77.4, 1)
    expect(expectedCapacityCuFt(al80!)).toBeCloseTo(81.4, 0)
  })

  it('has a capacity rating within 8% of the real-gas figure for every tank', () => {
    const failures: string[] = []
    for (const tank of tankSpecifications) {
      const expected = expectedCapacityCuFt(tank)
      const error = Math.abs(tank.waterVolumeCuFt - expected) / expected
      if (error >= 0.08) {
        failures.push(
          `${tank.id}: ${tank.waterVolumeL} L @ ${ratingPressure(tank)} bar implies ${expected.toFixed(1)} cu ft, but the rating is ${tank.waterVolumeCuFt} (${(error * 100).toFixed(1)}% off)`
        )
      }
    }
    expect(failures.join('\n')).toBe('')
  })

  /**
   * Guards the specific error found during this audit: the two 300 bar entries
   * carried the capacity ratings of their 232 bar namesakes. A cylinder of the
   * same water volume at a higher pressure must hold proportionally more gas,
   * so identical ratings across different pressures are a copy-paste error.
   */
  it('never gives two tanks of equal water volume the same rating at different pressures', () => {
    const byVolume = new Map<number, TankSpecification[]>()
    for (const tank of tankSpecifications) {
      const list = byVolume.get(tank.waterVolumeL) ?? []
      list.push(tank)
      byVolume.set(tank.waterVolumeL, list)
    }
    for (const [volume, tanks] of byVolume) {
      for (let i = 0; i < tanks.length; i++) {
        for (let j = i + 1; j < tanks.length; j++) {
          const a = tanks[i]
          const b = tanks[j]
          if (ratingPressure(a) === ratingPressure(b)) continue
          expect(
            a.waterVolumeCuFt,
            `${a.id} and ${b.id} are both ${volume} L but at ${ratingPressure(a)} vs ${ratingPressure(b)} bar, so they cannot share a rating of ${a.waterVolumeCuFt} cu ft`
          ).not.toBe(b.waterVolumeCuFt)
        }
      }
    }
  })

  it('gives a higher rating to the higher-pressure cylinder of the same volume', () => {
    const hp12 = getTankById('steel-12l-300')
    const lp12 = getTankById('steel-12l-232')
    expect(hp12).toBeDefined()
    expect(lp12).toBeDefined()
    expect(hp12!.waterVolumeL).toBe(lp12!.waterVolumeL)
    expect(hp12!.waterVolumeCuFt).toBeGreaterThan(lp12!.waterVolumeCuFt)
  })

  // Guards against the classic error of storing the marketing rating in the
  // water-volume field.
  it('never confuses the water volume with the capacity rating', () => {
    for (const tank of tankSpecifications) {
      expect(tank.waterVolumeL, tank.id).toBeLessThan(tank.waterVolumeCuFt)
      expect(tank.waterVolumeL, tank.id).toBeLessThan(60)
    }
  })
})

describe('tankSpecifications — physical plausibility', () => {
  it('has water volumes in a plausible diving range', () => {
    for (const tank of tankSpecifications) {
      expect(tank.waterVolumeL, tank.id).toBeGreaterThanOrEqual(0.5)
      expect(tank.waterVolumeL, tank.id).toBeLessThanOrEqual(50)
    }
  })

  it('has working pressures in a plausible diving range', () => {
    for (const tank of tankSpecifications) {
      expect(tank.workingPressureBar, tank.id).toBeGreaterThanOrEqual(150)
      expect(tank.workingPressureBar, tank.id).toBeLessThanOrEqual(300)
    }
  })

  it('gives aluminium tanks a standard aluminium service pressure', () => {
    for (const tank of tankSpecifications.filter(t => t.material === 'aluminum')) {
      expect([207, 232], `${tank.id} at ${tank.workingPressureBar} bar`).toContain(
        tank.workingPressureBar
      )
    }
  })

  it('makes twinsets exactly twice the volume of their single counterpart where one exists', () => {
    const pairs: Array<[string, string]> = [
      ['twin-al80', 'al80-metric'],
      ['twin-12l', 'steel-12l-232'],
      ['twin-15l', 'steel-15l-232'],
      ['twin-18l', 'steel-18l-232'],
    ]
    for (const [twinId, singleId] of pairs) {
      const twin = getTankById(twinId)
      const single = getTankById(singleId)
      expect(twin, twinId).toBeDefined()
      expect(single, singleId).toBeDefined()
      expect(twin!.waterVolumeL, twinId).toBeCloseTo(single!.waterVolumeL * 2, 1)
      expect(twin!.waterVolumeCuFt, twinId).toBeCloseTo(single!.waterVolumeCuFt * 2, 0)
    }
  })
})
