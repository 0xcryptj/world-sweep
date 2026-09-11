'use client';

import { TokenListRow } from '@/components/TokenListRow';
import { AnimatedWld } from '@/components/Sweep/AnimatedWld';
import { ErrorBanner } from '@/components/Sweep/ErrorBanner';
import { JumpingDots } from '@/components/ui/jumping-dots';
import { ForagerActivity, TokenListSkeleton } from '@/components/ForagerActivity';
import { CleanWalletArt } from '@/components/CleanWalletArt';
import { IosIcon } from '@/components/IosIcon';
import { ForagerButton } from '@/components/ForagerButton';
import { SectionHeader } from '@/components/SectionHeader';
import { ForageSuccessShare } from '@/components/Growth/ForageSuccessShare';
import { NotifyOptIn } from '@/components/Growth/NotifyOptIn';
import { WidgetPrompt } from '@/components/Growth/WidgetPrompt';
import {
  formatApiError,
  formatMiniKitError,
  getMiniKitErrorCode,
  isSimulationFailedError,
  isUserRejectedError,
  shortErrorLabel,
  type AppError,
} from '@/lib/errors';
import { sendMiniKitTransaction, extractUserOpHash } from '@/lib/minikit-transaction';
import { FetchTimeoutError, fetchWithTimeout } from '@/lib/fetch-with-timeout';
import { hapticImpact, hapticNotification, hapticSelection } from '@/lib/haptics';
import { BRAND_COPY } from '@/lib/branding';
import { apiPath } from '@/lib/base-path';
import {
  readClientScanCache,
  writeClientScanCache,
} from '@/lib/client-scan-cache';
import { formatUsd, useWldPrice, wldWeiToUsd } from '@/lib/use-wld-price';
import { isForageableToken } from '@/lib/token-filters';
import type { ScanExclusionReason } from '@/lib/forage-scan';
import type { BuildSweepResponse, WalletToken } from '@/lib/types';
import { requestWalletRefresh } from '@/lib/wallet-refresh';
import { LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { MiniKit } from '@worldcoin/minikit-js';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useUserOperationReceipt } from '@worldcoin/minikit-react';
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
  priceUsd?: number | null;
  priceChange24h?: number | null;
  reason: ScanExclusionReason;
  reasonLabel: string;
};

const SCAN_ACTIVITY_MESSAGES = [
  'Checking allowlisted tokens for WLD routes...',
  'Scanning your World Chain wallet...',
  'Filtering leftover tokens with real liquidity...',
];

/**
 * Characteristic time for the scan asymptote (fast early motion, then creep).
 * Progress keeps advancing until data is ready, then settles. Min hold only
 * avoids a flash dismiss on instant responses.
 */
const SCAN_PROGRESS_MS = 1_400;
const SCAN_MIN_HOLD_MS = 280;
const SCAN_COMPLETE_SETTLE_MS = 120;

const BUILD_ACTIVITY_MESSAGES = [
  'Preparing your swap batch...',
  'Encoding router approvals...',
  'Calculating minimum WLD output...',
];

const SIMULATE_ACTIVITY_MESSAGES = [
  'Preparing your transaction request in World App...',
  'Keep World App open while the confirmation sheet appears.',
  'If this takes too long, close and reopen World App then retry.',
];

type SkipNotice = {
  title: string;
  message: string;
  allowlistPending: boolean;
};

function isAllowlistSkipReason(reason: string): boolean {
  return /allowlist|hasn.?t allowlisted|reopen World App/i.test(reason);
}

function formatTokenList(symbols: string[]): string {
  if (symbols.length === 0) {
    return 'This token';
  }
  if (symbols.length === 1) {
    return symbols[0];
  }
  if (symbols.length === 2) {
    return `${symbols[0]} and ${symbols[1]}`;
  }
  return `${symbols.slice(0, -1).join(', ')}, and ${symbols[symbols.length - 1]}`;
}

