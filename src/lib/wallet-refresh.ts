'use client';

import { useEffect, useRef } from 'react';

export const WALLET_REFRESH_EVENT = 'forager:wallet-refresh';

export type WalletRefreshReason =
  | 'connect'
  | 'scan'
  | 'forage'
  | 'focus'
  | 'manual'
  | 'nav';

export type WalletRefreshDetail = {
  reason?: WalletRefreshReason;
  /** Force server-side cache bust when supported. */
  force?: boolean;
};

export function requestWalletRefresh(detail: WalletRefreshDetail = {}): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.dispatchEvent(
    new CustomEvent<WalletRefreshDetail>(WALLET_REFRESH_EVENT, { detail }),
  );
}

/**
 * Subscribes to forage-driven refresh events plus tab focus / visibility so
 * WLD chip and wallet panel stay current after scan, forage, and nav.
 */
export function useWalletRefreshListener(
  onRefresh: (detail: WalletRefreshDetail) => void,
  options?: { refreshOnFocus?: boolean; minIntervalMs?: number },
): void {
  const callbackRef = useRef(onRefresh);
  callbackRef.current = onRefresh;
  const lastRunRef = useRef(0);
  const refreshOnFocus = options?.refreshOnFocus ?? true;
  const minIntervalMs = options?.minIntervalMs ?? 1_500;

  useEffect(() => {
    const run = (detail: WalletRefreshDetail) => {
      const now = Date.now();
      if (!detail.force && now - lastRunRef.current < minIntervalMs) {
        return;
      }
      lastRunRef.current = now;
      callbackRef.current(detail);
    };

    const onCustom = (event: Event) => {
      const custom = event as CustomEvent<WalletRefreshDetail>;
      run(custom.detail ?? {});
    };

    const onFocus = () => {
      if (!refreshOnFocus) {
        return;
      }
      if (document.visibilityState === 'visible') {
        run({ reason: 'focus' });
      }
    };

    window.addEventListener(WALLET_REFRESH_EVENT, onCustom);
    if (refreshOnFocus) {
      window.addEventListener('focus', onFocus);
      document.addEventListener('visibilitychange', onFocus);
      window.addEventListener('pageshow', onFocus);
    }

    return () => {
      window.removeEventListener(WALLET_REFRESH_EVENT, onCustom);
      if (refreshOnFocus) {
        window.removeEventListener('focus', onFocus);
        document.removeEventListener('visibilitychange', onFocus);
        window.removeEventListener('pageshow', onFocus);
      }
    };
  }, [minIntervalMs, refreshOnFocus]);
}
