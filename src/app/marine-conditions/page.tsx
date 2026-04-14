'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { GiWaves } from 'react-icons/gi'
import { FaMapMarkerAlt, FaWater, FaWind, FaRedo } from 'react-icons/fa'
import { TiWeatherCloudy } from 'react-icons/ti'
import { MdExpandLess, MdExpandMore, MdStar, MdStarBorder } from 'react-icons/md'
import { useFavorites } from '@/contexts/FavoritesContext'
import dynamic from 'next/dynamic'
import BackgroundImage from '@/components/BackgroundImage'
import AppHeader from '@/components/AppHeader'

// Lazy load heavy components - only when needed
const GlobalUIComponents = dynamic(() => import('@/components/GlobalUIComponents'), {
  ssr: false
})

// Lazy load Chart-related components to avoid large bundle size on initial load
const TideChart = dynamic(() => import('@/components/TideChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
      <div className="h-64 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
          <div className="text-gray-300 text-sm">Loading tide chart...</div>
        </div>
      </div>
    </div>
  )
})

const DivingConditionScore = dynamic(() => import('@/components/DivingConditionScore'), {
  ssr: false,
  loading: () => (
    <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
      <div className="h-32 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-2"></div>
          <div className="text-gray-300 text-sm">Loading diving conditions...</div>
        </div>
      </div>
    </div>
  )
})

// Types for marine data
interface MarineData {
  current: {
    wave_height: number
    swell_wave_height: number
    wind_wave_height: number
    ocean_current_velocity: number
    wave_direction: number
    ocean_current_direction: number
    wave_period: number
  }
  daily: {
    time: string[]
    wave_height_max: number[]
    swell_wave_height_max: number[]
    wind_wave_height_max: number[]
    wave_period_max: number[]
  }
  hourly?: {
    time: string[]
    sea_level_height_msl: number[]
  }
}

interface SunData {
  daily: {
    time: string[]
    sunrise: string[]
    sunset: string[]
  }
}

