/**
 * Formats a `Dive` into the card's stat strings.
 *
 * Pure and framework-free: the unit *preference* is passed in as a plain value
 * rather than read from context, so this stays testable and the page keeps a
 * single source of truth for units (the drawer footer, via `useUnits`). A page
 * that forked units into local state is exactly the bug CLAUDE.md warns about.
 */

import type { CardStat, StatId } from './card'
import type { Dive } from './types'

export interface StatUnits {
  depth: 'meters' | 'feet'
  temperature: 'celsius' | 'fahrenheit'
}

const METRES_TO_FEET = 3.280839895

/** Formats a duration in seconds as h:mm or m:ss. */
export function formatDuration(seconds: number): { value: string; unit: string } {
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60

  if (hours > 0) {
    return { value: `${hours}:${String(minutes).padStart(2, '0')}`, unit: 'h' }
  }
  return { value: `${minutes}:${String(secs).padStart(2, '0')}`, unit: 'min' }
}

/** Formats a surface interval, which is usually reported coarsely. */
export function formatInterval(seconds: number): { value: string; unit: string } {
  const total = Math.max(0, Math.round(seconds))
  if (total >= 3600) {
    const hours = Math.floor(total / 3600)
    const minutes = Math.floor((total % 3600) / 60)
    return { value: `${hours}:${String(minutes).padStart(2, '0')}`, unit: 'h' }
  }
  return { value: String(Math.round(total / 60)), unit: 'min' }
}

function formatDepth(metres: number, units: StatUnits): { value: string; unit: string } {
  if (units.depth === 'feet') {
    return { value: (metres * METRES_TO_FEET).toFixed(0), unit: 'ft' }
  }
  return { value: metres.toFixed(1), unit: 'm' }
}

function formatTemp(celsius: number, units: StatUnits): { value: string; unit: string } {
  if (units.temperature === 'fahrenheit') {
    return { value: ((celsius * 9) / 5 + 32).toFixed(0), unit: '°F' }
  }
  return { value: celsius.toFixed(0), unit: '°C' }
}

/** Renders a gas as a diver would name it: EAN32, 21/35, Air. */
export function gasLabel(gas: { o2: number; he: number }): string {
  if (gas.he > 0) return `${Math.round(gas.o2)}/${Math.round(gas.he)}`
  if (Math.round(gas.o2) === 21) return 'Air'
  return `EAN${Math.round(gas.o2)}`
}

/** Every stat this dive can support, in the order they read best on a card. */
export function availableStats(dive: Dive): StatId[] {
  const stats: StatId[] = ['maxDepth', 'duration']
  if (dive.waterTemp !== undefined) stats.push('waterTemp')
  if (dive.startTime) stats.push('date')
  if (dive.gases && dive.gases.length > 0) stats.push('gas')
  if (dive.surfaceInterval !== undefined) stats.push('surfaceInterval')
  if (dive.diveNumber !== undefined) stats.push('diveNumber')
  return stats
}

/**
 * Default selection: the four a diver actually shares.
 *
 * The row renders at most four across, so offering more by default would
 * silently drop the tail rather than showing it.
 */
export const MAX_CARD_STATS = 4

export function defaultStats(dive: Dive): StatId[] {
  return availableStats(dive).slice(0, MAX_CARD_STATS)
}

/**
 * Builds the formatted stat for one id, or undefined when this dive has no
 * value for it.
 */
export function buildStat(dive: Dive, id: StatId, units: StatUnits): CardStat | undefined {
  switch (id) {
    case 'maxDepth': {
      const { value, unit } = formatDepth(dive.maxDepth, units)
      return { id, label: 'Max depth', value, unit }
    }
    case 'duration': {
      const { value, unit } = formatDuration(dive.duration)
      return { id, label: 'Dive time', value, unit }
    }
    case 'waterTemp': {
      if (dive.waterTemp === undefined) return undefined
      const { value, unit } = formatTemp(dive.waterTemp, units)
      return { id, label: 'Water temp', value, unit }
    }
    case 'date': {
      if (!dive.startTime) return undefined
      // Day and month only. The full "Sep 26, 2025" is three times the width
      // of every other figure in the row, so it either clipped or dragged the
      // whole row's type size down to fit one stat. The year lives in the
      // subtitle, which is a line of prose and has room for it.
      return {
        id,
        label: 'Date',
        value: dive.startTime.toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
        }),
      }
    }
    case 'surfaceInterval': {
      if (dive.surfaceInterval === undefined) return undefined
      const { value, unit } = formatInterval(dive.surfaceInterval)
      return { id, label: 'Surface interval', value, unit }
    }
    case 'gas': {
      if (!dive.gases || dive.gases.length === 0) return undefined
      // Stacked, not joined. A technical dive carries three or four mixes and
      // they do not fit a single line beside three other figures.
      const labels = dive.gases.map(gasLabel)
      return {
        id,
        label: labels.length > 1 ? 'Gases' : 'Gas',
        value: labels[0],
        extraLines: labels.slice(1),
      }
    }
    case 'diveNumber': {
      if (dive.diveNumber === undefined) return undefined
      return { id, label: 'Dive number', value: `#${dive.diveNumber}` }
    }
  }
}

/** Builds every selected stat, dropping those this dive cannot supply. */
export function buildStats(dive: Dive, ids: StatId[], units: StatUnits): CardStat[] {
  return ids
    .map((id) => buildStat(dive, id, units))
    .filter((stat): stat is CardStat => stat !== undefined)
}

/** Human label for a stat id, for the picker checkboxes. */
export const STAT_LABELS: Record<StatId, string> = {
  maxDepth: 'Max depth',
  duration: 'Dive time',
  waterTemp: 'Water temperature',
  date: 'Date',
  surfaceInterval: 'Surface interval',
  gas: 'Gas',
  diveNumber: 'Dive number',
}
