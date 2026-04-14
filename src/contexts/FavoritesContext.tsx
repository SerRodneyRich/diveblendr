'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface FavoriteLocation {
  id: string;
  lat: number;
  lon: number;
  name: string;
  addedAt: string; // ISO string
}

interface FavoritesContextType {
  favorites: FavoriteLocation[];
  addFavorite: (location: { lat: number; lon: number; name: string }) => void;
  removeFavorite: (id: string) => void;
  isFavorite: (lat: number, lon: number) => boolean;
  getFavoriteId: (lat: number, lon: number) => string | null;
}

const FavoritesContext = createContext<FavoritesContextType | undefined>(undefined);

export const useFavorites = () => {
  const context = useContext(FavoritesContext);
  if (context === undefined) {
    throw new Error('useFavorites must be used within a FavoritesProvider');
  }
  return context;
};

interface FavoritesProviderProps {
  children: ReactNode;
}

export const FavoritesProvider: React.FC<FavoritesProviderProps> = ({ children }) => {
  const [favorites, setFavorites] = useState<FavoriteLocation[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load favorites from localStorage on mount
  useEffect(() => {
    try {
      if (typeof window !== 'undefined') {
        const savedFavorites = localStorage.getItem('diveblendr-favorites');
        console.log('Loading favorites from localStorage:', savedFavorites);
        if (savedFavorites) {
          const parsed = JSON.parse(savedFavorites);
          console.log('Parsed favorites:', parsed);
          setFavorites(parsed);
        }
      }
    } catch (error) {
      console.error('Failed to parse favorite locations:', error);
    }
    setIsLoaded(true);
  }, []);

  // Save favorites to localStorage when they change (but not on initial load)
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined') {
      console.log('Saving favorites to localStorage:', favorites);
      localStorage.setItem('diveblendr-favorites', JSON.stringify(favorites));
    }
  }, [favorites, isLoaded]);

  // Helper function to generate a location ID based on coordinates
  const generateLocationId = (lat: number, lon: number): string => {
    return `${lat.toFixed(4)}_${lon.toFixed(4)}`;
  };

  // Check if coordinates are approximately the same (within ~100m tolerance)
  const coordinatesMatch = (lat1: number, lon1: number, lat2: number, lon2: number): boolean => {
    const tolerance = 0.001; // approximately 100m
    return Math.abs(lat1 - lat2) < tolerance && Math.abs(lon1 - lon2) < tolerance;
  };

  const addFavorite = (location: { lat: number; lon: number; name: string }) => {
    const id = generateLocationId(location.lat, location.lon);
    
    // Check if this location (or very similar) already exists
    const exists = favorites.some(fav => 
      coordinatesMatch(fav.lat, fav.lon, location.lat, location.lon)
    );
    
    if (!exists) {
      const newFavorite: FavoriteLocation = {
        id,
        lat: location.lat,
        lon: location.lon,
        name: location.name,
        addedAt: new Date().toISOString()
      };
      
      setFavorites(prev => [newFavorite, ...prev]); // Add to beginning for most recent first
    }
  };

  const removeFavorite = (id: string) => {
    setFavorites(prev => prev.filter(fav => fav.id !== id));
  };

  const isFavorite = (lat: number, lon: number): boolean => {
    return favorites.some(fav => 
      coordinatesMatch(fav.lat, fav.lon, lat, lon)
    );
  };

  const getFavoriteId = (lat: number, lon: number): string | null => {
    const favorite = favorites.find(fav => 
      coordinatesMatch(fav.lat, fav.lon, lat, lon)
    );
    return favorite?.id || null;
  };

  const value: FavoritesContextType = {
    favorites,
    addFavorite,
    removeFavorite,
    isFavorite,
    getFavoriteId,
  };

  return (
    <FavoritesContext.Provider value={value}>
      {children}
    </FavoritesContext.Provider>
  );
};