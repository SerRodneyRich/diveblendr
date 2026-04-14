'use client';

import React from 'react';
import { useUnits } from '../contexts/UnitsContext';
import { FiGlobe } from 'react-icons/fi';

interface UnitsToggleProps {
  className?: string;
  showLabel?: boolean;
}

export const UnitsToggle: React.FC<UnitsToggleProps> = ({ 
  className = '', 
  showLabel = true 
}) => {
  const { preferences, setUnitSystem } = useUnits();

  const handleToggle = () => {
    const newSystem = preferences.system === 'metric' ? 'imperial' : 'metric';
    setUnitSystem(newSystem);
  };

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {showLabel && (
        <FiGlobe className="w-4 h-4 text-gray-600" />
      )}
      
      {/* Enhanced Toggle Switch */}
      <div className="relative">
        <button
          onClick={handleToggle}
          className={`relative inline-flex items-center h-3 rounded-full w-25 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-offset-2 shadow-lg ${
            preferences.system === 'metric'
              ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 focus:ring-blue-500'
              : 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 focus:ring-green-500'
          }`}
          role="switch"
          aria-checked={preferences.system === 'imperial'}
          aria-label={`Switch to ${preferences.system === 'metric' ? 'imperial' : 'metric'} units`}
        >
          {/* Background Labels */}
          <div className="absolute inset-0 flex items-center justify-center text-xs font-small text-white">
            <span className={`transition-opacity duration-300 ${preferences.system === 'metric' ? 'opacity-100' : 'opacity-0'}`}>
              metric
            </span>
            <span className={`transition-opacity duration-300 ${preferences.system === 'imperial' ? 'opacity-100' : 'opacity-0'} absolute`}>
              imperial
            </span>
          </div>
          
          {/* Sliding Handle */}
          <span
            className={`inline-block w-4 h-4 transform transition-all duration-300 bg-white rounded-full shadow-lg border border-gray-200 ${
              preferences.system === 'imperial' ? 'translate-x-[5.25rem]' : 'translate-x-1'
            }`}
          >
            <div className="w-full h-full flex items-center justify-center">
              <div className={`w-1.5 h-1.5 rounded-full transition-colors duration-300 ${
                preferences.system === 'metric' ? 'bg-blue-500' : 'bg-green-500'
              }`} />
            </div>
          </span>
        </button>
      </div>
      
      {showLabel && (
        <div className="flex flex-col text-sm">
          <span className="text-gray-900 dark:text-white font-medium">
            {preferences.system === 'metric' ? 'Metric' : 'Imperial'}
          </span>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {preferences.system === 'metric' ? 'bar • m • L' : 'psi • ft • ft³'}
          </span>
        </div>
      )}
    </div>
  );
};