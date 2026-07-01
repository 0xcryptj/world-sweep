'use client';

import { hapticImpact } from '@/lib/haptics';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { ReactNode, useEffect, useState } from 'react';
import { SplashScreen } from './index';

const MIN_SPLASH_MS = 1800;

type SplashGateProps = {
  children: ReactNode;
};

export function SplashGate({ children }: SplashGateProps) {
  const { isInstalled } = useMiniKit();
  const [minTimeElapsed, setMinTimeElapsed] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setTimeout(() => setMinTimeElapsed(true), MIN_SPLASH_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const miniKitReady = isInstalled !== undefined;
  const ready = minTimeElapsed && miniKitReady;

  useEffect(() => {
    if (!ready) {
      return;
    }

    void hapticImpact('light');
    const timer = window.setTimeout(() => setVisible(false), 80);
    return () => window.clearTimeout(timer);
  }, [ready]);

  return (
    <>
      <SplashScreen visible={visible} />
      {children}
    </>
  );
}
