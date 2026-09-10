'use client';

import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { apiPath } from '@/lib/base-path';
import { hapticImpact, hapticSelection } from '@/lib/haptics';
import { useLocalFiat, wldAmountToFiat } from '@/lib/use-wld-price';
import {
  requestWalletRefresh,
  useWalletRefreshListener,
} from '@/lib/wallet-refresh';
import { MiniKit } from '@worldcoin/minikit-js';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

type WldBalanceChipProps = {
  className?: string;
};

export function WldBalanceChip({ className = '' }: WldBalanceChipProps) {
  const { data: session } = useSession();
  const fiat = useLocalFiat();
  const [balance, setBalance] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const walletAddress =
    session?.user?.walletAddress ?? MiniKit.user?.walletAddress ?? '';

  const fiatLabel = useMemo(() => {
    if (!balance || fiat.price === null) {
      return null;
    }
    return fiat.format(wldAmountToFiat(balance, fiat.price));
  }, [balance, fiat]);

  const loadBalance = useCallback(async () => {
    if (!walletAddress) {
      setLoading(false);
      return;
    }

    // Soft client cache — avoids /balance right after a scan seeded server WLD.
    try {
      const cacheKey = `forager:wld:${walletAddress.toLowerCase()}`;
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { balance: string; at: number };
        if (
          parsed.balance != null &&
          Date.now() - parsed.at < 30_000
        ) {
          setBalance(parsed.balance);
          setLoading(false);
          return;
        }
      }
    } catch {
      /* sessionStorage unavailable */
    }

    setLoading(true);

    try {
      const response = await fetch(
        apiPath(`/balance?address=${encodeURIComponent(walletAddress)}`),
        { cache: 'no-store' },
      );
      const payload = (await response.json()) as {
        wldBalance?: string;
        error?: string;
      };

      if (response.ok) {
        const next = payload.wldBalance ?? '0';
        setBalance(next);
        try {
          sessionStorage.setItem(
            `forager:wld:${walletAddress.toLowerCase()}`,
            JSON.stringify({ balance: next, at: Date.now() }),
          );
        } catch {
          /* ignore */
        }
      }
    } catch {
      // Keep the last known balance on transient failures — never block UI.
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadBalance();
  }, [loadBalance]);

  useWalletRefreshListener(
    (detail) => {
      // Skip chip refetch after soft wallet/scan refreshes — /wallet and
      // holdings already seed the WLD cache. Force/forage still refresh.
      if (
        !detail.force &&
        detail.reason !== 'forage' &&
        detail.reason !== 'manual' &&
        detail.reason !== 'connect'
      ) {
        return;
      }
      try {
        sessionStorage.removeItem(
          `forager:wld:${walletAddress.toLowerCase()}`,
        );
      } catch {
        /* ignore */
      }
      void loadBalance();
    },
    { minIntervalMs: 2_500 },
  );

  if (!walletAddress) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        void hapticSelection();
        void hapticImpact('light');
        requestWalletRefresh({ reason: 'manual', force: true });
        void loadBalance();
      }}
      className={`forager-balance-chip flex items-center gap-2 rounded-full px-2.5 py-1.5 text-left ${className}`}
      aria-label="Refresh WLD balance"
    >
      <TokenIcon
        size="xs"
        address="0x2cFc85d8E48F8EAB294be644d9E25C3030863003"
        symbol="WLD"
        logoUrl="https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg"
      />
      <span className="flex flex-col leading-tight">
        <span className="forager-numeric text-[13px] font-semibold tabular-nums">
          {loading && !balance ? '…' : balance ?? '—'}
          <span className="ml-1 text-[11px] font-medium text-forager-text-muted">
            WLD
          </span>
        </span>
        {fiatLabel ? (
          <span className="forager-numeric text-[11px] text-forager-text-muted">
            ≈ {fiatLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
