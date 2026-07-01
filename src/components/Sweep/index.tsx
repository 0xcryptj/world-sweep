'use client';

import { formatWld } from '@/lib/sweep';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import {
  Button,
  LiveFeedback,
} from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useWaitForUserOperationReceipt } from '@worldcoin/minikit-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { RPC_URL, WORLD_CHAIN_ID } from '@/lib/constants';

type SweepState = 'idle' | 'loading-tokens' | 'ready' | 'building' | 'pending';

export function Sweep() {
  const { data: session } = useSession();
  const { isInstalled } = useMiniKit();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<BuildSweepResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SweepState>('idle');
  const [buttonState, setButtonState] = useState<
    'pending' | 'success' | 'failed' | undefined
  >(undefined);
  const [userOpHash, setUserOpHash] = useState('');

  const walletAddress =
    session?.user?.walletAddress ?? MiniKit.user?.walletAddress ?? '';

  const client = useMemo(
    () =>
      createPublicClient({
        chain: worldchain,
        transport: http(RPC_URL),
      }),
    [],
  );

  const { isLoading: isConfirming, isSuccess, isError } =
    useWaitForUserOperationReceipt({
      client,
      userOpHash,
    });

  const selectedTokens = useMemo(
    () => tokens.filter((token) => selected[token.address]),
    [selected, tokens],
  );

  const loadTokens = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    setState('loading-tokens');
    setError(null);
    setPlan(null);

    try {
      const response = await fetch(
        `/api/tokens?address=${encodeURIComponent(walletAddress)}`,
      );
      const payload = (await response.json()) as {
        tokens?: WalletToken[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load wallet tokens');
      }

      const nextTokens = payload.tokens ?? [];
      setTokens(nextTokens);
      setSelected(
        Object.fromEntries(nextTokens.map((token) => [token.address, true])),
      );
      setState('ready');
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load wallet tokens',
      );
      setState('idle');
    }
  }, [walletAddress]);

  useEffect(() => {
    if (walletAddress) {
      void loadTokens();
    }
  }, [loadTokens, walletAddress]);

  useEffect(() => {
    if (isSuccess) {
      setButtonState('success');
      setUserOpHash('');
      setState('ready');
      setPlan(null);
      void loadTokens();
      setTimeout(() => setButtonState(undefined), 3000);
    }

    if (isError) {
      setButtonState('failed');
      setUserOpHash('');
      setState('ready');
      setTimeout(() => setButtonState(undefined), 3000);
    }
  }, [isError, isSuccess, loadTokens]);

  const onBuildPlan = async () => {
    if (!walletAddress || selectedTokens.length === 0) {
      return;
    }

    setState('building');
    setError(null);

    try {
      const response = await fetch('/api/build-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          tokens: selectedTokens,
        }),
      });

      const payload = (await response.json()) as BuildSweepResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to build sweep');
      }

      setPlan(payload);
      setState('ready');
    } catch (buildError) {
      setError(
        buildError instanceof Error
          ? buildError.message
          : 'Failed to build sweep',
      );
      setState('ready');
    }
  };

  const onSweep = async () => {
    if (!isInstalled) {
      setError('Open this app inside World App to execute the sweep.');
      return;
    }

    if (!walletAddress || selectedTokens.length === 0) {
      return;
    }

    setButtonState('pending');
    setState('pending');
    setError(null);

    try {
      let activePlan = plan;

      if (!activePlan) {
        setState('building');
        const response = await fetch('/api/build-sweep', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            walletAddress,
            tokens: selectedTokens,
          }),
        });

        const payload = (await response.json()) as BuildSweepResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to build sweep');
        }

        activePlan = payload;
        setPlan(payload);
      }

      const result = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: activePlan.transactions,
      });

      if (!result.data.userOpHash) {
        throw new Error('No userOpHash returned');
      }

      setUserOpHash(result.data.userOpHash);
    } catch (sweepError) {
      console.error(sweepError);
      setButtonState('failed');
      setState('ready');
      setError(
        sweepError instanceof Error
          ? sweepError.message
          : 'Sweep transaction failed',
      );
      setTimeout(() => setButtonState(undefined), 3000);
    }
  };

  return (
    <div className="flex w-full flex-col gap-4">
      <p className="text-sm text-neutral-500">
        Sell junk mini-app tokens from your wallet in one batched transaction
        and receive native WLD. A 5% platform fee applies to the WLD you receive.
      </p>

      {!isInstalled && (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Open this mini app inside World App to scan your wallet and sweep
          tokens.
        </p>
      )}

      {error && (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <Button
          onClick={() => void loadTokens()}
          disabled={!walletAddress || state === 'loading-tokens'}
          variant="tertiary"
          size="sm"
        >
          {state === 'loading-tokens' ? 'Scanning...' : 'Rescan Wallet'}
        </Button>
        <Button
          onClick={() => void onBuildPlan()}
          disabled={selectedTokens.length === 0 || state === 'building'}
          variant="secondary"
          size="sm"
        >
          {state === 'building' ? 'Quoting...' : 'Preview Sweep'}
        </Button>
      </div>

      <div className="flex flex-col gap-2">
        {tokens.length === 0 && state !== 'loading-tokens' ? (
          <p className="text-sm text-neutral-500">
            No sweepable tokens found. WLD, WETH, USDC, and WBTC are excluded.
          </p>
        ) : (
          tokens.map((token) => (
            <label
              key={token.address}
              className="flex items-center justify-between rounded-xl border border-neutral-200 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(selected[token.address])}
                  onChange={(event) =>
                    setSelected((current) => ({
                      ...current,
                      [token.address]: event.target.checked,
                    }))
                  }
                />
                <div>
                  <p className="font-medium">{token.symbol}</p>
                  <p className="text-xs text-neutral-500">{token.name}</p>
                </div>
              </div>
              <p className="text-sm font-semibold">{token.balanceFormatted}</p>
            </label>
          ))
        )}
      </div>

      {plan && (
        <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <p className="font-semibold">Sweep preview</p>
          <p>Swapping {plan.quotes.length} token(s)</p>
          <p>Estimated WLD (min): {formatWld(plan.estimatedWldTotal)}</p>
          <p>Platform fee (5%): {formatWld(plan.platformFeeWld)}</p>
          <p>You receive (min): {formatWld(plan.userReceivesWld)}</p>
          {plan.skippedTokens.length > 0 && (
            <p className="mt-2 text-neutral-600">
              Skipped {plan.skippedTokens.length} token(s) without liquidity.
            </p>
          )}
        </div>
      )}

      <LiveFeedback
        label={{
          failed: 'Sweep failed',
          pending: 'Sweep pending',
          success: 'Sweep successful',
        }}
        state={buttonState}
        className="w-full"
      >
        <Button
          onClick={() => void onSweep()}
          disabled={
            selectedTokens.length === 0 ||
            isConfirming ||
            state === 'loading-tokens' ||
            state === 'building'
          }
          size="lg"
          variant="primary"
          className="w-full"
        >
          {plan ? 'Sweep to WLD' : 'Build & Sweep to WLD'}
        </Button>
      </LiveFeedback>
    </div>
  );
}