function buildSkipNotice(
  skipped: BuildSweepResponse['skippedTokens'],
  quotedCount: number,
): SkipNotice | null {
  if (skipped.length === 0) {
    return null;
  }

  const allowlistSkipped = skipped.filter((token) =>
    isAllowlistSkipReason(token.reason),
  );
  if (allowlistSkipped.length > 0) {
    const symbols = [
      ...new Set(allowlistSkipped.map((token) => token.symbol || 'token')),
    ];
    const names = formatTokenList(symbols);
    const verb = symbols.length === 1 ? "isn't" : "aren't";
    if (quotedCount > 0) {
      return {
        title: 'Some tokens skipped',
        message: `${names} ${verb} allowlisted by World App yet — foraging the rest. Fully close and reopen World App in a minute, then rescan to include ${symbols.length === 1 ? 'it' : 'them'}.`,
        allowlistPending: true,
      };
    }
    return {
      title: 'Waiting on World allowlist',
      message: `${names} ${verb} allowlisted by World App yet. Fully close and reopen World App in a minute, then rescan.`,
      allowlistPending: true,
    };
  }

  const symbols = [...new Set(skipped.map((token) => token.symbol || 'token'))];
  const names = formatTokenList(symbols);
  if (quotedCount > 0) {
    return {
      title: 'Some tokens skipped',
      message: `${names} couldn't be quoted right now — foraging the rest.`,
      allowlistPending: false,
    };
  }
  return {
    title: 'Nothing ready to forage',
    message: `${names} couldn't be quoted right now. Try again in a moment or pick other tokens.`,
    allowlistPending: false,
  };
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/** Recoverable quote / route issues — never wall the user with an error banner. */
function isSoftQuoteFailure(message: string): boolean {
  return (
    /no selected tokens have a swappable route/i.test(message) ||
    /no swappable/i.test(message) ||
    /route quote/i.test(message) ||
    /approval simulation/i.test(message) ||
    /transfer simulation/i.test(message) ||
    /can be approved for swap/i.test(message) ||
    /Failed to build the forage batch/i.test(message) ||
    /Failed to build sweep/i.test(message) ||
    /Quoted output too small/i.test(message) ||
    /No Uniswap V3 liquidity/i.test(message) ||
    /Quote RPC/i.test(message) ||
    /Quote unavailable/i.test(message) ||
    /Swap simulation failed/i.test(message) ||
    /network is busy/i.test(message)
  );
}

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
  const [isConfirming, setIsConfirming] = useState(false);
  const lastRecordedPlanRef = useRef<BuildSweepResponse | null>(null);
  const previewRequestRef = useRef(0);
  const lastPreviewedKeyRef = useRef('');
  const previewRetryRef = useRef<Record<string, number>>({});
  const [isQuoting, setIsQuoting] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [scanUiComplete, setScanUiComplete] = useState(false);
  const [skipNotice, setSkipNotice] = useState<SkipNotice | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [submitPhase, setSubmitPhase] = useState<SubmitPhase>('idle');
  const wldUsd = useWldPrice();
  const [txActivityMessages, setTxActivityMessages] = useState(
    SIMULATE_ACTIVITY_MESSAGES,
  );
  const [successShare, setSuccessShare] = useState<{
    wldReceivedWei: string;
    tokenCount: number;
  } | null>(null);
  const [growthStep, setGrowthStep] = useState<
    'idle' | 'share' | 'notify' | 'widget'
  >('idle');
  // Freshly foraged addresses can linger in Alchemy's cached token-balance
  // response for up to a minute. Filter them out of any rescan that runs
  // inside that window so users never see the balance they just swapped away.
  const recentlyForagedRef = useRef<Map<string, number>>(new Map());
  const RECENTLY_FORAGED_TTL_MS = 90_000;

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

  const { poll } = useUserOperationReceipt({
    client,
    timeout: 120_000,
  });

  const selectedTokens = useMemo(
    () => tokens.filter((token) => selected[token.address] && isForageableToken(token)),
    [selected, tokens],
  );

  // Preview and submit must use the same capped batch (F-10).
  const forageBatch = useMemo(
    () => selectedTokens.slice(0, MAX_TOKENS_PER_SWEEP),
    [selectedTokens],
  );

  const pendingVerifiedTokens = useMemo(
    () =>
      excludedTokens.filter(
        (token) =>
          token.reason === 'allowlist_pending' ||
          token.reason === 'not_allowlisted',
      ),
    [excludedTokens],
  );

  const nonForagableTokens = useMemo(
    () =>
      excludedTokens.filter(
        (token) =>
          token.reason !== 'protected' &&
          token.reason !== 'zero_balance' &&
          token.reason !== 'staked_re' &&
          token.reason !== 'scan_deferred' &&
          token.reason !== 'allowlist_pending' &&
          token.reason !== 'not_allowlisted',
      ),
    [excludedTokens],
  );

  const selectionKey = useMemo(
    () =>
      forageBatch
        .map((token) => `${token.address}:${token.balance}`)
        .sort()
        .join('|'),
    [forageBatch],
  );

  const isSubmitting = submitPhase !== 'idle';
  const isScanning = state === 'loading-tokens';

  const activityOverlay = useMemo(() => {
    if (isScanning || (!hasScanned && Boolean(walletAddress))) {
      return {
        title: 'Scanning wallet',
        messages: SCAN_ACTIVITY_MESSAGES,
        icon: 'coin' as const,
        durationMs: SCAN_PROGRESS_MS,
        variant: 'scan' as const,
        complete: scanUiComplete,
      };
    }

    if (submitPhase === 'building') {
      return {
        title: 'Preparing forage',
        messages: BUILD_ACTIVITY_MESSAGES,
        icon: 'swap' as const,
        durationMs: 8_000,
        variant: 'default' as const,
        complete: false,
      };
    }

    if (submitPhase === 'simulating') {
      return {
        title: 'Opening World App',
        messages: txActivityMessages,
        icon: 'swap' as const,
        durationMs: 40_000,
        variant: 'default' as const,
        complete: false,
      };
    }

    return null;
  }, [
    hasScanned,
    isScanning,
    scanUiComplete,
    submitPhase,
    txActivityMessages,
    walletAddress,
  ]);

  const loadTokens = useCallback(async (forceRefresh = false) => {
    if (!walletAddress) {
      return;
    }

    previewRequestRef.current += 1;
    const requestId = previewRequestRef.current;
    const scanStartedAt = Date.now();
    setIsQuoting(false);
    setScanUiComplete(false);
    setError(null);
    setSkipNotice(null);
    setPlan(null);
    lastPreviewedKeyRef.current = '';

    const applyPayload = (
      payload: { tokens?: WalletToken[]; excluded?: ExcludedToken[]; mode?: string },
      options?: { persist?: boolean },
    ) => {
      const now = Date.now();
      for (const [address, timestamp] of recentlyForagedRef.current) {
        if (now - timestamp > RECENTLY_FORAGED_TTL_MS) {
          recentlyForagedRef.current.delete(address);
        }
      }
      const isRecentlyForaged = (address: string) =>
        recentlyForagedRef.current.has(address.toLowerCase());

      const nextTokens = (payload.tokens ?? []).filter(
        (token) => !isRecentlyForaged(token.address),
      );
      const nextExcluded = (payload.excluded ?? []).filter(
        (token) => !isRecentlyForaged(token.address),
      );
      setTokens(nextTokens);
      setExcludedTokens(nextExcluded);
      // Preserve the user's current picks across fast→full scan refreshes.
      // Only auto-select brand-new addresses (up to the batch cap).
      setSelected((current) => {
        const next: Record<string, boolean> = {};
        let selectedCount = 0;

        for (const token of nextTokens) {
          if (Object.prototype.hasOwnProperty.call(current, token.address)) {
            next[token.address] = Boolean(current[token.address]);
            if (next[token.address]) {
              selectedCount += 1;
            }
            continue;
          }

          const autoSelect = selectedCount < MAX_TOKENS_PER_SWEEP;
          next[token.address] = autoSelect;
          if (autoSelect) {
            selectedCount += 1;
          }
        }

        return next;
      });
      setState('ready');
      setHasScanned(true);
      if (options?.persist !== false) {
        writeClientScanCache(walletAddress, {
          tokens: nextTokens,
          excluded: nextExcluded,
          mode: payload.mode,
        });
      }
    };

    // Instant paint from session cache — never blank the list on revisit.
    // Even on Rescan, keep the previous list visible while the fast pass runs.
    const cached = readClientScanCache(walletAddress);
    if (cached) {
      applyPayload(
        {
          tokens: cached.tokens as WalletToken[],
          excluded: cached.excluded as ExcludedToken[],
          mode: cached.mode,
        },
        { persist: false },
      );
      setScanUiComplete(true);
      if (forceRefresh) {
        // Soft refresh indicator without the full-screen scan wall.
        setState('ready');
      }
    } else {
      setTokens([]);
      setExcludedTokens([]);
      setSelected({});
      setState('loading-tokens');
    }

    const fetchScan = async (mode: 'fast' | 'full', refresh: boolean) => {
      const query = new URLSearchParams({
        address: walletAddress,
        mode,
      });
      if (refresh) {
        query.set('refresh', '1');
      }
      const response = await fetchWithTimeout(
        apiPath(`/tokens?${query.toString()}`),
        {},
        mode === 'fast' ? 12_000 : 55_000,
      );
      const payload = (await response.json()) as {
        tokens?: WalletToken[];
        excluded?: ExcludedToken[];
        mode?: string;
        error?: string;
      };
      if (!response.ok) {
        throw new Error(payload.error ?? 'Failed to load wallet tokens');
      }
      return payload;
    };

    try {
      // Phase 1: fast allowlisted quotes — usually a few seconds.
      const fastPayload = await fetchScan('fast', forceRefresh);
      if (requestId !== previewRequestRef.current) {
        return;
      }

      if (!cached) {
        const remaining = SCAN_MIN_HOLD_MS - (Date.now() - scanStartedAt);
        if (remaining > 0) {
          await sleep(remaining);
        }
        if (requestId !== previewRequestRef.current) {
          return;
        }
        setScanUiComplete(true);
        await sleep(SCAN_COMPLETE_SETTLE_MS);
        if (requestId !== previewRequestRef.current) {
          return;
        }
      }

      applyPayload(fastPayload);
      requestWalletRefresh({ reason: 'scan' });

      // Phase 2: full scan in background (bridges + transfer checks).
      // Never let an empty/starved full pass wipe forageable tokens from fast.
      void fetchScan('full', false)
        .then((fullPayload) => {
          if (requestId !== previewRequestRef.current) {
            return;
          }
          const fullTokens = fullPayload.tokens ?? [];
          const fastTokens = fastPayload.tokens ?? [];
          if (fullTokens.length === 0 && fastTokens.length > 0) {
            applyPayload({
              ...fullPayload,
              tokens: fastTokens,
              excluded: fullPayload.excluded ?? fastPayload.excluded,
              mode: fullPayload.mode ?? 'full',
            });
          } else {
            applyPayload(fullPayload);
          }
          requestWalletRefresh({ reason: 'scan' });
        })
        .catch((backgroundError) => {
          console.warn(
            '[sweep] background full scan failed',
            backgroundError instanceof Error
              ? backgroundError.message
              : backgroundError,
          );
        });
    } catch (loadError) {
      if (requestId !== previewRequestRef.current) {
        return;
      }
      // Keep cached tokens on screen if the network fails.
      if (cached) {
        setState('ready');
        setHasScanned(true);
        setScanUiComplete(true);
        return;
      }
      const message =
        loadError instanceof FetchTimeoutError
          ? loadError.message
          : loadError instanceof Error
            ? loadError.message
            : 'Failed to load wallet tokens';
      const formatted = formatApiError(message);
      setError(formatted);
      setFailureLabel(shortErrorLabel(formatted));
      setState('idle');
      setHasScanned(true);
    }
  }, [walletAddress]);

  const buildPlan = useCallback(
    async (tokensForPlan: WalletToken[]) => {
      const run = async () => {
        const response = await fetchWithTimeout(
          apiPath('/build-sweep'),
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              walletAddress,
              tokens: tokensForPlan,
            }),
          },
          50_000,
        );

        const payload = (await response.json()) as BuildSweepResponse & {
          error?: string;
          traceId?: string;
        };

        if (!response.ok) {
          const errorMessage = payload.error ?? 'Failed to build sweep';
          throw new Error(
            payload.traceId
              ? `${errorMessage} (trace: ${payload.traceId})`
              : errorMessage,
          );
        }

        return payload;
      };

      try {
        return await run();
      } catch (firstError) {
        // One automatic retry for transient RPC / timeout flakes.
        const message =
          firstError instanceof Error ? firstError.message : String(firstError);
        if (/timed out|busy|rate|429|network/i.test(message)) {
          await sleep(400);
          return run();
        }
        throw firstError;
      }
    },
    [walletAddress],
  );

  const runAutoPreview = useCallback(
    async (previewKey: string) => {
      if (!walletAddress || forageBatch.length === 0) {
        setPlan(null);
        return;
      }

      if (lastPreviewedKeyRef.current === previewKey) {
        return;
      }

      const requestId = ++previewRequestRef.current;
      setIsQuoting(true);
      let keepQuoting = false;

      try {
        const nextPlan = await buildPlan(forageBatch);
        if (requestId !== previewRequestRef.current) {
          return;
        }

        if (nextPlan.quotes.length > 0) {
          lastPreviewedKeyRef.current = previewKey;
          previewRetryRef.current[previewKey] = 0;
          setPlan(nextPlan);
        } else {
          const retries = previewRetryRef.current[previewKey] ?? 0;
          const transportSkip = nextPlan.skippedTokens.some((token) =>
            /busy|retry|RPC|right now|timed out/i.test(token.reason),
          );
          if (retries < 2 && transportSkip) {
            keepQuoting = true;
            previewRetryRef.current[previewKey] = retries + 1;
            lastPreviewedKeyRef.current = '';
            window.setTimeout(() => {
              void runAutoPreview(previewKey);
            }, 800 * (retries + 1));
          } else {
            lastPreviewedKeyRef.current = previewKey;
            setPlan((current) => (current ? current : null));
          }
        }

        const notice = buildSkipNotice(
          nextPlan.skippedTokens,
          nextPlan.quotes.length,
        );
        if (notice) {
          setSkipNotice(notice);
        } else if (nextPlan.quotes.length > 0) {
          setSkipNotice(null);
        }
        // Keep the user's selection intact while preview builds / skips.
        // Skipped tokens stay checked so the notice is actionable; forage
        // still only ships quoted routes from the plan.
      } catch (buildError) {
        if (requestId !== previewRequestRef.current) {
          return;
        }

        const message =
          buildError instanceof FetchTimeoutError
            ? buildError.message
            : buildError instanceof Error
              ? buildError.message
              : 'Failed to build sweep';

        const retries = previewRetryRef.current[previewKey] ?? 0;
        const soft = isSoftQuoteFailure(message) || /timed out/i.test(message);

        if (soft && retries < 2) {
          keepQuoting = true;
          previewRetryRef.current[previewKey] = retries + 1;
          lastPreviewedKeyRef.current = '';
          window.setTimeout(() => {
            void runAutoPreview(previewKey);
          }, 800 * (retries + 1));
        } else if (!soft) {
          const formatted = formatApiError(message);
          setError(formatted);
          setFailureLabel(shortErrorLabel(formatted));
          lastPreviewedKeyRef.current = previewKey;
        } else {
          setSkipNotice({
            title: 'Preview not ready',
            message:
              'Could not quote this selection right now. Your picks are still selected — wait a moment or tap Rescan.',
            allowlistPending: false,
          });
          lastPreviewedKeyRef.current = previewKey;
        }
      } finally {
        if (requestId === previewRequestRef.current && !keepQuoting) {
          setIsQuoting(false);
        }
      }
    },
    [buildPlan, forageBatch, walletAddress],
  );

  useEffect(() => {
    if (walletAddress) {
      void loadTokens();
    }
  }, [loadTokens, walletAddress]);

  useEffect(() => {
    if (!walletAddress || forageBatch.length === 0) {
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

  const recordForageSuccess = useCallback(
    async (completedPlan: BuildSweepResponse, completedUserOpHash: string) => {
      void hapticNotification('success');
      setButtonState('success');

      if (walletAddress) {
        try {
          await fetch(apiPath('/forage-events'), {
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
      setSubmitPhase('idle');
      setIsConfirming(false);
      lastRecordedPlanRef.current = null;
      setState('ready');
      setPlan(null);

      // Optimistically drop foraged tokens so they don't linger while Alchemy
      // and the scan cache catch up, then force a fresh liquidity rescan.
      const foragedAddresses = new Set(
        completedPlan.quotes.map((quote) => quote.tokenAddress.toLowerCase()),
      );
      const now = Date.now();
      for (const address of foragedAddresses) {
        recentlyForagedRef.current.set(address, now);
      }
      setTokens((current) =>
        current.filter(
          (token) => !foragedAddresses.has(token.address.toLowerCase()),
        ),
      );
      setExcludedTokens((current) =>
        current.filter(
          (token) => !foragedAddresses.has(token.address.toLowerCase()),
        ),
      );
      setSelected((current) => {
        const next = { ...current };
        for (const address of foragedAddresses) {
          for (const key of Object.keys(next)) {
            if (key.toLowerCase() === address) {
              delete next[key];
            }
          }
        }
        return next;
      });
      void loadTokens(true);
      requestWalletRefresh({ reason: 'forage', force: true });

      setSuccessShare({
        wldReceivedWei: completedPlan.userReceivesWld,
        tokenCount: completedPlan.quotes.length,
      });
      setGrowthStep('share');
      setTimeout(() => setButtonState(undefined), 3000);
    },
    [loadTokens, walletAddress],
  );

  const recordForageFailure = useCallback(
    async (nextError: AppError) => {
      void hapticNotification('error');
      setButtonState('failed');
      setError(nextError);
      setFailureLabel(shortErrorLabel(nextError));
      setSubmitPhase('idle');
      setIsConfirming(false);
      setState('ready');
      setTimeout(() => setButtonState(undefined), 3000);
    },
    [],
  );

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

    // Selected but no preview yet — rebuild instead of no-op / wrong CTA.
    if (!plan || plan.quotes.length === 0) {
      lastPreviewedKeyRef.current = '';
      void runAutoPreview(selectionKey);
      return;
    }

    void hapticImpact('medium');
    setButtonState('pending');
    setState('pending');
    setError(null);
    setTxActivityMessages(SIMULATE_ACTIVITY_MESSAGES);
    setSubmitPhase('building');

    try {
      const batch = forageBatch;
      const omittedCount = Math.max(0, selectedTokens.length - batch.length);
      if (omittedCount > 0) {
        setTxActivityMessages([
          `Foraging top ${batch.length} tokens first (${omittedCount} queued for next run).`,
          ...SIMULATE_ACTIVITY_MESSAGES,
        ]);
      }

      setSubmitPhase('building');
      const activePlan =
        plan && plan.quotes.length > 0 ? plan : await buildPlan(batch);

      if (activePlan.quotes.length === 0) {
        const notice = buildSkipNotice(
          activePlan.skippedTokens,
          activePlan.quotes.length,
        );
        if (notice) {
          setSkipNotice(notice);
        }
        setPlan(null);
        // Keep selection — empty plan already disables forage; user can retry
        // or manually deselect without losing their picks.
        setSubmitPhase('idle');
        setIsConfirming(false);
        setState('ready');
        setButtonState(undefined);
        return;
      }

      // Partial batch: explain allowlist / soft skips, forage the rest.
      const forageNotice = buildSkipNotice(
        activePlan.skippedTokens,
        activePlan.quotes.length,
      );
      if (forageNotice) {
        setSkipNotice(forageNotice);
      }

      setPlan(activePlan);
      setState('pending');
      lastRecordedPlanRef.current = activePlan;
      setSubmitPhase('simulating');

      const sendPlan = async (planToSend: BuildSweepResponse) => {
        const result = await sendMiniKitTransaction({
          chainId: WORLD_CHAIN_ID,
          transactions: planToSend.transactions,
        });

        const payload =
          (result as { data?: Record<string, unknown> }).data ??
          (result as Record<string, unknown>);

        if (payload?.status === 'error') {
          throw payload;
        }

        return result;
      };

      let submittedPlan = activePlan;
      let result: Awaited<ReturnType<typeof sendMiniKitTransaction>>;
      try {
        result = await sendPlan(submittedPlan);
      } catch (firstSendError) {
        const retryable =
          isSimulationFailedError(firstSendError) ||
          getMiniKitErrorCode(firstSendError) === 'invalid_contract';
        if (!retryable || submittedPlan.quotes.length < 2) {
          throw firstSendError;
        }

        const dropped = submittedPlan.quotes[submittedPlan.quotes.length - 1];
        const reducedBatch = batch.filter(
          (token) =>
            token.address.toLowerCase() !== dropped.tokenAddress.toLowerCase(),
        );
        if (reducedBatch.length === 0) {
          throw firstSendError;
        }

        setSkipNotice({
          title: 'Retrying without a failing token',
          message: `${dropped.symbol || 'One token'} failed World App simulation — foraging the rest.`,
          allowlistPending:
            getMiniKitErrorCode(firstSendError) === 'invalid_contract',
        });
        setSelected((current) => ({
          ...current,
          [dropped.tokenAddress]: false,
        }));

        const reducedPlan = await buildPlan(reducedBatch);
        if (reducedPlan.quotes.length === 0) {
          throw firstSendError;
        }

        submittedPlan = reducedPlan;
        setPlan(reducedPlan);
        lastRecordedPlanRef.current = reducedPlan;
        result = await sendPlan(reducedPlan);
      }

      const opHash = extractUserOpHash(result);

      if (!opHash) {
        throw new Error('No userOpHash returned');
      }

      setSubmitPhase('confirming');
      setIsConfirming(true);

      try {
        await poll(opHash);
        await recordForageSuccess(submittedPlan, opHash);
      } catch (confirmError) {
        const nextError: AppError = {
          title: 'On-chain failure',
          message:
            'World App submitted the forage, but the batch did not complete successfully.',
          details: `User operation: ${opHash}`,
        };

        try {
          const response = await fetch(
            apiPath(`/userop?hash=${encodeURIComponent(opHash)}`),
          );
          const userOpPayload = (await response.json()) as {
            status?: string;
            transaction_hash?: string | null;
            error?: string;
          };

          if (userOpPayload.transaction_hash) {
            nextError.details = `Tx: ${userOpPayload.transaction_hash}`;
          } else if (userOpPayload.error) {
            nextError.details = userOpPayload.error;
          }
        } catch {
          // Keep default on-chain failure copy.
        }

        if (
          confirmError instanceof Error &&
          /aborted|timeout/i.test(confirmError.message)
        ) {
          nextError.title = 'Confirmation timed out';
          nextError.message =
            'The forage may still be processing on-chain. Check your WLD balance in a minute, then rescan.';
          nextError.details = confirmError.message;
        }

        await recordForageFailure(nextError);
      }

      return;
    } catch (sweepError) {
      if (isUserRejectedError(sweepError)) {
        setSubmitPhase('idle');
        setIsConfirming(false);
        setState('ready');
        setButtonState(undefined);
        return;
      }

      console.error('Sweep error payload:', sweepError);
      setState('ready');
      setSubmitPhase('idle');
      setIsConfirming(false);

      const rawMessage =
        sweepError instanceof FetchTimeoutError
          ? sweepError.message
          : sweepError instanceof Error
            ? sweepError.message
            : String(sweepError);

      // Quote / liquidity flakes: soft degrade without an error wall.
      if (isSoftQuoteFailure(rawMessage)) {
        setPlan(null);
        setButtonState(undefined);
        return;
      }

      void hapticNotification('error');
      setButtonState('failed');
      const formatted =
        sweepError instanceof FetchTimeoutError
          ? formatApiError(sweepError.message)
          : formatMiniKitError(sweepError);
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
    if (selectedTokens.length > 0) {
      return 'Retry preview';
    }
    return 'Select forageable tokens';
  })();

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-hidden">
        {!isInstalled && (
          <p className="forager-notice shrink-0 text-[15px] leading-snug text-forager-text-muted">
            Open this mini app inside World App to scan your wallet and forage
            tokens.
          </p>
        )}

        {error && (
          <ErrorBanner error={error} onDismiss={() => setError(null)} />
        )}

        {skipNotice && !error ? (
          <div
            role="status"
            className="forager-notice shrink-0 text-[15px]"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <p className="forager-title text-[17px]">{skipNotice.title}</p>
                <p className="forager-subtitle text-[15px] leading-snug">
                  {skipNotice.message}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSkipNotice(null)}
                className="forager-text-action"
              >
                Dismiss
              </button>
            </div>
          </div>
        ) : null}

        <SectionHeader
          title="Junk tokens"
          action={
            <div className="flex items-center gap-3">
              {isScanning || isQuoting ? (
                <span className="forager-subtitle flex shrink-0 items-center gap-1.5 text-[13px]">
                  <span className="forager-activity-dot" />
                  {isScanning ? 'Updating' : 'Quoting'}
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  void hapticImpact('light');
                  void loadTokens(true);
                }}
                disabled={!walletAddress || isScanning || isSubmitting}
                className="forager-text-action disabled:opacity-40"
              >
                Rescan
              </button>
            </div>
          }
        />

        <div className="relative min-h-0 flex-1">
          {activityOverlay ? (
            <ForagerActivity
              title={activityOverlay.title}
              messages={activityOverlay.messages}
              icon={activityOverlay.icon}
              durationMs={activityOverlay.durationMs}
              variant={activityOverlay.variant}
              complete={activityOverlay.complete}
            />
          ) : null}

          <div className="forager-scroll h-full space-y-8 pb-4">
          <div className="forager-group forager-wallet-list">
            {isScanning || (!hasScanned && Boolean(walletAddress)) ? (
              <TokenListSkeleton rows={5} />
            ) : tokens.length === 0 ? (
              <div className="forager-empty forager-row-enter flex flex-col items-center px-4 text-center">
                {walletAddress ? <CleanWalletArt /> : null}
                <p className="forager-title text-[17px]">
                  {!walletAddress
                    ? 'Waiting for your wallet'
                    : pendingVerifiedTokens.length > 0
                      ? 'Verified tokens are waiting on World App'
                    : nonForagableTokens.length > 0
                      ? 'Nothing forageable right now'
                      : 'Your wallet is clean'}
                </p>
                <p className="forager-subtitle mt-3 max-w-[30ch] text-[15px] leading-snug">
                  {!walletAddress
                    ? 'Sign in inside World App and leftover tokens will load automatically.'
                    : pendingVerifiedTokens.length > 0
                      ? 'These tokens have real WLD liquidity. Reopen World App in a minute so Forager can include them.'
                    : nonForagableTokens.length > 0
                      ? 'No usable Uniswap route to WLD, or the sell path is unsafe.'
                      : 'No leftover tokens to forage right now. Check back after other mini apps.'}
                </p>
              </div>
            ) : (
              tokens.map((token, index) => {
                const isSelected = Boolean(selected[token.address]);
                return (
                  <TokenListRow
                    key={token.address}
                    token={token}
                    selected={isSelected}
                    disabled={isSubmitting}
                    className="forager-row-enter"
                    onToggle={
                      isSubmitting
                        ? undefined
                        : () => {
                            void hapticSelection();
                            lastPreviewedKeyRef.current = '';
                            previewRetryRef.current = {};
                            setPlan(null);
                            setSelected((current) => ({
                              ...current,
                              [token.address]: !current[token.address],
                            }));
                          }
                    }
                    style={{ '--row-delay': `${Math.min(index, 8) * 45}ms` } as React.CSSProperties}
                  />
                );
              })
            )}
          </div>

          {pendingVerifiedTokens.length > 0 ? (
            <div className="forager-section">
              <div className="flex items-center gap-3 px-1 pb-2">
                <span className="forager-nonforage-count forager-numeric shrink-0 rounded-full px-2 py-0.5 text-[13px]">
                  {pendingVerifiedTokens.length}
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-forager-text-muted">
                  Verified · World App syncing
                </span>
              </div>
              <div className="forager-group forager-wallet-list">
                {pendingVerifiedTokens.map((token) => (
                  <TokenListRow
                    key={token.address}
                    token={token}
                    disabled
                    verified
                    verifiedTone="pending"
                  />
                ))}
              </div>
            </div>
          ) : null}

          {nonForagableTokens.length > 0 ? (
            <div className="forager-section">
              <button
                type="button"
                onClick={() => {
                  void hapticSelection();
                  setShowExcluded((current) => !current);
                }}
                className={`forager-nonforage-toggle flex w-full items-center gap-3 px-4 py-3.5 text-left ${
                  showExcluded ? 'forager-nonforage-toggle-open' : ''
                }`}
                aria-expanded={showExcluded}
              >
                <span className="forager-nonforage-count forager-numeric shrink-0 rounded-full px-2 py-0.5 text-[13px]">
                  {nonForagableTokens.length}
                </span>
                <span className="min-w-0 flex-1 text-[15px] text-forager-text-muted">
                  No WLD route
                </span>
                <span
                  className={`forager-nonforage-chevron ml-1 shrink-0 transition-transform duration-200 ${
                    showExcluded ? 'rotate-180' : ''
                  }`}
                  aria-hidden
                >
                  <IosIcon name="chevron" size={16} />
                </span>
              </button>
              {showExcluded ? (
                <div className="forager-group forager-wallet-list">
                  {nonForagableTokens.map((token) => (
                    <TokenListRow
                      key={token.address}
                      token={token}
                      disabled
                      className="opacity-70"
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {(isQuoting || plan) && forageBatch.length > 0 ? (
            <div className="forager-preview forager-row-enter">
              <div className="flex items-center gap-2">
                <IosIcon name="swap" size={18} />
                <p className="forager-title text-[17px]">Preview</p>
                {isQuoting ? <JumpingDots label="Quoting preview" /> : null}
              </div>
              {isQuoting ? (
                <div className="mt-4 flex flex-wrap items-baseline gap-x-2">
                  <span className="text-[13px] text-forager-text-muted">
                    You receive
                  </span>
                  <JumpingDots
                    label="Estimating WLD"
                    className="forager-numeric text-[22px]"
                  />
                </div>
              ) : plan ? (
                <>
              <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
                Swapping {plan.quotes.length} leftover token
                {plan.quotes.length === 1 ? '' : 's'}
              </p>
              <div className="mt-4 flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-[13px] text-forager-text-muted">
                  You receive
                </span>
                <AnimatedWld
                  amountWei={plan.userReceivesWld}
                  className="forager-value-green text-[22px] font-semibold"
                />
                {wldUsd !== null ? (
                  <span className="forager-numeric text-[15px] text-forager-text-muted">
                    ≈ {formatUsd(wldWeiToUsd(plan.userReceivesWld, wldUsd))}
                  </span>
                ) : null}
              </div>
              {plan.skippedTokens.length > 0 && plan.quotes.length > 0 ? (
                <p className="forager-subtitle mt-3 text-[15px] leading-snug">
                  {(() => {
                    const allowlistSkipped = plan.skippedTokens.filter((token) =>
                      isAllowlistSkipReason(token.reason),
                    );
                    if (allowlistSkipped.length > 0) {
                      const names = formatTokenList(
                        allowlistSkipped.map(
                          (token) => token.symbol || 'token',
                        ),
                      );
                      return `Skipping ${names} — World App hasn't allowlisted ${
                        allowlistSkipped.length === 1 ? 'it' : 'them'
                      } yet. Foraging the rest; reopen World App later to include ${
                        allowlistSkipped.length === 1 ? 'it' : 'them'
                      }.`;
                    }
                    return `${plan.skippedTokens.length} token${
                      plan.skippedTokens.length === 1 ? '' : 's'
                    } skipped — foraging the rest`;
                  })()}
                </p>
              ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          </div>
        </div>
      </div>

      <div className="forager-action-bar shrink-0 px-0 pb-2 pt-4">
        {growthStep === 'share' && successShare && walletAddress ? (
          <ForageSuccessShare
            walletAddress={walletAddress}
            wldReceivedWei={successShare.wldReceivedWei}
            tokenCount={successShare.tokenCount}
            onDismiss={() => {
              setSuccessShare(null);
              setGrowthStep('notify');
            }}
            onContinueGrowth={() => {
              setSuccessShare(null);
              setGrowthStep('notify');
            }}
          />
        ) : null}

        {growthStep === 'notify' ? (
          <NotifyOptIn force onDone={() => setGrowthStep('widget')} />
        ) : null}

        {growthStep === 'widget' ? (
          <WidgetPrompt
            force
            onDone={() => {
              setGrowthStep('idle');
              setSuccessShare(null);
            }}
          />
        ) : null}

        {growthStep === 'idle' ? (
          <LiveFeedback
            label={{
              failed: failureLabel,
              pending:
                submitPhase === 'simulating'
                  ? 'Opening World App...'
                  : isConfirming
                    ? 'Confirming...'
                    : BRAND_COPY.foragePending,
              success: BRAND_COPY.forageSuccess,
            }}
            state={buttonState}
            className="forager-cta-wrap w-full"
          >
            <ForagerButton
              onClick={() => void onSweep()}
              disabled={
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
            </ForagerButton>
          </LiveFeedback>
        ) : null}
      </div>
    </div>
  );
}
