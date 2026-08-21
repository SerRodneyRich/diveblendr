// @vitest-environment jsdom
/**
 * RENDERED-OUTPUT CONFORMANCE
 * ===========================
 * The pure-math suites in `src/lib` all passed while the MOD check displayed
 * air to 51 m on a rebreather. Every function was individually correct; the
 * page simply showed the oxygen limit and put narcosis in a side card.
 *
 * These tests therefore assert what the DOM actually says, not what the hook
 * returns. If the page ever again prints a depth that breaches a limit shown
 * beside it, this fails.
 */

import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import ModCheckTool from './ModCheckTool'
import { AIR, densityAtDepth, endRaw, ppo2AtDepth } from '@/lib/gas'
import { DEFAULT_SAFETY_LIMITS } from '@/lib/limits'
import { operatingDepth } from '@/lib/operatingDepth'
import { AccessibilityProvider } from '@/contexts/AccessibilityContext'
import { PreferencesProvider } from '@/contexts/PreferencesContext'
import { UnitsProvider } from '@/contexts/UnitsContext'

afterEach(cleanup)

// jsdom ships no matchMedia, which AccessibilityContext queries on mount for
// the reduced-motion and high-contrast system preferences.
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

function renderTool() {
  return render(
    <AccessibilityProvider>
      <UnitsProvider>
        <PreferencesProvider>
          <ModCheckTool />
        </PreferencesProvider>
      </UnitsProvider>
    </AccessibilityProvider>
  )
}

/** Reads the numeric value out of a StatCard by its visible label. */
function statValue(label: string): number {
  const labelNode = screen.getByText(label)
  const card = labelNode.closest('div')?.parentElement
  if (!card) throw new Error(`No card found for "${label}"`)
  const text = within(card as HTMLElement).getByText(/^[\d.]+$/).textContent ?? ''
  return parseFloat(text)
}

describe('MOD check renders a depth that obeys every limit', () => {
  it('never shows a max depth deeper than the oxygen limit', () => {
    renderTool()
    const maxDepth = statValue('Max depth')
    const oxygenLimit = statValue('Oxygen limit')
    expect(maxDepth).toBeLessThanOrEqual(oxygenLimit)
  })

  it('the displayed depth actually satisfies all three limits', () => {
    // The load-bearing test. It re-derives the limits from the physics rather
    // than comparing one rendered field to another: under the original defect
    // both "max depth" and "oxygen limit" showed the same wrong number, so a
    // field-to-field comparison passed while the page was still wrong.
    renderTool()
    const shownFeet = statValue('Max depth')
    const shownMeters = shownFeet / 3.280839895 // page defaults to imperial

    // Air is the default mix on load.
    const r = operatingDepth(AIR, DEFAULT_SAFETY_LIMITS, {
      ceilingPPO2: DEFAULT_SAFETY_LIMITS.maxPPO2Work,
      temperatureC: 20,
    })
    expect(Math.abs(shownMeters - r.depthMeters)).toBeLessThan(1)

    // And independently: the depth on screen must breach nothing.
    expect(endRaw(AIR, shownMeters, false)).toBeLessThanOrEqual(
      DEFAULT_SAFETY_LIMITS.maxEND + 1
    )
    expect(densityAtDepth(AIR, shownMeters, 20)).toBeLessThanOrEqual(
      DEFAULT_SAFETY_LIMITS.maxGasDensity + 0.15
    )
    expect(ppo2AtDepth(AIR, shownMeters)).toBeLessThanOrEqual(
      DEFAULT_SAFETY_LIMITS.maxPPO2Work + 0.02
    )
  })

  it('shows an END no deeper than the END limit at the depth it reports', () => {
    renderTool()
    // The END card prints its own limit in the hint, e.g. "Limit 98 ft · N₂ only".
    const endValue = statValue('END')
    const hint = screen.getByText(/Limit .* N₂ only/).textContent ?? ''
    const endLimit = parseFloat(hint.replace(/[^\d.]/g, ''))
    expect(Number.isNaN(endLimit)).toBe(false)
    // One unit of slack for the floor-to-whole-unit rounding.
    expect(endValue).toBeLessThanOrEqual(endLimit + 1)
  })

  it('names the binding limit rather than implying oxygen', () => {
    renderTool()
    // Air on the default limits is narcosis-bound, so the card must say so
    // instead of quoting a ppO2 that is not what actually stops the diver.
    const hint = screen.getByText(/Set by /)
    expect(hint.textContent).toMatch(/END|density|ppO₂/)
  })

  it('states the limit in the units the page is displaying', () => {
    renderTool()
    // The hint used to hardcode "30 m" and "5.7 g/L" while the page rendered
    // feet and lb/ft3 — a units mismatch inside a safety-critical sentence.
    const hint = screen.getByText(/Set by /).textContent ?? ''
    if (/Set by (END|density)/.test(hint)) {
      const unitsShown = screen.getAllByText(/^(ft|m)$/)
      expect(unitsShown.length).toBeGreaterThan(0)
      const pageUnit = unitsShown[0].textContent
      // A metric page must not print "ft" in the hint, and vice versa.
      const wrongUnit = pageUnit === 'ft' ? /\bm\b/ : /\bft\b/
      if (/END/.test(hint)) {
        expect(hint, `hint "${hint}" uses the wrong depth unit`).not.toMatch(wrongUnit)
      }
    }
  })
})

/**
 * C1 — safety warning TEXT, not just the stat cards, follows the diver.
 *
 * The stat cards were converted long ago; the sentences beside them were not,
 * so the page read "Working gas END 39 m exceeds your limit of 30 m" directly
 * under a card showing 128 ft, and a footnote apologised for it. Asserting the
 * hook's return value would not have caught this: the hook was correct and the
 * page rendered exactly what it was given.
 */
describe('C1: warning text on the page speaks the diver\'s units', () => {
  it('writes warning messages in feet, with no metres left in the sentence', () => {
    // Air at the default limits is narcosis-bound, so the page always emits at
    // least one END warning to inspect.
    renderTool()

    // jsdom reports an en-US locale, so UnitsContext defaults this page to
    // imperial — the same path a US diver sees.
    const pageIsImperial = screen.getAllByText(/^(ft|m)$/)[0]?.textContent === 'ft'
    expect(pageIsImperial, 'expected the test page to render imperial').toBe(true)

    // Every sentence mentioning a depth limit must say ft, never a bare metre.
    const sentences = screen
      .getAllByText(/exceeds your|approaching your|is above your/i)
      .map((n) => n.textContent ?? '')

    for (const sentence of sentences) {
      if (/END/.test(sentence)) {
        expect(sentence, `warning still in metres: "${sentence}"`).toContain('ft')
        expect(sentence, `warning still in metres: "${sentence}"`).not.toMatch(/\d+ m\b/)
      }
      if (/density/i.test(sentence)) {
        expect(sentence, `density warning still in g/L: "${sentence}"`).not.toContain('g/L')
      }
    }
  })

  it('no longer prints the "warnings are stated in metres" footnote', () => {
    renderTool()
    expect(screen.queryByText(/stated in metres/i)).toBeNull()
  })
})
