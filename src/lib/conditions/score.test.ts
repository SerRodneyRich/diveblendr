import { describe, it, expect } from 'vitest'
import { scoreConditions, scoreColor } from './score'

describe('scoreConditions', () => {
  it('returns null without a wave height, rather than scoring on partial data', () => {
    // Wave height is the one reading the score cannot be computed without. The
    // page shows nothing rather than a number built from three of four inputs.
    expect(scoreConditions({})).toBeNull()
    expect(scoreConditions({ waveHeight: null })).toBeNull()
    expect(scoreConditions({ waveHeight: undefined, swellHeight: 1 })).toBeNull()
    expect(scoreConditions({ waveHeight: Number.NaN })).toBeNull()
  })

  it('gives flat calm a perfect score', () => {
    const r = scoreConditions({
      waveHeight: 0.2,
      swellHeight: 0.2,
      windWaveHeight: 0.1,
      currentVelocity: 0.1,
    })
    expect(r!.score).toBe(100)
    expect(r!.rating).toBe('Excellent')
  })

  it('sums the four penalties independently', () => {
    // Re-derived from the bands rather than read back: wave >1 is -10, swell
    // >1.5 is -15, wind wave >0.5 is -5, current >1 is -15. 100-45 = 55.
    const r = scoreConditions({
      waveHeight: 1.2,
      swellHeight: 1.6,
      windWaveHeight: 0.6,
      currentVelocity: 1.1,
    })
    expect(r!.score).toBe(55)
    expect(r!.rating).toBe('Good')
  })

  it('treats a missing reading as no penalty, not as zero conditions', () => {
    const withCurrent = scoreConditions({ waveHeight: 0.4, currentVelocity: 2.5 })!
    const without = scoreConditions({ waveHeight: 0.4 })!
    expect(without.score).toBe(100)
    expect(withCurrent.score).toBe(75)
  })

  it('never leaves the 0–100 range however bad conditions are', () => {
    const r = scoreConditions({
      waveHeight: 12,
      swellHeight: 9,
      windWaveHeight: 7,
      currentVelocity: 6,
    })
    // 40+25+20+25 = 110 of penalty against a 100 start.
    expect(r!.score).toBe(0)
    expect(r!.rating).toBe('Very Poor')
  })

  it('picks the worst applicable band, not the first one it passes', () => {
    // Bands are ordered descending; a 3.5 m sea must take the -40, not the -5
    // it also qualifies for.
    expect(scoreConditions({ waveHeight: 3.5 })!.score).toBe(60)
  })

  it('names each rating band, with the score re-derived from the penalties', () => {
    // score, then the conditions that produce it:
    //  100  flat calm
    //   85  wave >1.5 (-15)
    //   70  wave >1.5, swell >1.5 (-15 -15)
    //   55  + wind wave >1.5 (-15)
    //   40  wave >3 (-40) alone... etc. Each expectation states its own sum.
    expect(scoreConditions({ waveHeight: 0.2 })!.rating).toBe('Excellent') // 100
    expect(scoreConditions({ waveHeight: 1.6 })!.rating).toBe('Excellent') // 85
    expect(scoreConditions({ waveHeight: 1.6, swellHeight: 1.6 })!.rating).toBe('Very Good') // 70
    expect(
      scoreConditions({ waveHeight: 1.6, swellHeight: 1.6, windWaveHeight: 1.6 })!.rating
    ).toBe('Good') // 55
    expect(scoreConditions({ waveHeight: 3.2, swellHeight: 1.1 })!.rating).toBe('Fair') // 50
    expect(
      scoreConditions({ waveHeight: 3.2, swellHeight: 2.6, windWaveHeight: 1.1 })!.rating
    ).toBe('Poor') // 25
    expect(
      scoreConditions({
        waveHeight: 3.2,
        swellHeight: 2.6,
        windWaveHeight: 2.1,
        currentVelocity: 1.6,
      })!.rating
    ).toBe('Very Poor') // 0
  })

  it('reports the readings it scored, so the page can explain itself', () => {
    const r = scoreConditions({ waveHeight: 1.2, currentVelocity: 0.7 })!
    expect(r.explanation.waveHeight).toBe(1.2)
    expect(r.explanation.currentVelocity).toBe(0.7)
    expect(r.explanation.swellHeight).toBeUndefined()
  })
})

describe('scoreColor', () => {
  it('runs green at 100 to red at 0', () => {
    expect(scoreColor(100)).toBe('rgb(0, 255, 0)')
    expect(scoreColor(0)).toBe('rgb(255, 0, 0)')
  })

  it('clamps out-of-range input rather than emitting invalid CSS', () => {
    expect(scoreColor(140)).toBe('rgb(0, 255, 0)')
    expect(scoreColor(-20)).toBe('rgb(255, 0, 0)')
  })
})
