'use client';

import React from 'react';
import { AccessibilityProvider } from '../contexts/AccessibilityContext';
import { UnitsProvider } from '../contexts/UnitsContext';
import { FavoritesProvider } from '../contexts/FavoritesContext';

interface ClientProvidersProps {
  children: React.ReactNode;
}

export const ClientProviders: React.FC<ClientProvidersProps> = ({ children }) => {
  return (
    <AccessibilityProvider>
      <UnitsProvider>
        <FavoritesProvider>
          {children}
        </FavoritesProvider>
      </UnitsProvider>
    </AccessibilityProvider>
  );
};