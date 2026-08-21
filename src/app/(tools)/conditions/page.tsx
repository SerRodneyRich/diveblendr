'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { useUnitConversion } from '@/hooks/useUnitConversion'
import { GiWaves } from 'react-icons/gi'
import {
  buildTideDay,
  isWithinForecastWindow,
  type MarineHourly,
  type SunDaily,
  type TideDay,
} from '@/lib/conditions/tides'
import { MessageBar } from '@/components/ui'
import { scoreConditions, scoreColor } from '@/lib/conditions/score'
import { FaMapMarkerAlt, FaWater, FaWind, FaRedo } from 'react-icons/fa'
import { TiWeatherCloudy } from 'react-icons/ti'
import { MdExpandLess, MdExpandMore, MdStar, MdStarBorder } from 'react-icons/md'
import { useFavorites } from '@/contexts/FavoritesContext'
import dynamic from 'next/dynamic'

// Lazy load Chart-related components to avoid large bundle size on initial load
const TideChart = dynamic(() => import('@/components/TideChart'), {
  ssr: false,
  loading: () => (
    <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
      <div className="h-64 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-4 border-brand-muted border-t-transparent rounded-full mx-auto mb-2"></div>
          <div className="text-text text-sm">Loading tide chart...</div>
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
          <div className="animate-spin w-8 h-8 border-4 border-brand-muted border-t-transparent rounded-full mx-auto mb-2"></div>
          <div className="text-text text-sm">Loading diving conditions...</div>
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
  /** Shape owned by `@/lib/conditions/tides`, which is what consumes it. */
  hourly?: MarineHourly
}

interface SunData {
  daily: SunDaily
}

export default function MarineConditionsPage() {
  const { preferences, convertDepth } = useUnitConversion()
  const { favorites, addFavorite, removeFavorite, isFavorite, getFavoriteId } = useFavorites()
  const [isLoadingLocation, setIsLoadingLocation] = useState(false)
  /** Why the last "use my location" attempt failed, in words a diver can act on. */
  const [locationError, setLocationError] = useState<string | null>(null)
  const [selectedLocation, setSelectedLocation] = useState<{lat: number, lon: number, name: string} | null>(null)
  const [marineData, setMarineData] = useState<MarineData | null>(null)
  const [isLoadingData, setIsLoadingData] = useState(false)
  const [tideData, setTideData] = useState<TideDay | null>(null)
  /** Why the last conditions fetch failed, in words a diver can act on. */
  const [dataError, setDataError] = useState<string | null>(null)
  const [sunData, setSunData] = useState<SunData | null>(null)
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [isLocationCollapsed, setIsLocationCollapsed] = useState(false)
  const [citySearchQuery, setCitySearchQuery] = useState<string>('')
  const [citySearchResults, setCitySearchResults] = useState<Array<{name: string, lat: number, lon: number, country: string, admin1?: string, displayName: string}>>([])
  const [isSearchingCities, setIsSearchingCities] = useState(false)
  const [showDivingScoreTooltip, setShowDivingScoreTooltip] = useState(false)


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
        // Fall through to the next provider; a failed lookup is not an error
        // the diver needs to see, only a reason to try OpenStreetMap.
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
        // Both providers failed; the caller falls back to raw coordinates.
      }
      
    } catch {
      // Every provider failed. The coordinate fallback below is a correct
      // answer, not a degraded one — a dive site is identified by position.
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
    } catch {
      // An empty result list reads as "no such place", so a failed lookup has
      // to say it failed rather than looking like an answer.
      setCitySearchResults([])
      setDataError(
        'Could not search for locations. Check your connection — every calculator on this site works offline, but conditions need one.'
      )
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


  const handleLocationSelect = async (selectedLoc: {lat: number, lon: number, name: string}) => {
    setSelectedLocation(selectedLoc)
    setIsLoadingData(true)
    setIsLocationCollapsed(true)
    setDataError(null)

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
        
        // Tide data for the selected date. Returns null when the model has
        // nothing for this location or day; the page then says so rather than
        // drawing a curve.
        setTideData(buildTideDay(marineDataResult.hourly, selectedDate, sunDataResult?.daily))
      } else {
        // Clear the data as well as the tides. Leaving `marineData` behind
        // showed the previous location's waves and currents under the new
        // location's name, with nothing on screen to say the refresh failed.
        setDataError(
          `The marine service answered ${marineResponse.status}. Conditions for this location could not be loaded.`
        )
        setMarineData(null)
        setSunData(null)
        setTideData(null)
      }
    } catch {
      setDataError(
        'Could not reach the marine service. Check your connection — conditions need one, though every calculator on this site works offline.'
      )
      setMarineData(null)
      setSunData(null)
      setTideData(null)
    }
    
    setIsLoadingData(false)
  }

  const getCurrentUserLocation = () => {
    setIsLoadingLocation(true)
    setLocationError(null)

    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('This browser cannot report your location. Search for a place instead.')
      setIsLoadingLocation(false)
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const lat = position.coords.latitude
          const lon = position.coords.longitude
          const locationName = await reverseGeocode(lat, lon)
          const locationData = { lat, lon, name: locationName }
          setSelectedLocation(locationData)
          handleLocationSelect(locationData)
        } catch {
          // The fix worked but naming it did not — that is a lookup failure,
          // not a permission problem, and it needs to say so.
          setLocationError('Found you, but could not load conditions. Try again in a moment.')
        } finally {
          setIsLoadingLocation(false)
        }
      },
      (error) => {
        // GeolocationPositionError has no enumerable own properties, so it
        // logs as "{}" — which is exactly the useless console error this
        // replaces. Map the code to something the diver can act on, and show
        // it on the page rather than only in a console they will never open.
        const reason =
          error.code === error.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it in your browser settings, or search for a place below.'
            : error.code === error.POSITION_UNAVAILABLE
              ? 'Your position is unavailable right now. Search for a place below.'
              : error.code === error.TIMEOUT
                ? 'Locating you timed out. Try again, or search for a place below.'
                : 'Could not get your location. Search for a place below.'
        setLocationError(reason)
        setIsLoadingLocation(false)
      },
      // Without a timeout this hangs indefinitely on a denied-but-not-answered
      // prompt, leaving the button stuck on "Getting Location...".
      { timeout: 10_000, maximumAge: 60_000 }
    )
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

  const navigateDate = (direction: 'prev' | 'next') => {
    const newDate = new Date(selectedDate)
    if (direction === 'prev') {
      newDate.setDate(newDate.getDate() - 1)
    } else {
      newDate.setDate(newDate.getDate() + 1)
    }
    
    if (!isWithinForecastWindow(newDate, marineData?.hourly?.time ?? [])) {
      return
    }

    
    setSelectedDate(newDate)
    
    // Regenerate tide data for the new date
    if (selectedLocation && marineData) {
      setTideData(buildTideDay(marineData.hourly, newDate, sunData?.daily))
    }
  }

  const resetLocation = () => {
    setSelectedLocation(null)
    setMarineData(null)
    setTideData(null)
    setDataError(null)
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

  // The four readings the score is computed from, passed explicitly rather than
  // read out of the closure. `getDivingConditionScore` is redefined every
  // render and closes over `marineData`, so a dependency array listing only the
  // primitives was correct by luck; naming them as arguments makes it correct
  // by construction.
  const current = marineData?.current
  const divingCondition = useMemo(
    () =>
      current
        ? scoreConditions({
            waveHeight: current.wave_height,
            swellHeight: current.swell_wave_height,
            windWaveHeight: current.wind_wave_height,
            currentVelocity: current.ocean_current_velocity,
          })
        : null,
    [current]
  )

  return (
    <div className="text-text">
      {/* AppShell supplies the chrome (sidebar, header, marine backdrop) and the
          page container, so this page renders only its own content. The old
          `imageLoaded` gate is gone with BackgroundImage: content used to stay
          hidden until a random JPEG decoded, which delayed first paint for no
          reason and blanked the page entirely if the image failed. */}
      <div className="relative z-10 w-full">
        <div className="space-y-6">
        {/* Location Selection */}
        <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-6 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-brand flex items-center gap-2">
              <FaMapMarkerAlt />
              {isLocationCollapsed ? 'Current Location' : 'Select Location'}
            </h2>
            {isLocationCollapsed && (
              <button
                onClick={resetLocation}
                className="bg-surface-3 hover:bg-surface-3 text-text px-3 py-1 rounded-lg transition-colors flex items-center gap-2 text-sm"
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
                  <p className="text-text font-medium">{selectedLocation?.name}</p>
                  <p className="text-text-muted text-sm">
                    {selectedLocation?.lat.toFixed(3)}, {selectedLocation?.lon.toFixed(3)}
                  </p>
                </div>
                {selectedLocation && (
                  <button
                    onClick={handleToggleFavorite}
                    className="text-accent hover:text-accent transition-colors p-1"
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
                className="text-text-muted hover:text-text transition-colors"
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
                    className="bg-brand hover:bg-brand-strong disabled:bg-surface-3 text-text px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <FaMapMarkerAlt />
                    {isLoadingLocation ? 'Getting Location...' : 'Use Current Location'}
                  </button>

                  {/* Favorite Locations inline */}
                  {favorites.length > 0 && (
                    <>
                      <span className="text-text-muted text-sm">or</span>
                      {favorites.map((favorite) => (
                        <div
                          key={favorite.id}
                          className="group bg-accent/20 hover:bg-accent/30 border border-warning-border/30 hover:border-warning-border/50 rounded-full px-3 py-2 text-sm text-warning hover:text-accent transition-all duration-200 flex items-center gap-2 relative"
                        >
                          <button
                            onClick={() => handleFavoriteSelect(favorite)}
                            className="flex items-center gap-2 text-warning hover:text-accent focus:outline-none focus:ring-2 focus:ring-brand focus:ring-opacity-50 rounded"
                          >
                            <MdStar className="text-accent text-sm" />
                            <span className="truncate max-w-32">{favorite.name}</span>
                          </button>
                          <button
                            onClick={() => removeFavorite(favorite.id)}
                            className="opacity-0 group-hover:opacity-100 text-accent hover:text-danger transition-all duration-200 ml-1 focus:outline-none focus:ring-2 focus:ring-danger focus:ring-opacity-50 rounded w-4 h-4 flex items-center justify-center text-xs"
                            title="Remove from favorites"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Denying the permission prompt used to do nothing visible at
                    all — the spinner stopped and the page sat there. */}
                {locationError && (
                  <p role="status" className="text-sm text-warning">
                    {locationError}
                  </p>
                )}
              </div>

              {/* City Search */}
              <div>
                <h3 className="text-lg font-medium text-text mb-3">Search for a City or Location</h3>
                
                {/* Search Input */}
                <div className="relative mb-4">
                  <input
                    type="text"
                    placeholder="Type city name (e.g., 'Miami', 'Bali', 'Cairo')..."
                    value={citySearchQuery}
                    onChange={(e) => setCitySearchQuery(e.target.value)}
                    className="w-full bg-black/40 backdrop-blur-sm border border-white/30 rounded-lg px-4 py-3 text-text placeholder-gray-400 focus:border-brand-muted focus:outline-none"
                  />
                  {isSearchingCities && (
                    <div className="absolute right-3 top-3.5">
                      <div className="animate-spin w-5 h-5 border-2 border-brand-muted border-t-transparent rounded-full"></div>
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
                        className="w-full text-left p-3 hover:bg-surface-3 transition-colors border-b border-border-strong last:border-b-0"
                      >
                        <div className="text-text font-medium">{city.displayName}</div>
                        <div className="text-text-muted text-sm">
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
                  className="w-full text-center text-text-muted hover:text-text transition-colors flex items-center justify-center gap-2 pt-2"
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
              <div className="bg-surface-1 border border-border rounded-lg p-8 text-center">
                <div className="animate-spin w-8 h-8 border-4 border-brand-muted border-t-transparent rounded-full mx-auto mb-4"></div>
                <p className="text-text">Loading marine conditions...</p>
              </div>
            ) : marineData ? (
              <div className="space-y-6">
                {/* Diving Condition Score */}
                {divingCondition && (
                  <DivingConditionScore 
                    divingCondition={{
                      ...divingCondition,
                      color: scoreColor(divingCondition.score),
                    }}
                    showTooltip={showDivingScoreTooltip}
                    onToggleTooltip={() => setShowDivingScoreTooltip(!showDivingScoreTooltip)}
                  />
                )}

                {/* Tide Chart. When the marine model has no sea-level series
                    for this location, say so plainly — an invented curve is
                    worse than a gap on a tool used to plan slack water. */}
                {tideData ? (
                  <TideChart 
                    tideData={tideData} 
                    selectedDate={selectedDate} 
                    onNavigateDate={navigateDate}
                  />
                ) : (
                  <div className="bg-surface-1 border border-border rounded-lg p-6">
                    <h3 className="text-xl font-semibold text-brand mb-2 flex items-center gap-2">
                      <GiWaves />
                      Tide Chart
                    </h3>
                    <p className="text-text-muted text-sm">
                      No tide data is available for this location. The Open-Meteo
                      marine model does not cover every coastline — inland and some
                      enclosed waters have no sea-level series. Check a local tide
                      table before planning around slack water.
                    </p>
                  </div>
                )}

                {/* Current Conditions */}
                <div className="bg-surface-1 border border-border rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-brand mb-4 flex items-center gap-2">
                    <GiWaves />
                    Current Marine Conditions
                  </h3>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <GiWaves className="text-brand" />
                        <span className="font-medium">Wave Height</span>
                      </div>
                      <div className="text-xl font-bold text-text">
                        {formatWaveHeight(marineData.current.wave_height)}
                      </div>
                    </div>

                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-brand" />
                        <span className="font-medium">Swell Height</span>
                      </div>
                      <div className="text-xl font-bold text-text">
                        {formatWaveHeight(marineData.current.swell_wave_height)}
                      </div>
                    </div>

                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWind className="text-brand" />
                        <span className="font-medium">Wave Period</span>
                      </div>
                      <div className="text-xl font-bold text-text">
                        {marineData.current.wave_period ? `${marineData.current.wave_period.toFixed(1)}s` : 'N/A'}
                      </div>
                    </div>

                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-success" />
                        <span className="font-medium">Current Speed</span>
                      </div>
                      <div className="text-xl font-bold text-text">
                        {formatCurrentSpeed(marineData.current.ocean_current_velocity)}
                      </div>
                    </div>

                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWind className="text-success" />
                        <span className="font-medium">Wave Direction</span>
                      </div>
                      <div className="text-lg font-bold text-text">
                        {formatDirection(marineData.current.wave_direction)}
                      </div>
                    </div>

                    <div className="bg-surface-2 rounded p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <FaWater className="text-success" />
                        <span className="font-medium">Current Direction</span>
                      </div>
                      <div className="text-lg font-bold text-text">
                        {formatDirection(marineData.current.ocean_current_direction)}
                      </div>
                    </div>
                  </div>
                </div>

                {/* 7-Day Forecast */}
                <div className="bg-surface-1 border border-border rounded-lg p-6">
                  <h3 className="text-xl font-semibold text-brand mb-4 flex items-center gap-2">
                    <TiWeatherCloudy />
                    7-Day Marine Forecast
                  </h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border-strong">
                          <th className="text-left py-2 text-text">Date</th>
                          <th className="text-left py-2 text-text">Diving Score</th>
                          <th className="text-left py-2 text-text">Max Wave</th>
                          <th className="text-left py-2 text-text">Max Swell</th>
                          <th className="text-left py-2 text-text">Wind Waves</th>
                          <th className="text-left py-2 text-text">Period</th>
                        </tr>
                      </thead>
                      <tbody>
                        {marineData.daily.time.map((date: string, index: number) => {
                          // The daily forecast carries no current, so that
                          // term contributes nothing rather than being guessed.
                          const dailyScore = scoreConditions({
                            waveHeight: marineData.daily.wave_height_max[index],
                            swellHeight: marineData.daily.swell_wave_height_max[index],
                            windWaveHeight: marineData.daily.wind_wave_height_max[index],
                          })
                          
                          return (
                            <tr key={index} className="border-b border-border">
                              <td className="py-2 text-text">
                                {new Date(date).toLocaleDateString(undefined, { 
                                  weekday: 'short', 
                                  month: 'short', 
                                  day: 'numeric' 
                                })}
                              </td>
                              <td className="py-2">
                                {dailyScore ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-bold" style={{ color: scoreColor(dailyScore.score) }}>
                                      {dailyScore.score}
                                    </span>
                                    <span className="text-xs text-text-muted">
                                      {dailyScore.rating}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="text-text-subtle">N/A</span>
                                )}
                              </td>
                              <td className="py-2 text-brand">
                                {formatWaveHeight(marineData.daily.wave_height_max[index])}
                              </td>
                              <td className="py-2 text-success">
                                {formatWaveHeight(marineData.daily.swell_wave_height_max[index])}
                              </td>
                              <td className="py-2 text-accent">
                                {formatWaveHeight(marineData.daily.wind_wave_height_max[index])}
                              </td>
                              <td className="py-2 text-he">
                                {marineData.daily.wave_period_max[index] ? `${marineData.daily.wave_period_max[index].toFixed(1)}s` : 'N/A'}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                  
                  {/* Legend */}
                </div>
              </div>
            ) : (
              <div className="bg-black/40 backdrop-blur-sm border border-white/20 rounded-lg p-8 text-center shadow-xl">
                <p className="text-text">Select a location to view marine conditions</p>
              </div>
            )}
          </div>
        )}

        </div>
      </div>

      <MessageBar
        items={[
          ...(dataError
            ? [
                {
                  id: 'data-error',
                  severity: 'danger' as const,
                  title: 'Conditions could not be loaded',
                  message: dataError,
                },
              ]
            : []),
          {
            id: 'forecast-safety',
            severity: 'warning',
            title: 'Forecasts, not observations',
            message:
              'These are forecast models and should not be the sole basis for dive planning. Check local conditions, weather services and dive operators before entering the water.',
          },
          {
            id: 'slack-water',
            severity: 'info',
            title: 'Timing slack water',
            message:
              'Currents are weakest around slack tide — roughly 30 minutes either side of high or low water. Tide heights come from an 8 km ocean model, not a harmonic station: good for finding slack, not for navigation.',
          },
          {
            id: 'legend',
            severity: 'info',
            title: 'Reading the forecast',
            message:
              'Diving score rates wave and swell conditions from 0 to 100. Max wave and swell are the highest expected that day; wind waves are surface chop raised by local wind; period is the time between crests.',
          },
          {
            id: 'sources',
            severity: 'info',
            title: 'Data sources',
            message: (
              <>
                Marine and tide data (sea level height, 8 km resolution) and location names from{' '}
                <a
                  href="https://open-meteo.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand underline underline-offset-2 hover:text-brand-strong"
                >
                  Open-Meteo
                </a>
                . Waves, periods and currents are forecast models; the diving score is derived
                from wave height, swell and current. Tides are shown only where the model has
                data. Always verify locally before diving.
              </>
            ),
          },
        ]}
      />
    </div>
  )
}