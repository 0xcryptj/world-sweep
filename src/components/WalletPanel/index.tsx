'use client';

import { WalletActions } from '@/components/WalletActions';
import { ForagerButton } from '@/components/ForagerButton';
import { SectionHeader } from '@/components/SectionHeader';
import { ShineBorder } from '@/components/ui/shine-border';
import { TokenListRow } from '@/components/TokenListRow';
import { apiPath } from '@/lib/base-path';
import { FetchTimeoutError, fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { hapticImpact, hapticNotification } from '@/lib/haptics';
import { useLocalFiat, wldAmountToFiat } from '@/lib/use-wld-price';
import {
  requestWalletRefresh,
  useWalletRefreshListener,
} from '@/lib/wallet-refresh';
import { writeWldClientCache } from '@/lib/wld-client-cache';
import type { WalletToken } from '@/lib/types';
import { MiniKit } from '@worldcoin/minikit-js';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type WalletResponse = {
  tokens: WalletToken[];
  forageableAddresses?: string[];
  wldBalance: string;
  wldSymbol: string;
  tokenCount: number;
  forageableCount: number;
};

export function WalletPanel() {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session } = useSession();
  const fiat = useLocalFiat();
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasDataRef = useRef(false);

  const walletAddress =
    session?.user?.walletAddress ?? MiniKit.user?.walletAddress ?? '';
  const username = session?.user?.username ?? MiniKit.user?.username ?? '';

  useEffect(() => {
    hasDataRef.current = Boolean(data);
  }, [data]);

  const wldFiatLabel = useMemo(() => {
    if (!data || fiat.price === null || loadingBalance) {
      return null;
    }
    return fiat.format(wldAmountToFiat(data.wldBalance, fiat.price));
  }, [data, fiat, loadingBalance]);

  const loadWallet = useCallback(
    async (forceRefresh = false) => {
      if (!walletAddress) {
        return;
      }

      setLoading(true);
      setError(null);
      // WLD comes from /wallet — do not also hit /balance (duplicate Alchemy).

      try {
        const query = new URLSearchParams({ address: walletAddress });
        if (forceRefresh) {
          query.set('refresh', '1');
        }

        const response = await fetchWithTimeout(
          apiPath(`/wallet?${query.toString()}`),
          { cache: 'no-store' },
          55_000,
        );
        const payload = (await response.json()) as WalletResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load wallet');
        }

        setData(payload);
        setLoadingBalance(false);
        writeWldClientCache(walletAddress, payload.wldBalance);
      } catch (loadError) {
        const message =
          loadError instanceof FetchTimeoutError
            ? loadError.message
            : loadError instanceof Error && loadError.message
              ? loadError.message
              : "Couldn't load your balances. Tap retry.";
        if (!hasDataRef.current) {
          void hapticNotification('error');
        }
        setError(message);
      } finally {
        setLoading(false);
        setLoadingBalance(false);
      }
    },
    [walletAddress],
  );

  useEffect(() => {
    // Soft load: use server holdings/WLD TTL caches. Force only on Rescan / forage.
    void loadWallet(false);
  }, [loadWallet]);

  useWalletRefreshListener(
    (detail) => {
      const force = Boolean(detail.force) || detail.reason === 'forage';
      void loadWallet(force);
    },
    { minIntervalMs: 2_000 },
  );

  // Refresh when navigating back to the wallet tab.
  useEffect(() => {
    if (pathname?.includes('/wallet') && walletAddress) {
      requestWalletRefresh({ reason: 'nav' });
    }
  }, [pathname, walletAddress]);

  const forageableAddressSet = useMemo(
    () =>
      new Set(
        (data?.forageableAddresses ?? []).map((address) =>
          address.toLowerCase(),
        ),
      ),
    [data?.forageableAddresses],
  );

  const forageableTokens = useMemo(
    () =>
      data?.tokens.filter((token) =>
        forageableAddressSet.has(token.address.toLowerCase()),
      ) ?? [],
    [data?.tokens, forageableAddressSet],
  );

  if (!walletAddress) {
    return (
      <p className="forager-subtitle text-sm">
        Sign in with World App to view balances.
      </p>
    );
  }

  if (loading && !data) {
    return (
      <p className="forager-subtitle py-8 text-[15px]">Loading wallet...</p>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[10px] bg-forager-surface p-4">
        <div className="space-y-3">
          <p className="forager-title text-[17px]">
            Couldn&apos;t load balances
          </p>
          <p className="forager-subtitle text-[15px]">{error}</p>
        </div>
        <ForagerButton
          variant="secondary"
          size="sm"
          onClick={() => {
            void hapticImpact('medium');
            void loadWallet(true);
          }}
        >
          Tap to retry
        </ForagerButton>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  return (
    <div className="forager-page-stack">
      <div className="forager-group relative overflow-hidden px-4 py-5">
        <ShineBorder
          borderWidth={1}
          duration={12}
          shineColor={['transparent', '#ffffff', 'transparent']}
        />
        <p className="forager-section-title">WLD balance</p>
        <p className="forager-numeric mt-2 text-[34px] font-bold tracking-[0.37px]">
          {loadingBalance && !data.wldBalance ? '…' : data.wldBalance}
        </p>
        <p className="mt-1 text-[15px] text-forager-text-muted">
          {data.wldSymbol}
          {wldFiatLabel ? ` · ${wldFiatLabel}` : ''}
        </p>
        {username ? (
          <p className="mt-1 text-[13px] text-forager-text-muted">{username}</p>
        ) : null}
        <WalletActions
          walletAddress={walletAddress}
          wldBalance={data.wldBalance}
          tokens={data.tokens}
          forageableTokens={forageableTokens}
        />
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-4 px-1">
          <p className="text-[15px] text-forager-text-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              void hapticImpact('light');
              void loadWallet(true);
            }}
            className="forager-text-action"
          >
            Retry
          </button>
        </div>
      ) : null}

      <div className="forager-section">
        <SectionHeader
          title="Holdings"
          action={
            <button
              type="button"
              onClick={() => {
                void hapticImpact('light');
                requestWalletRefresh({ reason: 'manual', force: true });
                void loadWallet(true);
              }}
              className="forager-text-action"
            >
              {loading ? 'Refreshing' : 'Refresh'}
            </button>
          }
        />

        <div className="forager-group forager-wallet-list">
          {loading && data.tokens.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-forager-text-muted">
              Loading token list…
            </p>
          ) : data.tokens.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-forager-text-muted">
              No verified token balances found.
            </p>
          ) : (
            data.tokens.map((token) => (
              <TokenListRow
                key={token.address}
                token={token}
                disabled
                verified
              />
            ))
          )}
        </div>
      </div>

      {data.forageableCount > 0 ? (
        <div className="forager-group px-4 py-4">
          <p className="text-[17px] font-semibold">
            {data.forageableCount} forageable token
            {data.forageableCount === 1 ? '' : 's'}
          </p>
          <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
            Swap leftover tokens into WLD from Home.
          </p>
          <ForagerButton
            variant="primary"
            size="md"
            className="mt-4 w-full"
            onClick={() => {
              void hapticImpact('medium');
              router.push('/home');
            }}
          >
            Forage on Home
          </ForagerButton>
        </div>
      ) : null}

      {forageableTokens.length === 0 && data.tokenCount > 0 ? (
        <p className="text-center text-[13px] text-forager-text-muted">
          No leftover tokens ready to forage right now.
        </p>
      ) : null}
    </div>
  );
}
