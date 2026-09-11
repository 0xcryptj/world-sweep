'use client';

import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { ShineBorder } from '@/components/ui/shine-border';
import { apiPath } from '@/lib/base-path';
import { hapticImpact, hapticSelection } from '@/lib/haptics';
import { cn } from '@/lib/utils';
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

    try {
      const cacheKey = `forager:wld:${walletAddress.toLowerCase()}`;
      const raw = sessionStorage.getItem(cacheKey);
      if (raw) {
        const parsed = JSON.parse(raw) as { balance: string; at: number };
        if (parsed.balance != null && Date.now() - parsed.at < 30_000) {
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
      className={cn('forager-balance-chip', className)}
      aria-label="Refresh WLD balance"
    >
      <ShineBorder
        borderWidth={1}
        duration={10}
        shineColor={['#ffffff', '#a3a3a3', '#ffffff']}
      />
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
