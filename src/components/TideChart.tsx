'use client'

import React, { memo } from 'react'
import type { TooltipItem } from 'chart.js'
import { GiWaves } from 'react-icons/gi'
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import type { TideDay } from '@/lib/conditions/tides'

/**
 * Chart.js is loaded lazily, but deliberately *not* via `React.lazy` +
 * `next/dynamic` + a bare `await import()` stacked on top of each other.
 *
 * That earlier arrangement nested three independent lazy-loading mechanisms
 * around the same two packages: the page wrapped this component in
 * `dynamic(..., {ssr:false})`, this module wrapped `react-chartjs-2` in
 * `React.lazy`, and `registerChart()` separately `await import`ed `chart.js`
 * for its side effect. Each layer creates its own webpack chunk edge, and
 * `chart.js`/`react-chartjs-2` share internals — so the chunk graph contained a
 * cycle whose resolution order depended on which module happened to be
 * instantiated first. When the prerenderer lost that race, the shared chunk was
 * still a partially-initialised module object and webpack's runtime `require`
 * returned `undefined`, producing the intermittent
 * "Cannot read properties of undefined (reading 'call')" export failure.
 *
 * One import site, resolved once, removes the race: both packages come from a
 * single `Promise.all` and the component only renders after it settles.
 */
type LineComponent = typeof import('react-chartjs-2')['Line']

let chartModulesPromise: Promise<LineComponent> | null = null

const loadChart = (): Promise<LineComponent> => {
  // Cached so remounts reuse the resolved module instead of racing a new import.
  if (!chartModulesPromise) {
    chartModulesPromise = Promise.all([
      import('chart.js'),
      import('react-chartjs-2'),
    ]).then(([chartModule, reactChartModule]) => {
      const {
        Chart: ChartJS,
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        Title,
        Tooltip,
        Legend,
      } = chartModule

      // register() is idempotent for a given set of components, and the cached
      // promise means this runs once per page load anyway.
      ChartJS.register(
        CategoryScale,
        LinearScale,
        PointElement,
        LineElement,
        Title,
        Tooltip,
        Legend,
        backgroundZonesPlugin
      )

      return reactChartModule.Line
    })
  }
  return chartModulesPromise
}

// Types for the background zones plugin
interface BackgroundZone {
  from: number
  to: number
  color: string
}

interface ChartWithBackgroundZones {
  ctx: CanvasRenderingContext2D
  chartArea: { top: number; bottom: number }
  scales: {
    x: {
      getPixelForValue: (value: number) => number
    }
  }
  options: {
    plugins?: {
      backgroundZones?: {
        zones: BackgroundZone[]
      }
    }
  }
}

// Background zones plugin for day/night visualization
const backgroundZonesPlugin = {
  id: 'backgroundZones',
  beforeDraw: (chart: ChartWithBackgroundZones) => {
    const { ctx, chartArea, scales } = chart
    const zones = chart.options.plugins?.backgroundZones?.zones || []
    
    zones.forEach((zone: BackgroundZone) => {
      const xStart = scales.x.getPixelForValue(zone.from)
      const xEnd = scales.x.getPixelForValue(zone.to)
      
      ctx.save()
      ctx.fillStyle = zone.color
      ctx.fillRect(xStart, chartArea.top, xEnd - xStart, chartArea.bottom - chartArea.top)
      ctx.restore()
    })
  }
}

interface TideChartProps {
  tideData: TideDay
  selectedDate: Date
  onNavigateDate: (direction: 'prev' | 'next') => void
}

