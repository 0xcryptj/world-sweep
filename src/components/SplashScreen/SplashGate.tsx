'use client';

import { hapticImpact } from '@/lib/haptics';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { SplashRevealContext } from '@/components/SplashScreen/splash-reveal';
import { ReactNode, useCallback, useEffect, useState } from 'react';
import { Preloader } from '@/components/ui/preloader';

const MIN_SPLASH_MS = 3200;

type SplashGateProps = {
  children: ReactNode;
};

export function SplashGate({ children }: SplashGateProps) {
  const { isInstalled } = useMiniKit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [ready, setReady] = useState(false);
  const [revealed, setRevealed] = useState(false);

  useEffect(() => {
    const hold =
      typeof window !== 'undefined' &&
      new URLSearchParams(window.location.search).get('splash') === '1';
    if (hold) {
      return;
    }
    const timer = window.setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const miniKitReady = isInstalled !== undefined;

  useEffect(() => {
    if (!minTimeElapsed || !miniKitReady || ready) {
      return;
    }
    void hapticImpact('medium');
    setReady(true);
  }, [minTimeElapsed, miniKitReady, ready]);

  const onComplete = useCallback(() => {
    void hapticImpact('light');
    setRevealed(true);
  }, []);

  return (
    <>
      <Preloader ready={ready} onComplete={onComplete} />
      <SplashRevealContext.Provider value={revealed}>
        {children}
      </SplashRevealContext.Provider>
    </>
  );
}
