'use client';

import { apiPath } from './base-path';
import { formatFiatAmount } from './fiat';
import { resolvePreferredCurrency } from './locale-currency';
import { useEffect, useState } from 'react';
import { formatUnits } from 'viem';

let sharedUsd: number | null = null;

/** WLD/USD spot price, fetched once per page load and shared across consumers. */
export function useWldPrice(): number | null {
  const [price, setPrice] = useState<number | null>(sharedUsd);

  useEffect(() => {
    if (sharedUsd !== null) {
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(apiPath('/wld-price?currency=usd'));
        if (!response.ok) return;
        const body = (await response.json()) as { usd?: number };
        if (!cancelled && typeof body.usd === 'number' && body.usd > 0) {
          sharedUsd = body.usd;
          setPrice(body.usd);
        }
      } catch {
        // USD hints are optional — WLD amounts remain the source of truth.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return price;
}

export type LocalFiat = {
  currency: string;
  locale: string;
  /** WLD price in the user's preferred currency. */
  price: number | null;
  source: 'world' | 'locale' | 'default';
  format: (value: number) => string;
};

let sharedLocal: LocalFiat | null = null;

/**
 * Local fiat display for wallet balances.
 * Uses World App `preferredCurrency` when available, else device locale.
 */
export function useLocalFiat(): LocalFiat {
  const [fiat, setFiat] = useState<LocalFiat>(() => {
    if (sharedLocal) {
      return sharedLocal;
    }
    const resolved = resolvePreferredCurrency();
    return {
      currency: resolved.currency,
      locale: resolved.locale,
      price: null,
      source: resolved.source,
      format: (value: number) =>
        formatFiatAmount(value, resolved.currency, resolved.locale),
    };
  });

  useEffect(() => {
    if (sharedLocal?.price !== null && sharedLocal?.price !== undefined) {
      setFiat(sharedLocal);
      return;
    }

    let cancelled = false;
    const resolved = resolvePreferredCurrency();

    void (async () => {
      try {
        const response = await fetch(
          apiPath(
            `/wld-price?currency=${encodeURIComponent(resolved.currency)}`,
          ),
        );
        if (!response.ok) return;
        const body = (await response.json()) as {
          price?: number;
          usd?: number;
          currency?: string;
        };
        const price =
          typeof body.price === 'number' && body.price > 0
            ? body.price
            : typeof body.usd === 'number' && body.usd > 0
              ? body.usd
              : null;
        if (cancelled || price === null) return;

        const currency = (body.currency ?? resolved.currency).toUpperCase();
        const next: LocalFiat = {
          currency,
          locale: resolved.locale,
          price,
          source: resolved.source,
          format: (value: number) =>
            formatFiatAmount(value, currency, resolved.locale),
        };
        sharedLocal = next;
        if (typeof body.usd === 'number' && body.usd > 0) {
          sharedUsd = body.usd;
        }
        setFiat(next);
      } catch {
        // Fiat is optional.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return fiat;
}

export function wldWeiToUsd(amountWei: string, usdPerWld: number): number {
  return Number(formatUnits(BigInt(amountWei), 18)) * usdPerWld;
}

export function wldAmountToFiat(
  amountFormatted: string,
  pricePerWld: number,
): number {
  const amount = Number(amountFormatted.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) {
    return 0;
  }
  return amount * pricePerWld;
}

export function formatUsd(value: number): string {
  if (value > 0 && value < 0.01) {
    return '<$0.01';
  }
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
