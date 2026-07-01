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
  const previewRequestRef = useRef(0);
  const lastPreviewedKeyRef = useRef('');
  const [isQuoting, setIsQuoting] = useState(false);

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

  const selectionKey = useMemo(
    () =>
      selectedTokens
        .map((token) => `${token.address}:${token.balance}`)
        .sort()
        .join('|'),
    [selectedTokens],
  );

  const loadTokens = useCallback(async () => {
    if (!walletAddress) {
      return;
    }

    previewRequestRef.current += 1;
    setIsQuoting(false);
    setTokens([]);
    setSelected({});
    setState('loading-tokens');
    setError(null);
    setPlan(null);
    lastPreviewedKeyRef.current = '';

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

  const buildPlan = useCallback(async () => {
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
  }, [selectedTokens, walletAddress]);

  const runAutoPreview = useCallback(
    async (previewKey: string) => {
      if (!walletAddress || selectedTokens.length === 0) {
        setPlan(null);
        return;
      }

      if (lastPreviewedKeyRef.current === previewKey) {
        return;
      }

      const requestId = ++previewRequestRef.current;
      setIsQuoting(true);
      setError(null);

      try {
        const nextPlan = await buildPlan();
        if (requestId !== previewRequestRef.current) {
          return;
        }

        lastPreviewedKeyRef.current = previewKey;
        setPlan(nextPlan);
      } catch (buildError) {
        if (requestId !== previewRequestRef.current) {
          return;
        }

        lastPreviewedKeyRef.current = previewKey;
        const formatted = formatApiError(
          buildError instanceof Error
            ? buildError.message
            : 'Failed to build sweep',
        );
        setPlan(null);
        setError(formatted);
        setFailureLabel(shortErrorLabel(formatted));
      } finally {
        if (requestId === previewRequestRef.current) {
          setIsQuoting(false);
        }
      }
    },
    [buildPlan, selectedTokens.length, walletAddress],
  );

  useEffect(() => {
    if (walletAddress) {
      void loadTokens();
    }
  }, [loadTokens, walletAddress]);

  useEffect(() => {
    if (!walletAddress || selectedTokens.length === 0) {
      setPlan(null);
      lastPreviewedKeyRef.current = '';
      return;
    }

    if (state === 'loading-tokens' || state === 'pending') {
      return;
    }

    const timer = window.setTimeout(() => {
      void runAutoPreview(selectionKey);
    }, 500);

    return () => window.clearTimeout(timer);
  }, [runAutoPreview, selectionKey, walletAddress, state]);

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

        const nextError: AppError = {
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
        title: 'No swappable tokens',
        message:
          'None of the selected tokens have a verified route to WLD. Try rescannning or deselecting tokens without liquidity.',
      });
      return;
    }

    void hapticImpact('medium');
    setButtonState('pending');
    setState('pending');
    setError(null);

    try {
      setIsQuoting(true);
      const activePlan = await buildPlan();

      if (activePlan.quotes.length === 0) {
        throw new Error(
          'No selected tokens passed liquidity checks. Review skipped tokens in the preview.',
        );
      }

      setPlan(activePlan);
      setState('pending');
      setIsQuoting(false);
      lastRecordedPlanRef.current = activePlan;

      const result = await MiniKit.sendTransaction({
        chainId: WORLD_CHAIN_ID,
        transactions: activePlan.transactions,
      });

      const opHash =
        (result as { data?: { userOpHash?: string } }).data?.userOpHash ??
        (result as { userOpHash?: string }).userOpHash;

      if (!opHash) {
        throw new Error('No userOpHash returned');
      }

      lastUserOpHashRef.current = opHash;
      setUserOpHash(opHash);
    } catch (sweepError) {
      console.error('Sweep error payload:', sweepError);
      void hapticNotification('error');
      setButtonState('failed');
      setState('ready');
      setIsQuoting(false);
      const formatted = formatMiniKitError(sweepError);
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
      setTimeout(() => setButtonState(undefined), 3000);
    }
  };

  const canForage = Boolean(plan && plan.quotes.length > 0);

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <p className="forager-subtitle shrink-0 text-sm">{APP_TAGLINE}</p>

        {!isInstalled && (
          <p className="forager-card shrink-0 rounded-xl px-4 py-3 text-sm font-medium">
            Open this mini app inside World App to scan your wallet and forage
            tokens.
          </p>
        )}

        {error && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
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
          {isQuoting ? (
            <span className="forager-subtitle text-xs">Building preview...</span>
          ) : null}
        </div>

        <div className="forager-scroll min-h-0 flex-1 space-y-3 pb-2">
          <div className="space-y-1.5">
            {tokens.length === 0 && state !== 'loading-tokens' ? (
              <p className="forager-subtitle text-sm">
                No forageable tokens found. WLD, WETH, USDC, WBTC, and staked Re
                tokens are excluded.
              </p>
            ) : (
              tokens.map((token) => (
                <label
                  key={token.address}
                  className="forager-card flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[token.address])}
                    className="h-4 w-4 shrink-0 accent-forager-purple"
                    onChange={(event) => {
                      void hapticSelection();
                      lastPreviewedKeyRef.current = '';
                      setPlan(null);
                      setSelected((current) => ({
                        ...current,
                        [token.address]: event.target.checked,
                      }));
                    }}
                  />
                  <TokenIcon
                    size="sm"
                    address={token.address}
                    symbol={token.symbol}
                    logoUrl={token.logoUrl}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold leading-tight">
                      {token.symbol}
                    </p>
                    <p className="truncate text-[11px] leading-tight text-forager-text-muted">
                      {token.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-forager-purple">
                    {token.balanceFormatted}
                  </p>
                </label>
              ))
            )}
          </div>

          {plan && (
            <div className="forager-card rounded-xl p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <PixelIcon name="swap" size={18} variant="light" />
                <p className="forager-title text-sm font-semibold">Forage preview</p>
              </div>
              <p>Swapping {plan.quotes.length} verified token(s)</p>
              <p>You receive (min): {formatWld(plan.userReceivesWld)}</p>
              {plan.skippedTokens.length > 0 && (
                <p className="forager-subtitle mt-2 text-xs">
                  {plan.skippedTokens.length} token(s) skipped (no route or not
                  allowlisted)
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="forager-action-bar shrink-0 px-0 pb-1 pt-3">
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
              !canForage ||
              selectedTokens.length === 0 ||
              isConfirming ||
              state === 'loading-tokens' ||
              isQuoting ||
              state === 'pending'
            }
            size="lg"
            variant="primary"
            className="w-full"
          >
            {isQuoting
              ? 'Building preview...'
              : canForage
                ? 'Forage to WLD'
                : 'No swappable tokens selected'}
          </ForagerButton>
        </LiveFeedback>
      </div>
    </div>
  );
}
