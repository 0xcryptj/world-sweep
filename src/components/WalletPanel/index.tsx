'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { shortenAddress } from '@/lib/forage-stats-types';
import { isForageableToken } from '@/lib/token-filters';
import { WLD_ADDRESS } from '@/lib/constants';
import { hapticImpact, hapticNotification } from '@/lib/haptics';
import type { WalletToken } from '@/lib/types';
import { MiniKit } from '@worldcoin/minikit-js';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type WalletResponse = {
  tokens: WalletToken[];
  wldBalance: string;
  wldSymbol: string;
  tokenCount: number;
  forageableCount: number;
};

export function WalletPanel() {
  const router = useRouter();
  const { data: session } = useSession();
  const [data, setData] = useState<WalletResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const walletAddress =
    session?.user?.walletAddress ?? MiniKit.user?.walletAddress ?? '';

  const loadWallet = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/wallet?address=${encodeURIComponent(walletAddress)}`,
      );
      const payload = (await response.json()) as WalletResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load wallet');
      }

      setData(payload);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load wallet',
      );
    } finally {
      setLoading(false);
    }
  }, [walletAddress]);

  useEffect(() => {
    void loadWallet();
  }, [loadWallet]);

  const forageableTokens = useMemo(
    () => data?.tokens.filter(isForageableToken) ?? [],
    [data?.tokens],
  );

  const copyAddress = async () => {
    if (!walletAddress) {
      return;
    }

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
        Connect your wallet in World App to view balances.
      </p>
    );
  }

  if (loading) {
    return <p className="forager-subtitle text-sm">Loading wallet...</p>;
  }

  if (error || !data) {
    return (
      <div className="flex flex-col gap-3">
        <p className="forager-subtitle text-sm">
          {error ?? 'Wallet unavailable right now.'}
        </p>
        <ForagerButton variant="secondary" size="sm" onClick={() => void loadWallet()}>
          Retry
        </ForagerButton>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="forager-card rounded-2xl p-4">
        <p className="forager-subtitle text-xs uppercase tracking-wide">
          WLD balance
        </p>
        <p className="mt-1 text-3xl font-bold text-forager-purple">
          {data.wldBalance}
          <span className="ml-2 text-lg text-foreground">{data.wldSymbol}</span>
        </p>
        <button
          type="button"
          onClick={() => void copyAddress()}
          className="forager-subtitle mt-3 flex w-full items-center justify-between gap-2 rounded-xl bg-forager-bg-elevated px-3 py-2 text-left text-xs"
        >
          <span className="truncate font-mono">{shortenAddress(walletAddress)}</span>
          <span className="shrink-0 text-forager-purple">
            {copied ? 'Copied' : 'Copy'}
          </span>
        </button>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="forager-title text-sm font-semibold">Holdings</p>
          <p className="forager-subtitle text-xs">
            {data.tokenCount} token{data.tokenCount === 1 ? '' : 's'} on World
            Chain
          </p>
        </div>
        <ForagerButton
          variant="ghost"
          size="sm"
          onClick={() => {
            void hapticImpact('light');
            void loadWallet();
          }}
        >
          Refresh
        </ForagerButton>
      </div>

      <div className="forager-scroll max-h-[48dvh] space-y-1.5">
        {data.tokens.length === 0 ? (
          <p className="forager-subtitle text-sm">No token balances found.</p>
        ) : (
          data.tokens.map((token) => (
            <TokenRow key={token.address} token={token} />
          ))
        )}
      </div>

      {data.forageableCount > 0 ? (
        <div className="forager-card rounded-2xl p-4">
          <p className="text-sm font-semibold">
            {data.forageableCount} forageable token
            {data.forageableCount === 1 ? '' : 's'}
          </p>
          <p className="forager-subtitle mt-1 text-xs">
            Swap junk tokens into WLD from the Home tab.
          </p>
          <ForagerButton
            variant="primary"
            size="md"
            className="mt-3 w-full"
            onClick={() => {
              void hapticImpact('light');
              router.push('/home');
            }}
          >
            Forage on Home
          </ForagerButton>
        </div>
      ) : null}

      {forageableTokens.length === 0 && data.tokenCount > 0 ? (
        <p className="forager-subtitle text-center text-xs">
          No junk tokens to forage right now.
        </p>
      ) : null}
    </div>
  );
}

function TokenRow({ token }: { token: WalletToken }) {
  const isWld = token.address.toLowerCase() === WLD_ADDRESS.toLowerCase();
  const forageable = isForageableToken(token);

  return (
    <div className="forager-card flex items-center gap-2.5 rounded-2xl px-3 py-2">
      <TokenIcon
        size="sm"
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold">{token.symbol}</p>
          {isWld ? (
            <span className="rounded-full bg-forager-purple/20 px-2 py-0.5 text-[10px] font-medium text-forager-purple">
              Native
            </span>
          ) : forageable ? (
            <span className="rounded-full bg-forager-bg-elevated px-2 py-0.5 text-[10px] text-forager-text-muted">
              Forageable
            </span>
          ) : null}
        </div>
        <p className="truncate text-[11px] text-forager-text-muted">{token.name}</p>
      </div>
      <p className="shrink-0 text-xs font-semibold tabular-nums">
        {token.balanceFormatted}
      </p>
    </div>
  );
}
