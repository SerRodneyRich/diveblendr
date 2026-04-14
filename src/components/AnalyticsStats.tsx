'use client'

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IoIosStats } from 'react-icons/io';

interface AnalyticsStatsProps {
  className?: string;
}

export default function AnalyticsStats({ className = '' }: AnalyticsStatsProps) {
  const [showStats, setShowStats] = useState(false);
  const [showTooltip, setShowTooltip] = useState(false);
  const [sessionCount, setSessionCount] = useState(0);
  const [goatCounterStats, setGoatCounterStats] = useState<{
    totalViews: number; 
    uniqueVisitors: number; 
    totalCountries: number;
    topCountries: Array<{name: string; count: number}>;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Simple client-side session tracking
    const sessions = localStorage.getItem('diveblendr-sessions');
    const currentCount = sessions ? parseInt(sessions) : 0;
    
    // Check if this is a new session (simplified)
    const lastVisit = localStorage.getItem('diveblendr-last-visit');
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    
    if (!lastVisit || now - parseInt(lastVisit) > oneHour) {
      // New session
      const newCount = currentCount + 1;
      localStorage.setItem('diveblendr-sessions', newCount.toString());
      localStorage.setItem('diveblendr-last-visit', now.toString());
      setSessionCount(newCount);
    } else {
      setSessionCount(currentCount);
    }
  }, []);

  const fetchGoatCounterStats = async () => {
    // Don't run during build/SSR
    if (typeof window === 'undefined') {
      return;
    }
    
    setLoading(true);
    setError(null);
    
    try {
      // Try to fetch stats from GoatCounter API
      const apiKey = process.env.NEXT_PUBLIC_GOATCOUNTER_API_KEY;
      
      if (!apiKey) {
        throw new Error('GoatCounter API key not configured');
      }

      // Fetch both total stats and locations data
      const goatCounterBase = `https://${process.env.NEXT_PUBLIC_GOATCOUNTER_DOMAIN}`;
      const [totalResponse, locationsResponse] = await Promise.all([
        fetch(`${goatCounterBase}/api/v0/stats/total`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        }),
        fetch(`${goatCounterBase}/api/v0/stats/locations`, {
          headers: { 'Authorization': `Bearer ${apiKey}` },
        })
      ]);

      if (!totalResponse.ok || !locationsResponse.ok) {
        throw new Error(`API error: ${totalResponse.status} / ${locationsResponse.status}`);
      }

      const [totalData, locationsData] = await Promise.all([
        totalResponse.json(),
        locationsResponse.json()
      ]);

      // Debug logging to understand the API response structure
      console.log('GoatCounter Total Data:', totalData);
      console.log('GoatCounter Locations Data:', locationsData);

      // Extract data from the response based on actual GoatCounter API structure
      const totalViews = totalData.total || 0;
      // GoatCounter doesn't provide unique visitors in this endpoint
      // Calculate recent activity from daily stats instead
      const recentDays = totalData.stats ? totalData.stats.slice(-7) : [];
      const last7Days = recentDays.reduce((sum: number, day: {daily?: number}) => sum + (day.daily || 0), 0);

      setGoatCounterStats({
        totalViews,
        uniqueVisitors: last7Days,
        totalCountries: locationsData.stats ? locationsData.stats.length : 0,
        topCountries: locationsData.stats ? locationsData.stats.slice(0, 5).map((item: {name?: string; count?: number}) => ({
          name: item.name || 'Unknown',
          count: item.count || 0
        })) : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch stats');
      console.error('GoatCounter API error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleStatsClick = () => {
    setShowStats(!showStats);
    
    if (!showStats && !goatCounterStats && !error) {
      // Fetch stats when opening for the first time
      fetchGoatCounterStats();
    }
  };

  return (
    <>
      {/* Stats Button - Simplified */}
      <button
        onClick={handleStatsClick}
        className={`${className}`}
        aria-label="View site statistics"
        title="Site Statistics"
      >
        <IoIosStats className="h-6 w-6" />
      </button>

      {/* Stats Modal - Rendered as Portal */}
      {showStats && typeof window !== 'undefined' && createPortal(
        <div 
          className="fixed inset-0 bg-black bg-opacity-75 z-[9999] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setShowStats(false);
            }
          }}
        >
          <div className="bg-gray-800 border border-gray-600 rounded-lg max-w-md w-full">
            {/* Header */}
            <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-600">
              <h2 className="text-xl sm:text-2xl font-bold text-yellow-400">Site Statistics</h2>
              <button
                onClick={() => setShowStats(false)}
                className="min-w-[44px] min-h-[44px] bg-gray-600 hover:bg-gray-500 text-white rounded-full flex items-center justify-center transition-colors text-lg font-bold focus:ring-2 focus:ring-yellow-400 focus:outline-none"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            
            {/* Content */}
            <div className="p-4 sm:p-6 space-y-4">
              {loading && (
                <div className="text-center py-4">
                  <div className="text-gray-200">Loading statistics...</div>
                </div>
              )}

              {/* GoatCounter Stats */}
              {goatCounterStats && (
                <div className="space-y-4 mb-4">
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-green-400">
                      <div className="text-center">
                        <h3 className="text-gray-200 text-sm font-medium">Total Views</h3>
                        <p className="text-2xl font-bold text-green-400">{goatCounterStats.totalViews.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-purple-400">
                      <div className="text-center">
                        <h3 className="text-gray-200 text-sm font-medium">Last 7 Days</h3>
                        <p className="text-2xl font-bold text-purple-400">{goatCounterStats.uniqueVisitors.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-blue-400">
                      <div className="text-center">
                        <h3 className="text-gray-200 text-sm font-medium">Countries</h3>
                        <p className="text-2xl font-bold text-blue-400">{goatCounterStats.totalCountries || 0}</p>
                      </div>
                    </div>
                  </div>

                  {/* Top Countries */}
                  {goatCounterStats.topCountries && goatCounterStats.topCountries.length > 0 && (
                    <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-orange-400">
                      <h3 className="text-gray-200 text-sm font-medium mb-3">Top Countries</h3>
                      <div className="space-y-2">
                        {goatCounterStats.topCountries.map((country, index) => (
                          <div key={country.name} className="flex justify-between items-center">
                            <div className="flex items-center">
                              <span className="text-orange-400 text-sm font-bold w-6">{index + 1}.</span>
                              <span className="text-gray-300 text-sm">{country.name}</span>
                            </div>
                            <span className="text-orange-400 text-sm font-semibold">{country.count.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error State */}
              {error && (
                <div className="bg-red-900/50 border border-red-600 rounded-lg p-4 mb-4">
                  <p className="text-red-200 text-sm mb-2">
                    <strong>Stats unavailable:</strong> {error}
                  </p>
                  <button
                    onClick={fetchGoatCounterStats}
                    className="px-3 py-1 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors"
                  >
                    Retry
                  </button>
                </div>
              )}

              {/* Local Session Stats */}
              <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-cyan-400">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-gray-200 text-sm font-medium">Your Sessions</h3>
                    <p className="text-2xl font-bold text-cyan-400">{sessionCount}</p>
                    <p className="text-gray-400 text-xs mt-1">Times you&apos;ve visited this browser</p>
                  </div>
                  <div className="text-cyan-400 text-3xl">👤</div>
                </div>
              </div>


              {/* Privacy Note */}
              <div className="bg-gray-700 rounded-lg p-4 border-l-4 border-yellow-400">
                <div className="text-center">
                  <h3 className="text-yellow-400 text-sm font-medium mb-2">🔒 Privacy First</h3>
                  <p className="text-gray-300 text-xs leading-relaxed">
                    DiveBlendr uses GoatCounter for privacy-friendly analytics. 
                    No personal data is collected, no tracking across sites, 
                    and all data is publicly accessible.
                  </p>
                </div>
              </div>

              {/* Powered by GoatCounter */}
              <div className="text-center pt-2">
                <p className="text-gray-500 text-xs">
                  Powered by <a href="https://goatcounter.com" target="_blank" rel="noopener noreferrer" className="text-yellow-400 hover:text-yellow-300">GoatCounter</a>
                </p>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}