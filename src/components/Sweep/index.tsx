'use client';

import { ErrorBanner } from '@/components/Sweep/ErrorBanner';
import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { AppActivity, TokenListSkeleton } from '@/components/AppActivity';
import { PixelIcon } from '@/components/PixelIcon';
import { AppButton } from '@/components/AppButton';
import {
  formatApiError,
  formatMiniKitError,
  isSimulationFailedError,
  isUserRejectedError,
  shortErrorLabel,
  type AppError,
} from '@/lib/errors';
import { sendMiniKitTransaction } from '@/lib/minikit-transaction';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { APP_TAGLINE } from '@/lib/branding';
import { formatWld } from '@/lib/sweep';
import { isForageableToken } from '@/lib/token-filters';
import type { ScanExclusionReason } from '@/lib/forage-scan';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import { LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useWaitForUserOperationReceipt } from '@worldcoin/minikit-react';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPublicClient, http } from 'viem';
import { worldchain } from 'viem/chains';
import { RPC_URL, WORLD_CHAIN_ID, MAX_TOKENS_PER_SWEEP } from '@/lib/constants';

type SweepState = 'idle' | 'loading-tokens' | 'ready' | 'building' | 'pending';

type SubmitPhase = 'idle' | 'building' | 'simulating' | 'confirming';

type ExcludedToken = {
  address: string;
  symbol: string;
  name: string;
  balanceFormatted: string;
  logoUrl?: string | null;
  reason: ScanExclusionReason;
  reasonLabel: string;
};

const SCAN_ACTIVITY_MESSAGES = [
  'Reading your wallet balances...',
  'Checking Uniswap liquidity...',
  'Filtering junk and staked tokens...',
  'Almost done...',
];

const BUILD_ACTIVITY_MESSAGES = [
  'Preparing your swap batch...',
  'Encoding Permit2 approvals...',
  'Calculating minimum WLD output...',
];

const SIMULATE_ACTIVITY_MESSAGES = [
  'World App is simulating your transaction...',
  'This can take up to a minute — hang tight.',
  'Keep World App open while the request loads.',
];