const TideChart = memo(({ tideData, selectedDate, onNavigateDate }: TideChartProps) => {
  const { convertDepth, preferences } = useUnitConversion()
  // Holding the component itself (rather than a "ready" boolean) means there is
  // no window where chartReady is true but the module is not actually resolved.
  const [Chart, setChart] = React.useState<LineComponent | null>(null)
  
  // Check if navigation should be disabled
  const canNavigatePrev = React.useMemo(() => {
    if (!tideData.availableDateRange) return false // No range known yet; leave navigation enabled
    const prevDate = new Date(selectedDate)
    prevDate.setDate(prevDate.getDate() - 1)
    return prevDate >= new Date(tideData.availableDateRange.startDate.toDateString())
  }, [selectedDate, tideData.availableDateRange])
  
  const canNavigateNext = React.useMemo(() => {
    if (!tideData.availableDateRange) return false // No range known yet; leave navigation enabled
    const nextDate = new Date(selectedDate)
    nextDate.setDate(nextDate.getDate() + 1)
    return nextDate <= new Date(tideData.availableDateRange.endDate.toDateString())
  }, [selectedDate, tideData.availableDateRange])

  React.useEffect(() => {
    let active = true
    loadChart().then((Line) => {
      // Guard against setting state after unmount (e.g. fast route changes).
      if (active) setChart(() => Line)
    })
    return () => {
      active = false
    }
  }, [])

  const getTideChartData = () => {
    return {
      labels: tideData.hours.map((hour: number) => `${hour.toString().padStart(2, '0')}:00`),
      datasets: [
        {
          label: `Tide Height (${preferences.depth === 'meters' ? 'm' : 'ft'})`,
          data: tideData.heights.map((height: number) => convertDepth(height, 2).value),
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          fill: true,
          tension: 0.4,
          pointRadius: 0,
          pointHoverRadius: 5,
        }
      ]
    }
  }

  const getChartOptions = () => {
    // Calculate day/night zones if we have sun data
    const backgroundZones: BackgroundZone[] = []
    if (tideData.sunData) {
      const sunrise = tideData.sunData.sunrise.getHours() + (tideData.sunData.sunrise.getMinutes() / 60)
      const sunset = tideData.sunData.sunset.getHours() + (tideData.sunData.sunset.getMinutes() / 60)
      
      // Night zone from 0 to sunrise
      if (sunrise > 0) {
        backgroundZones.push({
          from: 0,
          to: sunrise,
          color: 'rgba(30, 58, 138, 0.15)' // Dark blue for night
        })
      }
      
      // Day zone from sunrise to sunset  
      if (sunset > sunrise) {
        backgroundZones.push({
          from: sunrise,
          to: sunset,
          color: 'rgba(125, 211, 252, 0.1)' // Light blue for day
        })
      }
      
      // Night zone from sunset to 24
      if (sunset < 24) {
        backgroundZones.push({
          from: sunset,
          to: 24,
          color: 'rgba(30, 58, 138, 0.15)' // Dark blue for night
        })
      }
    }

    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: false,
        },
        title: {
          display: true,
          text: `Tide Chart - ${selectedDate.toLocaleDateString(undefined, { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
          })}`,
          color: 'rgb(219, 234, 254)',
          font: {
            size: 16,
            weight: 'bold' as const
          }
        },
        tooltip: {
          callbacks: {
            label: function(context: TooltipItem<'line'>) {
              const value = context.parsed.y
              if (value === null || value === undefined) return ''
              return `${value.toFixed(2)}${preferences.depth === 'meters' ? 'm' : 'ft'}`
            }
          }
        },
        // Custom plugin for background zones
        backgroundZones: {
          zones: backgroundZones
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          title: {
            display: true,
            text: `Height (${preferences.depth === 'meters' ? 'meters' : 'feet'})`,
            color: 'rgb(156, 163, 175)'
          },
          ticks: {
            color: 'rgb(156, 163, 175)'
          },
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          }
        },
        x: {
          title: {
            display: true,
            text: 'Time (24hr)',
            color: 'rgb(156, 163, 175)'
          },
          ticks: {
            color: 'rgb(156, 163, 175)',
            maxTicksLimit: 12
          },
          grid: {
            color: 'rgba(156, 163, 175, 0.1)'
          }
        }
      }
    }
  }

  const chartKey = `${selectedDate.toDateString()}-${tideData.extremes.length}`

  return (
    <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <h3 className="text-xl font-semibold text-brand flex items-center gap-2">
            <GiWaves />
            Tide Chart
          </h3>
          {/* `bg-success text-success` painted the label in its own background
              colour, so the chip read as a blank green rectangle. The tinted
              background token is `success-bg`. */}
          <span className="rounded border border-success-border bg-success-bg px-2 py-1 text-xs text-success">
            Real data
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => canNavigatePrev && onNavigateDate('prev')}
            disabled={!canNavigatePrev}
            className={`p-2 rounded-lg transition-colors ${
              canNavigatePrev 
                ? 'bg-surface-3 hover:bg-surface-3 text-text' 
                : 'bg-surface-1 text-text-subtle cursor-not-allowed'
            }`}
            title={canNavigatePrev ? "Previous day" : "No more data available"}
          >
            <FaArrowLeft />
          </button>
          <span className="text-text px-3 py-1 bg-surface-2 rounded">
            {selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => canNavigateNext && onNavigateDate('next')}
            disabled={!canNavigateNext}
            className={`p-2 rounded-lg transition-colors ${
              canNavigateNext 
                ? 'bg-surface-3 hover:bg-surface-3 text-text' 
                : 'bg-surface-1 text-text-subtle cursor-not-allowed'
            }`}
            title={canNavigateNext ? "Next day" : "No more data available"}
          >
            <FaArrowRight />
          </button>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="h-64 mb-4">
        {/* No Suspense boundary: Chart is a fully resolved component by the
            time it is non-null, not a lazy one, so there is nothing to suspend. */}
        {Chart ? (
          <Chart key={chartKey} data={getTideChartData()} options={getChartOptions()} />
        ) : (
          <div className="h-full flex items-center justify-center bg-black/60 backdrop-blur-sm rounded border border-white/20">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-brand-muted border-t-transparent rounded-full mx-auto mb-2"></div>
              <div className="text-text text-sm">Loading chart...</div>
            </div>
          </div>
        )}
      </div>

      {/* High/Low Tide Times */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tideData.extremes.map((extreme: {time: number, height: number, type: 'high' | 'low'}, index: number) => (
          <div key={index} className="bg-black/60 backdrop-blur-sm border border-white/30 rounded p-3 text-center">
            <div className={`text-lg font-semibold ${extreme.type === 'high' ? 'text-brand' : 'text-success'}`}>
              {extreme.type === 'high' ? '⬆️ High' : '⬇️ Low'}
            </div>
            <div className="text-text font-medium">
              {extreme.time.toString().padStart(2, '0')}:00
            </div>
            <div className="text-text-muted text-sm">
              {convertDepth(extreme.height, 2).formatted}
            </div>
          </div>
        ))}
      </div>

      {/* Sun times and the forecast window stay on the chart: a diver timing
          slack water reads them together with the tide, so they are part of the
          answer rather than a note about it. The model's provenance and the
          slack-water tip are in the page's message bar. */}
      {(tideData.availableDateRange || tideData.sunData) && (
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
          {tideData.sunData && (
            <span>
              Sunrise{' '}
              <span className="text-text">
                {tideData.sunData.sunrise.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
              {' · '}Sunset{' '}
              <span className="text-text">
                {tideData.sunData.sunset.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </span>
            </span>
          )}
          {tideData.availableDateRange && (
            <span>
              Forecast{' '}
              <span className="text-text">
                {tideData.availableDateRange.startDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                {' – '}
                {tideData.availableDateRange.endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  )
})

TideChart.displayName = 'TideChart'

export default TideChart