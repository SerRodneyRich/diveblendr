'use client'

import React, { memo } from 'react'
import { GiWaves } from 'react-icons/gi'
import { FaArrowLeft, FaArrowRight } from 'react-icons/fa'
import { useUnitConversion } from '@/hooks/useUnitConversion'

// Lazy load Chart.js components
const Chart = React.lazy(() => import('react-chartjs-2').then(module => ({ default: module.Line })))

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

// Register Chart.js components only when needed
let chartRegistered = false
const registerChart = async () => {
  if (chartRegistered) return
  
  const chartModule = await import('chart.js')
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
  
  chartRegistered = true
}

interface TideChartProps {
  tideData: {
    hours: number[]
    heights: number[]
    extremes: Array<{time: number, height: number, type: 'high' | 'low'}>
    date: Date
    isRealData?: boolean
    availableDateRange?: {
      startDate: Date
      endDate: Date
    }
    sunData?: {
      sunrise: Date
      sunset: Date
    }
  }
  selectedDate: Date
  onNavigateDate: (direction: 'prev' | 'next') => void
}

const TideChart = memo(({ tideData, selectedDate, onNavigateDate }: TideChartProps) => {
  const { convertDepth, preferences } = useUnitConversion()
  const [chartReady, setChartReady] = React.useState(false)
  
  // Check if navigation should be disabled
  const canNavigatePrev = React.useMemo(() => {
    if (!tideData.availableDateRange) return false // Allow navigation for synthetic data
    const prevDate = new Date(selectedDate)
    prevDate.setDate(prevDate.getDate() - 1)
    return prevDate >= new Date(tideData.availableDateRange.startDate.toDateString())
  }, [selectedDate, tideData.availableDateRange])
  
  const canNavigateNext = React.useMemo(() => {
    if (!tideData.availableDateRange) return false // Allow navigation for synthetic data
    const nextDate = new Date(selectedDate)
    nextDate.setDate(nextDate.getDate() + 1)
    return nextDate <= new Date(tideData.availableDateRange.endDate.toDateString())
  }, [selectedDate, tideData.availableDateRange])

  React.useEffect(() => {
    registerChart().then(() => setChartReady(true))
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
          text: `${tideData.isRealData ? 'Real' : 'Synthetic'} Tide Chart - ${selectedDate.toLocaleDateString('en-US', { 
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
            label: function(context: {parsed: {y: number}}) {
              return `${context.parsed.y.toFixed(2)}${preferences.depth === 'meters' ? 'm' : 'ft'}`
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
          <h3 className="text-xl font-semibold text-blue-300 flex items-center gap-2">
            <GiWaves />
            Tide Chart
          </h3>
          <span className={`text-xs px-2 py-1 rounded ${
            tideData.isRealData 
              ? 'bg-green-600 text-green-100' 
              : 'bg-orange-600 text-orange-100'
          }`}>
            {tideData.isRealData ? 'Real Data' : 'Synthetic'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => canNavigatePrev && onNavigateDate('prev')}
            disabled={!canNavigatePrev}
            className={`p-2 rounded-lg transition-colors ${
              canNavigatePrev 
                ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            title={canNavigatePrev ? "Previous day" : "No more data available"}
          >
            <FaArrowLeft />
          </button>
          <span className="text-gray-300 px-3 py-1 bg-gray-700 rounded">
            {selectedDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
          <button
            onClick={() => canNavigateNext && onNavigateDate('next')}
            disabled={!canNavigateNext}
            className={`p-2 rounded-lg transition-colors ${
              canNavigateNext 
                ? 'bg-gray-600 hover:bg-gray-500 text-white' 
                : 'bg-gray-800 text-gray-500 cursor-not-allowed'
            }`}
            title={canNavigateNext ? "Next day" : "No more data available"}
          >
            <FaArrowRight />
          </button>
        </div>
      </div>
      
      {/* Chart Container */}
      <div className="h-64 mb-4">
        {chartReady ? (
          <React.Suspense fallback={
            <div className="h-full flex items-center justify-center bg-black/60 backdrop-blur-sm rounded border border-white/20">
              <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full"></div>
            </div>
          }>
            <Chart key={chartKey} data={getTideChartData()} options={getChartOptions()} />
          </React.Suspense>
        ) : (
          <div className="h-full flex items-center justify-center bg-black/60 backdrop-blur-sm rounded border border-white/20">
            <div className="text-center">
              <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
              <div className="text-gray-300 text-sm">Loading chart...</div>
            </div>
          </div>
        )}
      </div>

      {/* High/Low Tide Times */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tideData.extremes.map((extreme: {time: number, height: number, type: 'high' | 'low'}, index: number) => (
          <div key={index} className="bg-black/60 backdrop-blur-sm border border-white/30 rounded p-3 text-center">
            <div className={`text-lg font-semibold ${extreme.type === 'high' ? 'text-blue-300' : 'text-green-300'}`}>
              {extreme.type === 'high' ? '⬆️ High' : '⬇️ Low'}
            </div>
            <div className="text-white font-medium">
              {extreme.time.toString().padStart(2, '0')}:00
            </div>
            <div className="text-gray-400 text-sm">
              {convertDepth(extreme.height, 2).formatted}
            </div>
          </div>
        ))}
      </div>

      {/* Tide Info */}
      <div className="mt-4 p-3 bg-blue-900/60 backdrop-blur-sm rounded border border-blue-400/50">
        <p className="text-blue-200 text-sm mb-2">
          <strong>💡 Diving Tip:</strong> Best diving conditions are typically during slack tide periods 
          (30 minutes before and after high/low tide) when currents are weakest.
        </p>
{tideData.isRealData ? (
          <div className="space-y-1">
            <p className="text-green-200 text-xs">
              <strong>✅ Real tide data:</strong> Based on Open-Meteo marine model (8km resolution). 
              Not suitable for coastal navigation - verify locally before diving.
            </p>
{tideData.availableDateRange && (
              <p className="text-green-100 text-xs">
                <strong>📅 Data available:</strong> {' '}
                {tideData.availableDateRange.startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {' '}
                {tideData.availableDateRange.endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </p>
            )}
            {tideData.sunData && (
              <p className="text-yellow-100 text-xs">
                <strong>🌅 Sunrise:</strong> {tideData.sunData.sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })} | {' '}
                <strong>🌇 Sunset:</strong> {tideData.sunData.sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            )}
          </div>
        ) : (
          <p className="text-orange-200 text-xs">
            <strong>⚠️ Synthetic data:</strong> Realistic tide patterns for demonstration. 
            Real tide data not available for this location.
          </p>
        )}
      </div>
    </div>
  )
})

TideChart.displayName = 'TideChart'

export default TideChart