export function Sweep() {
  const { data: session } = useSession();
  const { isInstalled } = useMiniKit();
  const [tokens, setTokens] = useState<WalletToken[]>([]);
  const [excludedTokens, setExcludedTokens] = useState<ExcludedToken[]>([]);
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
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const [txActivityMessages, setTxActivityMessages] = useState(
    SIMULATE_ACTIVITY_MESSAGES,
  );

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
    () => tokens.filter((token) => selected[token.address] && isForageableToken(token)),
    [selected, tokens],
  );

  const excludedStaked = useMemo(
    () => excludedTokens.filter((token) => token.reason === 'staked_re'),
    [excludedTokens],
  );

  const excludedIlliquid = useMemo(
    () =>
      excludedTokens.filter((token) =>
        ['no_liquidity', 'not_allowlisted', 'output_too_small'].includes(
          token.reason,
        ),
      ),
    [excludedTokens],
  );

  const selectionKey = useMemo(
    () =>
      selectedTokens
        .map((token) => `${token.address}:${token.balance}`)
        .sort()
        .join('|'),
    [selectedTokens],
  );

  const activityOverlay = useMemo(() => {
    if (state === 'loading-tokens') {
      return {
        title: 'Scanning wallet',
        messages: SCAN_ACTIVITY_MESSAGES,
        icon: 'coin' as const,
      };
    }

    if (submitPhase === 'building') {
      return {
        title: 'Preparing forage',
        messages: BUILD_ACTIVITY_MESSAGES,
        icon: 'swap' as const,
      };
    }

    if (submitPhase === 'simulating') {
      return {
        title: 'Opening World App',
        messages: txActivityMessages,
        icon: 'swap' as const,
      };
    }

    return null;
  }, [state, submitPhase, txActivityMessages]);

  const isSubmitting = submitPhase !== 'idle';

  const loadTokens = useCallback(async (forceRefresh = false) => {
    if (!walletAddress) {
      return;
    }

    previewRequestRef.current += 1;
    setIsQuoting(false);
    setTokens([]);
    setExcludedTokens([]);
    setSelected({});
    setState('loading-tokens');
    setError(null);
    setPlan(null);
    lastPreviewedKeyRef.current = '';

    try {
      const query = new URLSearchParams({ address: walletAddress });
      if (forceRefresh) {
        query.set('refresh', '1');
      }

      const response = await fetch(`/api/tokens?${query.toString()}`);
      const payload = (await response.json()) as {
        tokens?: WalletToken[];
        excluded?: ExcludedToken[];
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load wallet tokens');
      }

      const nextTokens = payload.tokens ?? [];
      setTokens(nextTokens);
      setExcludedTokens(payload.excluded ?? []);
      setSelected(
        Object.fromEntries(
          nextTokens.map((token, index) => [
            token.address,
            index < MAX_TOKENS_PER_SWEEP,
          ]),
        ),
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

  const buildPlan = useCallback(
    async (tokensForPlan: WalletToken[]) => {
      const response = await fetch('/api/build-sweep', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          tokens: tokensForPlan,
        }),
      });

      const payload = (await response.json()) as BuildSweepResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to build sweep');
      }

      return payload;
    },
    [walletAddress],
  );

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
        const nextPlan = await buildPlan(selectedTokens);
        if (requestId !== previewRequestRef.current) {
          return;
        }

        lastPreviewedKeyRef.current = previewKey;
        setPlan(nextPlan);

        const quotedAddresses = new Set(
          nextPlan.quotes.map((quote) => quote.tokenAddress.toLowerCase()),
        );
        setSelected((current) => {
          const next = { ...current };
          for (const token of selectedTokens) {
            next[token.address] = quotedAddresses.has(token.address.toLowerCase());
          }
          return next;
        });
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
    [buildPlan, selectedTokens, walletAddress],
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
    }, 250);

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
        setSubmitPhase('idle');
        lastRecordedPlanRef.current = null;
        lastUserOpHashRef.current = '';
        setState('ready');
        setPlan(null);
        void loadTokens(true);
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
        setSubmitPhase('idle');
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

    if (selectedTokens.some((token) => !isForageableToken(token))) {
      setError({
        title: 'Staked tokens selected',
        message:
          'Re-prefixed staked yield tokens cannot be foraged. Rescan your wallet — they are listed separately and excluded automatically.',
      });
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
    setTxActivityMessages(SIMULATE_ACTIVITY_MESSAGES);
    setSubmitPhase('building');

    try {
      const batchSizes = [
        Math.min(selectedTokens.length, MAX_TOKENS_PER_SWEEP),
        2,
        1,
      ].filter((size, index, sizes) => size > 0 && sizes.indexOf(size) === index);

      let activePlan: BuildSweepResponse | null = null;
      let lastSweepError: unknown = null;

      for (const batchSize of batchSizes) {
        const batch = selectedTokens.slice(0, batchSize);

        try {
          setSubmitPhase('building');
          activePlan = await buildPlan(batch);

          if (activePlan.quotes.length === 0) {
            throw new Error(
              'No selected tokens passed liquidity checks. Review skipped tokens in the preview.',
            );
          }

          setPlan(activePlan);
          setState('pending');
          lastRecordedPlanRef.current = activePlan;
          setSubmitPhase('simulating');

          const result = await sendMiniKitTransaction({
            chainId: WORLD_CHAIN_ID,
            transactions: activePlan.transactions,
          });

          const payload =
            (result as { data?: Record<string, unknown> }).data ??
            (result as Record<string, unknown>);

          if (payload?.status === 'error') {
            throw payload;
          }

          const opHash =
            (payload as { userOpHash?: string })?.userOpHash ??
            (result as { userOpHash?: string }).userOpHash;

          if (!opHash) {
            throw new Error('No userOpHash returned');
          }

          lastUserOpHashRef.current = opHash;
          setUserOpHash(opHash);
          setSubmitPhase('confirming');
          return;
        } catch (attemptError) {
          lastSweepError = attemptError;

          const isLastBatch = batchSize === batchSizes[batchSizes.length - 1];
          if (isSimulationFailedError(attemptError) && !isLastBatch) {
            setTxActivityMessages([
              'One token failed simulation — retrying with fewer...',
              ...SIMULATE_ACTIVITY_MESSAGES,
            ]);
            setSubmitPhase('simulating');
            continue;
          }

          throw attemptError;
        }
      }

      throw lastSweepError ?? new Error('Forage transaction failed');
    } catch (sweepError) {
      if (isUserRejectedError(sweepError)) {
        setSubmitPhase('idle');
        setState('ready');
        setButtonState(undefined);
        return;
      }

      console.error('Sweep error payload:', sweepError);
      void hapticNotification('error');
      setButtonState('failed');
      setState('ready');
      setSubmitPhase('idle');
      const formatted = formatMiniKitError(sweepError);
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
      setTimeout(() => setButtonState(undefined), 3000);
    }
  };

  const canForage = Boolean(plan && plan.quotes.length > 0);
  const forageButtonLabel = (() => {
    if (submitPhase === 'building') {
      return 'Preparing forage...';
    }
    if (submitPhase === 'simulating') {
      return 'Opening World App...';
    }
    if (submitPhase === 'confirming' || isConfirming) {
      return 'Confirming...';
    }
    if (isQuoting) {
      return 'Building preview...';
    }
    if (canForage) {
      return 'Forage to WLD';
    }
    return 'No swappable tokens selected';
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <p className="app-subtitle shrink-0 text-sm">{APP_TAGLINE}</p>

        {!isInstalled && (
          <p className="app-card shrink-0 rounded-xl px-4 py-3 text-sm font-medium">
            Open this mini app inside World App to scan your wallet and forage
            tokens.
          </p>
        )}

        {error && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <AppButton
            onClick={() => {
              void hapticImpact('light');
              void loadTokens(true);
            }}
            disabled={!walletAddress || state === 'loading-tokens' || isSubmitting}
            variant="ghost"
            size="sm"
          >
            {state === 'loading-tokens' ? 'Scanning wallet...' : 'Rescan Wallet'}
          </AppButton>
          {isQuoting ? (
            <span className="app-subtitle flex items-center gap-1.5 text-xs">
              <span className="app-activity-dot" />
              Building preview...
            </span>
          ) : null}
        </div>

        <div className="relative min-h-0 flex-1">
          {activityOverlay ? (
            <AppActivity
              title={activityOverlay.title}
              messages={activityOverlay.messages}
              icon={activityOverlay.icon}
            />
          ) : null}

          <div className="app-scroll h-full space-y-3 pb-2">
          <div className="space-y-1.5">
            {state === 'loading-tokens' ? (
              <TokenListSkeleton rows={5} />
            ) : tokens.length === 0 ? (
              <p className="app-subtitle text-sm">
                No swappable tokens found. Tokens without Uniswap liquidity, staked
                Re tokens, and WLD/WETH/USDC/WBTC are excluded automatically.
              </p>
            ) : (
              tokens.map((token) => (
                <label
                  key={token.address}
                  className="app-card flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(selected[token.address])}
                    disabled={isSubmitting}
                    className="h-4 w-4 shrink-0 accent-app-purple disabled:opacity-50"
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
                    <p className="truncate text-[11px] leading-tight text-app-text-muted">
                      {token.name}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-app-purple">
                    {token.balanceFormatted}
                  </p>
                </label>
              ))
            )}
          </div>

          {excludedIlliquid.length > 0 ? (
            <div className="space-y-1.5">
              <p className="app-subtitle px-1 text-xs font-medium">
                No liquidity (excluded — cannot swap)
              </p>
              {excludedIlliquid.slice(0, 12).map((token) => (
                <div
                  key={token.address}
                  className="app-card flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2 opacity-60"
                >
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
                    <p className="truncate text-[11px] leading-tight text-app-text-muted">
                      {token.reasonLabel}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-app-text-muted">
                    {token.balanceFormatted}
                  </p>
                </div>
              ))}
              {excludedIlliquid.length > 12 ? (
                <p className="app-subtitle px-1 text-xs">
                  +{excludedIlliquid.length - 12} more without liquidity
                </p>
              ) : null}
            </div>
          ) : null}

          {excludedStaked.length > 0 ? (
            <div className="space-y-1.5">
              <p className="app-subtitle px-1 text-xs font-medium">
                Staked Re tokens (excluded — cannot swap)
              </p>
              {excludedStaked.map((token) => (
                <div
                  key={token.address}
                  className="app-card flex min-w-0 items-center gap-2.5 rounded-2xl px-3 py-2 opacity-60"
                >
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
                    <p className="truncate text-[11px] leading-tight text-app-text-muted">
                      {token.reasonLabel}
                    </p>
                  </div>
                  <p className="shrink-0 text-xs font-semibold tabular-nums text-app-text-muted">
                    {token.balanceFormatted}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {plan && (
            <div className="app-card rounded-xl p-3 text-sm">
              <div className="mb-2 flex items-center gap-2">
                <PixelIcon name="swap" size={18} variant="light" />
                <p className="app-title text-sm font-semibold">Forage preview</p>
              </div>
              <p>Swapping {plan.quotes.length} verified token(s)</p>
              <p>You receive (min): {formatWld(plan.userReceivesWld)}</p>
              {plan.skippedTokens.length > 0 && (
                <div className="app-subtitle mt-2 space-y-1 text-xs">
                  <p>
                    {plan.skippedTokens.length} token(s) skipped from this
                    batch
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {plan.skippedTokens.slice(0, 6).map((token) => (
                      <li key={token.address}>
                        {token.symbol}: {token.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
          </div>
        </div>
      </div>

      <div className="app-action-bar shrink-0 px-0 pb-1 pt-3">
        <LiveFeedback
          label={{
            failed: failureLabel,
            pending:
              submitPhase === 'simulating'
                ? 'Opening World App...'
                : isConfirming
                  ? 'Confirming...'
                  : 'Forage pending',
            success: 'Forage successful',
          }}
          state={buttonState}
          className="w-full"
        >
          <AppButton
            onClick={() => void onSweep()}
            disabled={
              !canForage ||
              selectedTokens.length === 0 ||
              isConfirming ||
              state === 'loading-tokens' ||
              isQuoting ||
              isSubmitting
            }
            size="lg"
            variant="primary"
            className="w-full"
          >
            {forageButtonLabel}
          </AppButton>
        </LiveFeedback>
      </div>
    </div>
  );
}
