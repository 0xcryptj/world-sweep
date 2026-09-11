'use client';

import { createContext, useContext } from 'react';

export const SplashRevealContext = createContext(true);

export function useSplashRevealed() {
  return useContext(SplashRevealContext);
}
