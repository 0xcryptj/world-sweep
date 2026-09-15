import {
  MALICIOUS_TOKEN_ADDRESSES,
  PROTECTED_TOKEN_ADDRESSES,
  WLD_ADDRESS,
} from './constants';
import type { WalletToken } from './types';

/**
 * World Chain staked / yield tokens:
 * - Re-prefixed wrappers (reWLD, RePUF, …) — mixed-case `re`/`Re` + ticker
 * - Re7 vault shares (Re7WLD, re7USDC, RE7WBTC, …)
 * These cannot be swapped in mini apps and must never enter a forage batch
 * or appear in the junk / non-foragable UI.
 *
 * Do NOT treat all-caps tickers that merely start with "RE" (REAL, REST, …)
 * as staked wrappers — that falsely hid forageable tokens from both lists.
 */
const STAKED_RE_WRAPPER_REGEX = /^(?:re|Re)\d*[A-Za-z][A-Za-z0-9]*$/;
const RE7_TOKEN_REGEX = /\bre\s*7[\s_-]*[a-z0-9]/i;

export function isStakedYieldToken(symbol: string, name?: string): boolean {
  for (const value of [symbol, name ?? '']) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    // Mixed-case Re wrappers (reWLD / RePUF) or explicit Re7 naming.
    if (
      STAKED_RE_WRAPPER_REGEX.test(normalized) ||
      RE7_TOKEN_REGEX.test(normalized)
    ) {
      return true;
    }

    if (
      /restaked|re[\s-]?staked|staked\s+yield|yield[\s-]?bearing|re7\s+vault/i.test(
        normalized,
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Obvious scam / honeypot naming — catch these before we spend RPC on quotes.
 */
export function looksLikeUnsafeToken(symbol: string, name?: string): boolean {
  const haystack = `${symbol} ${name ?? ''}`.trim();
  if (!haystack) {
    return false;
  }

  if (
    /\b(don'?t\s*buy|do\s*not\s*buy|honeypot|honey\s*pot|rug\s*pull|rugpull|scam\s*token|fake\s*token|test\s*honeypot)\b/i.test(
      haystack,
    )
  ) {
    return true;
  }

  // "$DNTB DONT BUY" style tickers
  if (/dont\s*buy|dntb|honeypot/i.test(haystack)) {
    return true;
  }

  return false;
}

export type TokenExclusionReason =
  | 'zero_balance'
  | 'protected'
  | 'staked_re'
  | 'malicious';

export function getTokenExclusionReason(
  token: Pick<WalletToken, 'address' | 'symbol' | 'name' | 'balance'>,
): TokenExclusionReason | null {
  if (token.balance === '0') {
    return 'zero_balance';
  }

  const address = token.address.toLowerCase();

  if (
    PROTECTED_TOKEN_ADDRESSES.has(address) ||
    address === WLD_ADDRESS.toLowerCase()
  ) {
    return 'protected';
  }

  // Staked Re / Re7 first — never surface them as junk to forage.
  if (isStakedYieldToken(token.symbol, token.name)) {
    return 'staked_re';
  }

  if (
    MALICIOUS_TOKEN_ADDRESSES.has(address) ||
    looksLikeUnsafeToken(token.symbol, token.name)
  ) {
    return 'malicious';
  }

  return null;
}

export function exclusionReasonLabel(reason: TokenExclusionReason): string {
  switch (reason) {
    case 'staked_re':
      return 'Staked yield (Re/Re7) — hidden from forage';
    case 'protected':
      return 'Protected asset — not foraged';
    case 'zero_balance':
      return 'Zero balance';
    case 'malicious':
      return 'Flagged as unsafe — will not be foraged';
  }
}

export function isForageableToken(
  token: Pick<WalletToken, 'address' | 'symbol' | 'name' | 'balance'>,
): boolean {
  return getTokenExclusionReason(token) === null;
}

/** Leftover bags with no forageable Uniswap route — eligible for Cleanup. */
export const CLEANUP_EXCLUSION_REASONS = [
  'no_liquidity',
  'output_too_small',
  'honeypot',
  'malicious',
  'transfer_restricted',
] as const;

export type CleanupExclusionReason = (typeof CLEANUP_EXCLUSION_REASONS)[number];

export function isCleanupReason(reason: string | null | undefined): boolean {
  return Boolean(
    reason &&
      (CLEANUP_EXCLUSION_REASONS as readonly string[]).includes(reason),
  );
}