interface TideData {
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

interface DivingCondition {
  score: number
  rating: string
  color: string
  explanation: {
    waveHeight?: number
    swellHeight?: number
    windWaveHeight?: number
    currentVelocity?: number
  }
}

export default function MarineConditionsPage() {
  const { preferences, convertDepth } = useUnitConversion()
  const { favorites, addFavorite, removeFavorite, isFavorite, getFavoriteId } = useFavorites()
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lon: number, name: string} | null>(null)
  const [marineData, setMarineData] = useState<MarineData | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [tideData, setTideData] = useState<TideData | null>(null)
  const [sunData, setSunData] = useState<SunData | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isLocationCollapsed, setIsLocationCollapsed] = useState(false)
  const [citySearchQuery, setCitySearchQuery] = useState<string>('')
  const [citySearchResults, setCitySearchResults] = useState<Array<{name: string, lat: number, lon: number, country: string, admin1?: string, displayName: string}>>([])
  const [isSearchingCities, setIsSearchingCities] = useState(false)
  const [showDivingScoreTooltip, setShowDivingScoreTooltip] = useState(false)
  const [imageLoaded, setImageLoaded] = useState(false)


  const reverseGeocode = async (lat: number, lon: number): Promise<string> => {
    try {
      // Try multiple geocoding approaches for better coverage
      
      // Method 1: Try BigDataCloud (free, no API key, good reverse geocoding)
      try {
        const bdcResponse = await fetch(
          `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
        )
        
        if (bdcResponse.ok) {
          const bdcData = await bdcResponse.json()
          const parts = []
          if (bdcData.locality) parts.push(bdcData.locality)
          if (bdcData.principalSubdivision) parts.push(bdcData.principalSubdivision)
          if (bdcData.countryName) parts.push(bdcData.countryName)
          
          if (parts.length > 0) {
            return parts.join(', ')
          }
        }
      } catch {
        console.log('BigDataCloud geocoding failed, trying fallback')
      }

      // Method 2: Try OpenStreetMap Nominatim (free, good coverage)
      try {
        const osmResponse = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10&addressdetails=1`
        )
        
        if (osmResponse.ok) {
          const osmData = await osmResponse.json()
          if (osmData && osmData.address) {
            const addr = osmData.address
            const parts = []
            
            // Try different locality types
            if (addr.city) parts.push(addr.city)
            else if (addr.town) parts.push(addr.town)
            else if (addr.village) parts.push(addr.village)
            else if (addr.municipality) parts.push(addr.municipality)
            
            if (addr.state) parts.push(addr.state)
            if (addr.country) parts.push(addr.country)
            
            if (parts.length > 0) {
              return parts.join(', ')
            }
          }
        }
      } catch {
        console.log('OSM geocoding failed')
      }
      
    } catch (error) {
      console.error('All reverse geocoding methods failed:', error)
    }
    
    // Fallback to coordinates
    return `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  }

  const searchCities = useCallback(async (query: string) => {
    if (query.length < 2) {
      setCitySearchResults([])
      return
    }

    setIsSearchingCities(true)
    
    try {
      // Use Open-Meteo Geocoding API for city search
      const response = await fetch(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(query)}&count=10&language=en&format=json`
      )
      
      if (response.ok) {
        const data = await response.json()
        if (data.results) {
          const results = data.results.map((result: {name: string, latitude: number, longitude: number, country: string, admin1?: string}) => ({
            name: result.name,
            lat: result.latitude,
            lon: result.longitude,
            country: result.country,
            admin1: result.admin1,
            displayName: `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}, ${result.country}`
          }))
          setCitySearchResults(results)
        }
      }
    } catch (error) {
      console.error('City search failed:', error)
      setCitySearchResults([])
    }
    
    setIsSearchingCities(false)
  }, [])

  const handleCitySelect = (city: {lat: number, lon: number, displayName: string}) => {
    const locationData = {
      lat: city.lat,
      lon: city.lon,
      name: city.displayName
    }
    
    setCitySearchQuery('')
    setCitySearchResults([])
    handleLocationSelect(locationData)
  }


  const processRealTideData = (marineData: MarineData, baseDate: Date, sunData?: SunData) => {
    // If we have real tide data from Open-Meteo, use it
    if (marineData.hourly?.sea_level_height_msl && marineData.hourly?.time) {
      const hours = Array.from({ length: 24 }, (_, i) => i)
      
      // Find the starting index for the selected date
      const targetDateStr = baseDate.toISOString().split('T')[0] // Get YYYY-MM-DD format
      const startIndex = marineData.hourly.time.findIndex(timeStr => 
        timeStr.startsWith(targetDateStr)
      )
      
      if (startIndex === -1) {
        // If we can't find the target date, fall back to synthetic data
        return generateSyntheticTideData(baseDate)
      }
      
      // Get tide heights for the specific date (24 hours from startIndex)
      const tideHeights = marineData.hourly.sea_level_height_msl.slice(startIndex, startIndex + 24)
      
      // If we don't have enough data for a full day, fall back to synthetic
      if (tideHeights.length < 24) {
        return generateSyntheticTideData(baseDate)
      }
      
      // Find high and low tide times from real data
      const extremes = []
      for (let i = 1; i < tideHeights.length - 1; i++) {
        const prev = tideHeights[i - 1]
        const curr = tideHeights[i]
        const next = tideHeights[i + 1]
        
        // Detect local maxima (high tides)
        if (curr > prev && curr > next) {
          extremes.push({ time: i, height: curr, type: 'high' as const })
        }
        // Detect local minima (low tides)
        else if (curr < prev && curr < next) {
          extremes.push({ time: i, height: curr, type: 'low' as const })
        }
      }
      
      // Calculate available date range from the API data
      const firstTimeStr = marineData.hourly.time[0]
      const lastTimeStr = marineData.hourly.time[marineData.hourly.time.length - 1]
      const availableDateRange = {
        startDate: new Date(firstTimeStr),
        endDate: new Date(lastTimeStr.split('T')[0] + 'T23:59:59') // End of last day
      }
      
      // Process sun data for the selected date
      let sunDataForDate: {sunrise: Date, sunset: Date} | undefined
      if (sunData?.daily) {
        const targetDateStr = baseDate.toISOString().split('T')[0]
        const dateIndex = sunData.daily.time.findIndex(timeStr => timeStr === targetDateStr)
        
        if (dateIndex !== -1) {
          sunDataForDate = {
            sunrise: new Date(sunData.daily.sunrise[dateIndex]),
            sunset: new Date(sunData.daily.sunset[dateIndex])
          }
        }
      }
      
      return {
        hours,
        heights: tideHeights,
        extremes,
        date: baseDate,
        isRealData: true,
        availableDateRange,
        sunData: sunDataForDate
      }
    }
    
    // Fallback to synthetic data if real data unavailable
    return generateSyntheticTideData(baseDate)
  }

  const generateSyntheticTideData = (baseDate: Date) => {
    // Generate synthetic tide data (sinusoidal) that varies by date
    const hours = Array.from({ length: 24 }, (_, i) => i)
    
    // Use date as seed for variation (different tide patterns each day)
    const dayOffset = baseDate.getTime() / (1000 * 60 * 60 * 24) // Days since epoch
    const phaseShift = (dayOffset * 0.8) % (2 * Math.PI) // Gradual phase shift over days
    
    const tideHeights = hours.map(hour => {
      // Simulate semi-diurnal tides (2 high, 2 low per day) with date-based variation
      const t = (hour / 24 * 2 * Math.PI) + phaseShift
      return 1.5 + 1.2 * Math.sin(t * 2) + 0.3 * Math.sin(t * 3.2) // Mix of harmonics for realistic tide pattern
    })
    
    // Find high and low tide times with more precise detection
    const extremes = []
    for (let i = 1; i < tideHeights.length - 1; i++) {
      const prev = tideHeights[i - 1]
      const curr = tideHeights[i]
      const next = tideHeights[i + 1]
      
      if (curr > prev && curr > next && curr > 2.0) { // Only significant highs
        extremes.push({ time: i, height: curr, type: 'high' as const })
      } else if (curr < prev && curr < next && curr < 1.0) { // Only significant lows
        extremes.push({ time: i, height: curr, type: 'low' as const })
      }
    }
    
    // Ensure we have at least some extremes by using broader criteria if none found
    if (extremes.length === 0) {
      for (let i = 1; i < tideHeights.length - 1; i++) {
        const prev = tideHeights[i - 1]
        const curr = tideHeights[i]
        const next = tideHeights[i + 1]
        
        if (curr > prev && curr > next) {
          extremes.push({ time: i, height: curr, type: 'high' as const })
        } else if (curr < prev && curr < next) {
          extremes.push({ time: i, height: curr, type: 'low' as const })
        }
      }
    }
    
    return {
      hours,
      heights: tideHeights,
      extremes,
      date: baseDate,
      isRealData: false
    }
  }

  const handleLocationSelect = async (selectedLoc: {lat: number, lon: number, name: string}) => {
    setSelectedLocation(selectedLoc)
    setIsLoadingData(true)
    setIsLocationCollapsed(true)
    
    try {
      // Fetch both marine weather data and sun data in parallel
      const [marineResponse, sunResponse] = await Promise.all([
        fetch(`https://marine-api.open-meteo.com/v1/marine?latitude=${selectedLoc.lat}&longitude=${selectedLoc.lon}&current=wave_height,wave_direction,wave_period,wind_wave_height,swell_wave_height,ocean_current_velocity,ocean_current_direction&hourly=sea_level_height_msl&daily=wave_height_max,wave_direction_dominant,wave_period_max,wind_wave_height_max,swell_wave_height_max&timezone=auto&forecast_days=7`),
        fetch(`https://api.open-meteo.com/v1/forecast?latitude=${selectedLoc.lat}&longitude=${selectedLoc.lon}&daily=sunrise,sunset&timezone=auto&forecast_days=7`)
      ])
      
      if (marineResponse.ok) {
        const marineDataResult = await marineResponse.json()
        setMarineData(marineDataResult)
        
        let sunDataResult: SunData | null = null
        if (sunResponse.ok) {
          sunDataResult = await sunResponse.json()
          setSunData(sunDataResult)
        }
        
        // Generate tide data for selected date using real Open-Meteo data
        if (marineDataResult.hourly?.sea_level_height_msl) {
          const tides = processRealTideData(marineDataResult, selectedDate, sunDataResult || undefined)
          setTideData(tides)
        } else {
          // Don't show tide chart if no real data available
          setTideData(null)
        }
      } else {
        console.error('Failed to fetch marine data')
        // Don't show tide chart if API fails
        setTideData(null)
      }
      
    } catch (error) {
      console.error('Error fetching marine data:', error)
      // Don't show tide chart on API error
      setTideData(null)
    }
    
    setIsLoadingData(false)
  }

  const getCurrentUserLocation = () => {
    setIsLoadingLocation(true)
    if (typeof window !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const lat = position.coords.latitude
          const lon = position.coords.longitude
          
          // Get city name using reverse geocoding
          const locationName = await reverseGeocode(lat, lon)
          
          const locationData = { lat, lon, name: locationName }
          setSelectedLocation(locationData)
          handleLocationSelect(locationData)
          setIsLoadingLocation(false)
        },
        (error) => {
          console.error('Error getting location:', error)
          setIsLoadingLocation(false)
        }
      )
    } else {
      console.error('Geolocation is not supported by this browser.')
      setIsLoadingLocation(false)
    }
  }

  const formatWaveHeight = (height: number | null) => {
    if (height === null || height === undefined) return 'N/A'
    return convertDepth(height, 1).formatted
  }

  const formatCurrentSpeed = (speed: number | null) => {
    if (speed === null || speed === undefined) return 'N/A'
    
    if (preferences.system === 'imperial') {
      const speedInFtS = speed * 3.28084 // Convert m/s to ft/s
      return `${speedInFtS.toFixed(1)} ft/s`
    }
    return `${speed.toFixed(1)} m/s`
  }

  const formatDirection = (direction: number | null) => {
    if (direction === null || direction === undefined) return 'N/A'
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW']
    const index = Math.round(direction / 22.5) % 16
    return `${directions[index]} (${direction.toFixed(0)}°)`
  }

  const getDivingConditionScore = (waveHeight?: number, swellHeight?: number, currentVelocity?: number, windWaveHeight?: number): DivingCondition | null => {
    // Use provided values or current marine data
    const wave_height = waveHeight ?? marineData?.current?.wave_height
    const swell_wave_height = swellHeight ?? marineData?.current?.swell_wave_height  
    const ocean_current_velocity = currentVelocity ?? marineData?.current?.ocean_current_velocity
    const wind_wave_height = windWaveHeight ?? marineData?.current?.wind_wave_height
    
    if (wave_height === null || wave_height === undefined) return null
    
    let score = 100
    
    // Wave height impact (bigger waves = worse conditions)
    if (wave_height > 3) score -= 40
    else if (wave_height > 2.5) score -= 30
    else if (wave_height > 2) score -= 25
    else if (wave_height > 1.5) score -= 15
    else if (wave_height > 1) score -= 10
    else if (wave_height > 0.5) score -= 5
    
    // Swell impact
    if (swell_wave_height && swell_wave_height > 2.5) score -= 25
    else if (swell_wave_height && swell_wave_height > 2) score -= 20
    else if (swell_wave_height && swell_wave_height > 1.5) score -= 15
    else if (swell_wave_height && swell_wave_height > 1) score -= 10
    else if (swell_wave_height && swell_wave_height > 0.5) score -= 5
    
    // Wind wave impact (choppy surface conditions)
    if (wind_wave_height && wind_wave_height > 2) score -= 20
    else if (wind_wave_height && wind_wave_height > 1.5) score -= 15
    else if (wind_wave_height && wind_wave_height > 1) score -= 10
    else if (wind_wave_height && wind_wave_height > 0.5) score -= 5
    
    // Current strength (strong currents are dangerous)
    if (ocean_current_velocity && ocean_current_velocity > 2) score -= 25
    else if (ocean_current_velocity && ocean_current_velocity > 1.5) score -= 20
    else if (ocean_current_velocity && ocean_current_velocity > 1) score -= 15
    else if (ocean_current_velocity && ocean_current_velocity > 0.5) score -= 10
    
    score = Math.max(0, Math.min(100, score))
    
    // Generate gradient color from green to red
    const getGradientColor = (score: number) => {
      const red = Math.max(0, Math.min(255, 255 - (score * 2.55)))
      const green = Math.max(0, Math.min(255, score * 2.55))
      return `rgb(${Math.round(red)}, ${Math.round(green)}, 0)`
    }
    
    const rating = score >= 85 ? 'Excellent' : 
                  score >= 70 ? 'Very Good' :
                  score >= 55 ? 'Good' : 
                  score >= 40 ? 'Fair' : 
                  score >= 25 ? 'Poor' : 'Very Poor'
    
    return { 
      score, 
      rating, 
      color: getGradientColor(score),
      explanation: {
        waveHeight: wave_height,
        swellHeight: swell_wave_height,
        windWaveHeight: wind_wave_height,
        currentVelocity: ocean_current_velocity
      }
    }
  }

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    
    // Check bounds if we have real data
    if (marineData?.hourly?.sea_level_height_msl && marineData?.hourly?.time) {
      const firstTimeStr = marineData.hourly.time[0]
      const lastTimeStr = marineData.hourly.time[marineData.hourly.time.length - 1]
      const startDate = new Date(firstTimeStr.split('T')[0])
      const endDate = new Date(lastTimeStr.split('T')[0])
      
      // Prevent navigation beyond available data range
      if (newDate < startDate || newDate > endDate) {
        return // Don't navigate if out of bounds
      }
    }
    
    setSelectedDate(newDate)
    
    // Regenerate tide data for new date
    if (selectedLocation && marineData) {
      if (marineData.hourly?.sea_level_height_msl) {
        const tides = processRealTideData(marineData, newDate, sunData || undefined)
        setTideData(tides)
      } else {
        // Don't show tide chart without real data
        setTideData(null)
      }
    }
  }

  const resetLocation = () => {
    setSelectedLocation(null)
    setMarineData(null)
    setTideData(null)
    setSunData(null)
    setIsLocationCollapsed(false)
    setSelectedDate(new Date())
    setCitySearchQuery('')
    setCitySearchResults([])
  }

  const handleToggleFavorite = () => {
    if (!selectedLocation) return
    
    if (isFavorite(selectedLocation.lat, selectedLocation.lon)) {
      const favoriteId = getFavoriteId(selectedLocation.lat, selectedLocation.lon)
      if (favoriteId) {
        removeFavorite(favoriteId)
      }
    } else {
      addFavorite(selectedLocation)
    }
  }

  const handleFavoriteSelect = (favorite: { lat: number; lon: number; name: string }) => {
    const locationData = {
      lat: favorite.lat,
      lon: favorite.lon,
      name: favorite.name
    }
    
    handleLocationSelect(locationData)
  }

  // Debounce city search
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (citySearchQuery.length >= 2) {
        searchCities(citySearchQuery)
      } else {
        setCitySearchResults([])
      }
    }, 300) // 300ms delay

    return () => clearTimeout(timeoutId)
  }, [citySearchQuery, searchCities])

  // Memoize diving condition calculation to avoid recalculations
  const divingCondition = useMemo(() => {
    if (!marineData?.current) return null
    return getDivingConditionScore()
  }, [marineData?.current?.wave_height, marineData?.current?.swell_wave_height, marineData?.current?.ocean_current_velocity, marineData?.current?.wind_wave_height])

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-blue-900 via-blue-800 to-black text-white">
      <BackgroundImage onImageLoaded={() => setImageLoaded(true)} />
      
      {/* Loading state */}
      {!imageLoaded && (
        <div className="fixed inset-0 bg-gradient-to-b from-blue-900 via-blue-800 to-black flex items-center justify-center z-50">
          <div className="text-white text-lg">Loading...</div>
        </div>
      )}
      
      {/* Main content - only show when image is loaded */}
      {imageLoaded && (
        <div className="relative z-10 w-full">
          <AppHeader activeTab="marine-conditions" />
          <GlobalUIComponents 
            activeTab="marine-conditions" 
            onTabChange={(tab) => {
              // Handle tab changes - for marine-conditions page, redirect to calculator for other tabs
              if (tab !== 'marine-conditions') {
                window.location.href = `/calculator?tab=${tab}`
              }
            }}
          />

          <div className="container mx-auto px-4 py-6 space-y-6">
        {/* Location Selection */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-blue-300 flex items-center gap-2">
              <FaMapMarkerAlt />
              {isLocationCollapsed ? 'Current Location' : 'Select Location'}
            </h2>
            {isLocationCollapsed && (
              <button
                onClick={resetLocation}
                className="bg-gray-600 hover:bg-gray-500 text-white px-3 py-1 rounded-lg transition-colors flex items-center gap-2 text-sm"
              >
                <FaRedo className="text-xs" />
                Reset
              </button>
            )}
          </div>
          
          {isLocationCollapsed ? (
            /* Collapsed Location Display */
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <p className="text-white font-medium">{selectedLocation?.name}</p>
                  <p className="text-gray-400 text-sm">
                    {selectedLocation?.lat.toFixed(3)}, {selectedLocation?.lon.toFixed(3)}
                  </p>
                </div>
                {selectedLocation && (
                  <button
                    onClick={handleToggleFavorite}
                    className="text-yellow-400 hover:text-yellow-300 transition-colors p-1"
                    title={isFavorite(selectedLocation.lat, selectedLocation.lon) ? "Remove from favorites" : "Add to favorites"}
                  >
                    {isFavorite(selectedLocation.lat, selectedLocation.lon) ? (
                      <MdStar className="text-xl" />
                    ) : (
                      <MdStarBorder className="text-xl" />
                    )}
                  </button>
                )}
              </div>
              <button
                onClick={() => setIsLocationCollapsed(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <MdExpandMore className="text-xl" />
              </button>
            </div>
          ) : (
            /* Expanded Location Selection */
            <div className="space-y-4">
              {/* Current Location Button and Favorite Locations */}
              <div className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    onClick={getCurrentUserLocation}
                    disabled={isLoadingLocation}
                    className="bg-blue-600 hover:bg-blue-500 disabled:bg-gray-600 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FaMapMarkerAlt />
                    {isLoadingLocation ? 'Getting Location...' : 'Use Current Location'}
                  </button>

                  {/* Favorite Locations inline */}
                  {favorites.length > 0 && (
                    <>
                      <span className="text-gray-400 text-sm">or</span>
                      {favorites.map((favorite) => (
                        <div
                          key={favorite.id}
                          className="group bg-yellow-600/20 hover:bg-yellow-600/30 border border-yellow-400/30 hover:border-yellow-400/50 rounded-full px-3 py-2 text-sm text-yellow-200 hover:text-yellow-100 transition-all duration-200 flex items-center gap-2 relative"
                        >
                          <button
                            onClick={() => handleFavoriteSelect(favorite)}
                            className="flex items-center gap-2 text-yellow-200 hover:text-yellow-100 focus:outline-none focus:ring-2 focus:ring-yellow-400 focus:ring-opacity-50 rounded"
                          >
                            <MdStar className="text-yellow-400 text-sm" />
                            <span className="truncate max-w-32">{favorite.name}</span>
                          </button>
                          <button
                            onClick={() => removeFavorite(favorite.id)}
                            className="opacity-0 group-hover:opacity-100 text-yellow-300 hover:text-red-400 transition-all duration-200 ml-1 focus:outline-none focus:ring-2 focus:ring-red-400 focus:ring-opacity-50 rounded w-4 h-4 flex items-center justify-center text-xs"
                            title="Remove from favorites"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>

              {/* City Search */}
              <div>
                <h3 className="text-lg font-medium text-gray-300 mb-3">Search for a City or Location</h3>
                
                {/* Search Input */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Type city name (e.g., 'Miami', 'Bali', 'Cairo')..."
                    value={citySearchQuery}
                    onChange={(e) => setCitySearchQuery(e.target.value)}
                    className="w-full bg-black/40 backdrop-blur-sm border border-white/30 rounded-lg px-4 py-3 text-gray-200 placeholder-gray-400 focus:border-blue-400 focus:outline-none"
                  />
                  {isSearchingCities && (
                    <div className="absolute right-3 top-3.5">
                      <div className="animate-spin w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full"></div>
                    </div>
                  )}
                </div>

                {/* Search Results */}
                {citySearchResults.length > 0 && (
                  <div className="bg-black/60 backdrop-blur-sm border border-white/30 rounded-lg max-h-60 overflow-y-auto">
                    {citySearchResults.map((city, index) => (
                      <button
                        key={index}
                        onClick={() => handleCitySelect(city)}
                        className="w-full text-left p-3 hover:bg-gray-600 transition-colors border-b border-gray-600 last:border-b-0"
                      >
                        <div className="text-white font-medium">{city.displayName}</div>
                        <div className="text-gray-400 text-sm">
                          {city.lat.toFixed(3)}, {city.lon.toFixed(3)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              
              {selectedLocation && (
                <button
                  onClick={() => setIsLocationCollapsed(true)}
                  className="w-full text-center text-gray-400 hover:text-white transition-colors flex items-center justify-center gap-2 pt-2"
                >
                  <MdExpandLess />
                  Collapse
                </button>
              )}
            </div>
          )}
        </div>

        {/* Marine Data Display */}
        {selectedLocation && (
          <div className="space-y-6">
            {/* Selected Location Info */}
            {isLoadingData ? (
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-blue-400 border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-gray-300">Loading marine conditions...</p>
              </div>
            ) : marineData ? (
              <div className="space-y-6">
                {/* Diving Condition Score */}
                {divingCondition && (
                  <DivingConditionScore 
                    divingCondition={divingCondition}
                    showTooltip={showDivingScoreTooltip}
                    onToggleTooltip={() => setShowDivingScoreTooltip(!showDivingScoreTooltip)}
                  />
                )}

                {/* Tide Chart */}
                {tideData && (
                  <TideChart 
                    tideData={tideData} 
                    selectedDate={selectedDate} 
                    onNavigateDate={navigateDate}
                  />
                )}

                {/* Current Conditions */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-blue-300 mb-4 flex items-center gap-2">
                    <GiWaves />
                    Current Marine Conditions
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <GiWaves className="text-blue-400" />
                        <span className="font-medium">Wave Height</span>
                      </div>
                      <div className="text-xl font-bold text-white">
                        {formatWaveHeight(marineData.current.wave_height)}
                      </div>
                    </div>

                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-blue-400" />
                        <span className="font-medium">Swell Height</span>
                      </div>
                      <div className="text-xl font-bold text-white">
                        {formatWaveHeight(marineData.current.swell_wave_height)}
                      </div>
                    </div>

                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWind className="text-blue-400" />
                        <span className="font-medium">Wave Period</span>
                      </div>
                      <div className="text-xl font-bold text-white">
                        {marineData.current.wave_period ? `${marineData.current.wave_period.toFixed(1)}s` : 'N/A'}
                      </div>
                    </div>

                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-green-400" />
                        <span className="font-medium">Current Speed</span>
                      </div>
                      <div className="text-xl font-bold text-white">
                        {formatCurrentSpeed(marineData.current.ocean_current_velocity)}
                      </div>
                    </div>

                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWind className="text-green-400" />
                        <span className="font-medium">Wave Direction</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {formatDirection(marineData.current.wave_direction)}
                      </div>
                    </div>

                    <div className="bg-gray-700 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-green-400" />
                        <span className="font-medium">Current Direction</span>
                      </div>
                      <div className="text-lg font-bold text-white">
                        {formatDirection(marineData.current.ocean_current_direction)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 7-Day Forecast */}
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-blue-300 mb-4 flex items-center gap-2">
                    <TiWeatherCloudy />
                    7-Day Marine Forecast
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-600">
                          <th className="text-left py-2 text-gray-300">Date</th>
                          <th className="text-left py-2 text-gray-300">Diving Score</th>
                          <th className="text-left py-2 text-gray-300">Max Wave</th>
                          <th className="text-left py-2 text-gray-300">Max Swell</th>
                          <th className="text-left py-2 text-gray-300">Wind Waves</th>
                          <th className="text-left py-2 text-gray-300">Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marineData.daily.time.map((date: string, index: number) => {
                          // Calculate diving score for this day
                          const dailyScore = getDivingConditionScore(
                            marineData.daily.wave_height_max[index],
                            marineData.daily.swell_wave_height_max[index],
                            undefined, // No current data in daily forecast
                            marineData.daily.wind_wave_height_max[index]
                          )
                          
                          return (
                            <tr key={index} className="border-b border-gray-700">
                              <td className="py-2 text-white">
                                {new Date(date).toLocaleDateString('en-US', { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </td>
                              <td className="py-2">
                                {dailyScore ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold" style={{ color: dailyScore.color }}>
                                      {dailyScore.score}
                                    </span>
                                    <span className="text-xs text-gray-400">
                                      {dailyScore.rating}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-gray-500">N/A</span>
                                )}
                              </td>
                              <td className="py-2 text-blue-300">
                                {formatWaveHeight(marineData.daily.wave_height_max[index])}
                              </td>
                              <td className="py-2 text-green-300">
                                {formatWaveHeight(marineData.daily.swell_wave_height_max[index])}
                              </td>
                              <td className="py-2 text-yellow-300">
                                {formatWaveHeight(marineData.daily.wind_wave_height_max[index])}
                              </td>
                              <td className="py-2 text-purple-300">
                                {marineData.daily.wave_period_max[index] ? `${marineData.daily.wave_period_max[index].toFixed(1)}s` : 'N/A'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Legend */}
                  <div className="mt-4 p-3 bg-blue-900 bg-opacity-30 rounded border border-blue-600">
                    <p className="text-blue-200 text-sm mb-1">
                      <strong>💡 Forecast Legend:</strong>
                    </p>
                    <div className="text-xs text-blue-200 grid grid-cols-1 md:grid-cols-2 gap-2">
                      <div>• Diving Score: Based on wave/swell conditions (0-100)</div>
                      <div>• Max Wave/Swell: Highest expected for the day</div>
                      <div>• Wind Waves: Surface chop from local winds</div>
                      <div>• Period: Time between wave crests</div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-8 text-center shadow-xl">
                <p className="text-gray-300">Select a location to view marine conditions</p>
              </div>
            )}
          </div>
        )}

        {/* Data Source Info */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-4 shadow-xl">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">Data Sources</h3>
          <div className="text-sm text-gray-400 space-y-1">
            <p>• Marine weather data provided by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Open-Meteo Marine API</a> (free, global coverage)</p>
            <p>• Location names via <a href="https://open-meteo.com/en/docs/geocoding-api" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Open-Meteo Geocoding API</a> (free)</p>
            <p>• Tide data from <a href="https://open-meteo.com/en/docs/marine-weather-api" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">Open-Meteo Marine API</a> sea level height (8km resolution) - synthetic fallback when unavailable</p>
            <p>• Wave heights, periods, and ocean currents are forecast models</p>
            <p>• Diving condition scores are calculated based on wave height, swell, and current strength</p>
            <p>• Always verify conditions locally before diving</p>
          </div>
        </div>

        {/* Safety Notice */}
        <div className="bg-amber-900/80 backdrop-blur-sm border border-amber-500/50 rounded-lg p-4 shadow-xl">
          <p className="text-amber-200 text-sm">
            <strong className="text-amber-300">⚠️ Important:</strong> These marine conditions are forecast models and should not be the sole basis for dive planning. 
            Always check local conditions, weather services, and dive operators before entering the water. 
            Technical diving requires proper training and should only be conducted in suitable conditions.
          </p>
        </div>
          </div>
          </div>
        )}
    </main>
  )
}