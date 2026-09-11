'use client';

import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { hapticImpact, hapticSelection } from '@/lib/haptics';
import { cn } from '@/lib/utils';
import { useLocalFiat, wldAmountToFiat } from '@/lib/use-wld-price';
import {
  fetchWldBalanceClient,
  isWldClientCacheFresh,
  readWldClientCache,
} from '@/lib/wld-client-cache';
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

  const loadBalance = useCallback(
    async (force = false) => {
      if (!walletAddress) {
        setLoading(false);
        return;
      }

      const cached = readWldClientCache(walletAddress);
      if (cached) {
        setBalance(cached.balance);
        setLoading(false);
        if (!force && isWldClientCacheFresh(cached.ageMs)) {
          return;
        }
      } else if (!force) {
        setLoading(true);
      }

      const next = await fetchWldBalanceClient(walletAddress, { force });
      if (next != null) {
        setBalance(next);
      }
      setLoading(false);
    },
    [walletAddress],
  );

  useEffect(() => {
    void loadBalance(false);
  }, [loadBalance]);

  useWalletRefreshListener(
    (detail) => {
      const force =
        Boolean(detail.force) ||
        detail.reason === 'forage' ||
        detail.reason === 'manual' ||
        detail.reason === 'connect';
      void loadBalance(force);
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
        void loadBalance(true);
      }}
      className={cn('forager-balance-chip', className)}
      aria-label="Refresh WLD balance"
    >
      <TokenIcon
        size="xs"
        address="0x2cFc85d8E48F8EAB294be644d9E25C3030863003"
        symbol="WLD"
        logoUrl="https://assets.coingecko.com/coins/images/31069/small/worldcoin.jpeg"
        className="rounded-full border-white/15 shadow-none"
      />
      <span className="flex min-w-0 items-baseline gap-1 leading-none">
        <span className="forager-numeric text-[15px] font-semibold tabular-nums">
          {loading && !balance ? '…' : balance ?? '—'}
        </span>
        <span className="text-[11px] font-medium tracking-wide text-forager-text-muted">
          WLD
        </span>
        {fiatLabel ? (
          <span className="forager-numeric hidden text-[11px] text-forager-text-faint min-[380px]:inline">
            · {fiatLabel}
          </span>
        ) : null}
      </span>
    </button>
  );
}
