'use client';

import { installMiniKitEventHandlers } from '@/lib/minikit-transaction';
import { useEffect } from 'react';

/** Runs once on mount to patch MiniKit event-handler gaps after transactions. */
export function MiniKitEventSetup() {
  useEffect(() => {
    installMiniKitEventHandlers();
  }, []);

  return null;
}
