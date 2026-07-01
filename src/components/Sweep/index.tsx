'use client';

import { ErrorBanner } from '@/components/Sweep/ErrorBanner';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { PixelIcon } from '@/components/PixelIcon';
import { ForagerButton } from '@/components/ForagerButton';
import {
  formatApiError,
  formatMiniKitError,
  shortErrorLabel,
  type AppError,
} from '@/lib/errors';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { APP_TAGLINE } from '@/lib/branding';
import { formatWld } from '@/lib/sweep';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import { LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useWaitForUserOperationReceipt } from '@worldcoin/minikit-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  const [error, setError] = useState<AppError | null>(null);
  const [state, setState] = useState<SweepState>('idle');
  const [buttonState, setButtonState] = useState<
    'pending' | 'success' | 'failed' | undefined
  >(undefined);
  const [failureLabel, setFailureLabel] = useState('Forage failed');
  const [userOpHash, setUserOpHash] = useState('');
  const lastRecordedPlanRef = useRef<BuildSweepResponse | null>(null);
  const lastUserOpHashRef = useRef('');

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
      const formatted = formatApiError(
        loadError instanceof Error
          ? loadError.message
          : 'Failed to load wallet tokens',
      );
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
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
      void (async () => {
        void hapticNotification('success');
        setButtonState('success');

        const completedPlan = lastRecordedPlanRef.current;
        const completedUserOpHash = lastUserOpHashRef.current;

        if (completedPlan && walletAddress) {
          try {
            await fetch('/api/forage-events', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                walletAddress,
                wldReceivedWei: completedPlan.userReceivesWld,
                tokensSwapped: completedPlan.quotes.length,
                userOpHash: completedUserOpHash || undefined,
              }),
            });
          } catch (recordError) {
            console.error('Failed to record forage event', recordError);
          }
        }

        setFailureLabel('Forage failed');
        setUserOpHash('');
        lastRecordedPlanRef.current = null;
        lastUserOpHashRef.current = '';
        setState('ready');
        setPlan(null);
        void loadTokens();
        setTimeout(() => setButtonState(undefined), 3000);
      })();
    }

    if (isError && userOpHash) {
      void (async () => {
        void hapticNotification('error');
        setButtonState('failed');

        let nextError: AppError = {
          title: 'On-chain failure',
          message:
            'World App submitted the forage, but the batch did not complete successfully.',
          details: `User operation: ${userOpHash}`,
        };

        try {
          const response = await fetch(
            `/api/userop?hash=${encodeURIComponent(userOpHash)}`,
          );
          const payload = (await response.json()) as {
            status?: string;
            transaction_hash?: string | null;
            error?: string;
          };

          if (payload.transaction_hash) {
            nextError.details = `Tx: ${payload.transaction_hash}`;
          } else if (payload.error) {
            nextError.details = payload.error;
          }
        } catch {
          // Keep the default on-chain failure copy.
        }

        setError(nextError);
        setFailureLabel(shortErrorLabel(nextError));
        setUserOpHash('');
        setState('ready');
        setTimeout(() => setButtonState(undefined), 3000);
      })();
    }
  }, [isError, isSuccess, loadTokens, userOpHash, walletAddress]);

  const buildPlan = async () => {
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

    return payload;
  };

  const onBuildPlan = async () => {
    if (!walletAddress || selectedTokens.length === 0) {
      return;
    }

    void hapticImpact('light');
    setState('building');
    setError(null);

    try {
      const nextPlan = await buildPlan();
      setPlan(nextPlan);
      if (nextPlan.skippedTokens.length > 0) {
        setSelected((current) => {
          const next = { ...current };
          for (const skipped of nextPlan.skippedTokens) {
            next[skipped.address] = false;
          }
          return next;
        });
      }
      setState('ready');
      void hapticNotification('success');
    } catch (buildError) {
      const formatted = formatApiError(
        buildError instanceof Error
          ? buildError.message
          : 'Failed to build sweep',
      );
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
      setState('ready');
    }
  };

  const onSweep = async () => {
    if (!isInstalled) {
      setError({
        title: 'Open in World App',
        message:
          'Foraging requires World App so MiniKit can sign and send the batched transaction.',
      });
      return;
    }

    if (!walletAddress || selectedTokens.length === 0) {
      return;
    }

    if (!plan || plan.quotes.length === 0) {
      setError({
        title: 'Preview required',
        message:
          'Tap Preview Forage first. Only tokens with verified liquidity and a simulated swap route are included.',
      });
      return;
    }

    void hapticImpact('medium');
    setButtonState('pending');
    setState('pending');
    setError(null);

    try {
      setState('building');
      const activePlan = await buildPlan();

      if (activePlan.quotes.length === 0) {
        throw new Error(
          'No selected tokens passed liquidity checks. Review skipped tokens in the preview.',
        );
      }

      setPlan(activePlan);
      setState('pending');
      lastRecordedPlanRef.current = activePlan;

      const result = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: activePlan.transactions,
      });

      if (!result.data?.userOpHash) {
        throw new Error('No userOpHash returned');
      }

      lastUserOpHashRef.current = result.data.userOpHash;
      setUserOpHash(result.data.userOpHash);
    } catch (sweepError) {
      console.error('Sweep error payload:', sweepError);
      void hapticNotification('error');
      setButtonState('failed');
      setState('ready');
      const formatted = formatMiniKitError(sweepError);
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
      setTimeout(() => setButtonState(undefined), 3000);
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4 overflow-x-hidden">
      <p className="forager-subtitle text-sm">{APP_TAGLINE}</p>

      {!isInstalled && (
        <p className="forager-card rounded-xl px-4 py-3 text-sm font-medium">
          Open this mini app inside World App to scan your wallet and forage
          tokens.
        </p>
      )}

      {error && (
        <ErrorBanner error={error} onDismiss={() => setError(null)} />
      )}

      <div className="flex flex-wrap gap-2">
        <ForagerButton
          onClick={() => {
            void hapticImpact('light');
            void loadTokens();
          }}
          disabled={!walletAddress || state === 'loading-tokens'}
          variant="ghost"
          size="sm"
        >
          {state === 'loading-tokens' ? 'Scanning...' : 'Rescan Wallet'}
        </ForagerButton>
        <ForagerButton
          onClick={() => void onBuildPlan()}
          disabled={selectedTokens.length === 0 || state === 'building'}
          variant="secondary"
          size="sm"
        >
          {state === 'building' ? 'Quoting...' : 'Preview Forage'}
        </ForagerButton>
      </div>

      <div className="forager-scroll flex max-h-[50dvh] min-w-0 flex-col gap-2">
        {tokens.length === 0 && state !== 'loading-tokens' ? (
          <p className="forager-subtitle text-sm">
            No forageable tokens found. WLD, WETH, USDC, WBTC, and staked Re
            tokens are excluded.
          </p>
        ) : (
          tokens.map((token) => (
            <label
              key={token.address}
              className="forager-card flex min-w-0 items-center justify-between gap-2 rounded-xl px-4 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(selected[token.address])}
                  onChange={(event) => {
                    void hapticSelection();
                    setPlan(null);
                    setSelected((current) => ({
                      ...current,
                      [token.address]: event.target.checked,
                    }));
                  }}
                />
                <TokenIcon
                  address={token.address}
                  symbol={token.symbol}
                  logoUrl={token.logoUrl}
                />
                <div className="min-w-0">
                  <p className="truncate font-bold">{token.symbol}</p>
                  <p className="truncate text-xs opacity-80">{token.name}</p>
                </div>
              </div>
              <p className="shrink-0 text-sm font-bold">{token.balanceFormatted}</p>
            </label>
          ))
        )}
      </div>

      {plan && (
        <div className="forager-card rounded-xl p-4 text-sm">
          <div className="mb-2 flex items-center gap-2">
            <PixelIcon name="swap" size={20} variant="light" />
            <p className="forager-title font-semibold">Forage preview</p>
          </div>
          <p>Swapping {plan.quotes.length} verified token(s)</p>
          <p>Estimated WLD (min): {formatWld(plan.estimatedWldTotal)}</p>
          <p>Platform fee (5%): {formatWld(plan.platformFeeWld)}</p>
          <p>You receive (min): {formatWld(plan.userReceivesWld)}</p>
          <ul className="mt-3 space-y-1">
            {plan.quotes.map((quote) => (
              <li key={quote.tokenAddress} className="forager-subtitle">
                {quote.symbol}: {quote.routeLabel}
              </li>
            ))}
          </ul>
          {plan.skippedTokens.length > 0 && (
            <div className="mt-3 border-t border-forager-border pt-3 forager-subtitle">
              <p className="font-medium">Skipped tokens</p>
              <ul className="mt-1 space-y-1">
                {plan.skippedTokens.map((token) => (
                  <li key={token.address}>
                    {token.symbol}: {token.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <LiveFeedback
        label={{
          failed: failureLabel,
          pending: isConfirming ? 'Confirming...' : 'Forage pending',
          success: 'Forage successful',
        }}
        state={buttonState}
        className="w-full"
      >
        <ForagerButton
          onClick={() => void onSweep()}
          disabled={
            !plan ||
            plan.quotes.length === 0 ||
            selectedTokens.length === 0 ||
            isConfirming ||
            state === 'loading-tokens' ||
            state === 'building' ||
            state === 'pending'
          }
          size="lg"
          variant="primary"
          className="w-full"
        >
          {plan ? 'Forage to WLD' : 'Preview required before foraging'}
        </ForagerButton>
      </LiveFeedback>
    </div>
  );
}
