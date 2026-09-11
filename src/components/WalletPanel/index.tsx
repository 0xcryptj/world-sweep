'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { SectionHeader } from '@/components/SectionHeader';
import { TokenBadge } from '@/components/TokenBadge';
import { ShineBorder } from '@/components/ui/shine-border';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { apiPath } from '@/lib/base-path';
import { shortenAddress } from '@/lib/forage-stats-types';
import { FetchTimeoutError, fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { WLD_ADDRESS } from '@/lib/constants';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import {
  useLocalFiat,
  wldAmountToFiat,
  wldWeiToUsd,
} from '@/lib/use-wld-price';
import {
  requestWalletRefresh,
  useWalletRefreshListener,
} from '@/lib/wallet-refresh';
import type { WalletToken } from '@/lib/types';
import { MiniKit } from '@worldcoin/minikit-js';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type WalletResponse = {
  tokens: WalletToken[];
  forageableAddresses?: string[];
  pendingAllowlistAddresses?: string[];
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
  const [copied, setCopied] = useState(false);
  const hasDataRef = useRef(false);

  const walletAddress =
    session?.user?.walletAddress ?? MiniKit.user?.walletAddress ?? '';

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

  const pendingAllowlistSet = useMemo(
    () =>
      new Set(
        (data?.pendingAllowlistAddresses ?? []).map((address) =>
          address.toLowerCase(),
        ),
      ),
    [data?.pendingAllowlistAddresses],
  );

  const forageableTokens = useMemo(
    () =>
      data?.tokens.filter((token) =>
        forageableAddressSet.has(token.address.toLowerCase()),
      ) ?? [],
    [data?.tokens, forageableAddressSet],
  );

  const copyAddress = async () => {
    if (!walletAddress) {
      return;
    }

    void hapticSelection();
    try {
      await navigator.clipboard.writeText(walletAddress);
      void hapticNotification('success');
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      void hapticNotification('error');
    }
  };

  if (!walletAddress) {
    return (
      <p className="forager-subtitle text-sm">
        Sign in with World App to view balances.
      </p>
    );
  }

  if (loading && !data) {
    return (
      <div className="forager-section">
        <div className="forager-skeleton-block h-28 rounded-[10px]" />
        <p className="forager-subtitle text-[15px]">Loading wallet...</p>
      </div>
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
        <button
          type="button"
          onClick={() => void copyAddress()}
          className="mt-4 flex w-full items-center justify-between gap-3 rounded-full border border-white/10 bg-white/5 px-4 py-3 text-left text-[15px]"
        >
          <span className="truncate forager-numeric text-forager-text-muted">
            {shortenAddress(walletAddress)}
          </span>
          <span className="shrink-0 font-medium text-forager-accent">
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
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

        <div className="forager-group">
          {loading && data.tokens.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-forager-text-muted">
              Loading token list…
            </p>
          ) : data.tokens.length === 0 ? (
            <p className="px-4 py-4 text-[15px] text-forager-text-muted">
              No token balances found.
            </p>
          ) : (
            data.tokens.map((token) => (
              <TokenRow
                key={token.address}
                token={token}
                forageable={forageableAddressSet.has(token.address.toLowerCase())}
                pendingAllowlist={pendingAllowlistSet.has(
                  token.address.toLowerCase(),
                )}
                fiatPrice={fiat.price}
                formatFiat={fiat.format}
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

function TokenRow({
  token,
  forageable,
  pendingAllowlist,
  fiatPrice,
  formatFiat,
}: {
  token: WalletToken;
  forageable: boolean;
  pendingAllowlist: boolean;
  fiatPrice: number | null;
  formatFiat: (value: number) => string;
}) {
  const isWld = token.address.toLowerCase() === WLD_ADDRESS.toLowerCase();

  const fiatHint = useMemo(() => {
    if (fiatPrice === null) {
      return null;
    }
    if (isWld) {
      return formatFiat(wldAmountToFiat(token.balanceFormatted, fiatPrice));
    }
    if (token.cachedRoute?.amountOut) {
      return formatFiat(wldWeiToUsd(token.cachedRoute.amountOut, fiatPrice));
    }
    return null;
  }, [fiatPrice, formatFiat, isWld, token.balanceFormatted, token.cachedRoute]);

  return (
    <div
      className="forager-group-row flex items-center gap-3 px-4 py-3.5"
      onTouchStart={() => {
        void hapticSelection();
      }}
    >
      <TokenIcon
        size="sm"
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-[17px] font-semibold">{token.symbol}</p>
          {isWld ? (
            <TokenBadge label="Native" tone="native" />
          ) : forageable ? (
            <TokenBadge label="Verified" tone="verified" icon />
          ) : pendingAllowlist ? (
            <TokenBadge label="Verified" tone="pending" icon />
          ) : (
            <TokenBadge label="No route" tone="muted" />
          )}
        </div>
        <p className="truncate text-[13px] text-forager-text-muted">{token.name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="forager-numeric text-[17px]">{token.balanceFormatted}</p>
        {fiatHint ? (
          <p className="forager-numeric text-[13px] text-forager-text-muted">
            ≈ {fiatHint}
          </p>
        ) : null}
      </div>
    </div>
  );
}
