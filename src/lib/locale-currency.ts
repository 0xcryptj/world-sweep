'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { REGION_CURRENCY, SUPPORTED_FIAT } from './fiat';

/**
 * Resolve the user's display currency.
 * Prefer World App's `preferredCurrency` (profile / region),
 * then the device locale region, then USD.
 */
export function resolvePreferredCurrency(): {
  currency: string;
  locale: string;
  source: 'world' | 'locale' | 'default';
} {
  const locale =
    typeof navigator !== 'undefined'
      ? navigator.language || 'en-US'
      : 'en-US';

  const fromWorld = MiniKit.user?.preferredCurrency?.trim();
  if (fromWorld) {
    const normalized = fromWorld.toUpperCase();
    if (SUPPORTED_FIAT.has(normalized.toLowerCase())) {
      return { currency: normalized, locale, source: 'world' };
    }
  }

  try {
    const region =
      typeof Intl !== 'undefined'
        ? new Intl.Locale(locale).maximize().region ?? null
        : null;
    if (region && REGION_CURRENCY[region]) {
      return {
        currency: REGION_CURRENCY[region],
        locale,
        source: 'locale',
      };
    }
  } catch {
    // Fall through to USD.
  }

  return { currency: 'USD', locale, source: 'default' };
}
