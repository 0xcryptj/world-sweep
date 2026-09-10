/** Currencies CoinGecko commonly supports for WLD simple/price. */
export const SUPPORTED_FIAT = new Set([
  'usd',
  'eur',
  'gbp',
  'jpy',
  'krw',
  'cny',
  'inr',
  'brl',
  'mxn',
  'cad',
  'aud',
  'chf',
  'sek',
  'nok',
  'dkk',
  'pln',
  'try',
  'thb',
  'vnd',
  'idr',
  'php',
  'sgd',
  'hkd',
  'twd',
  'nzd',
  'zar',
  'aed',
  'sar',
  'ars',
  'clp',
  'cop',
  'pen',
]);

export const REGION_CURRENCY: Record<string, string> = {
  US: 'USD',
  GB: 'GBP',
  UK: 'GBP',
  JP: 'JPY',
  KR: 'KRW',
  CN: 'CNY',
  IN: 'INR',
  BR: 'BRL',
  MX: 'MXN',
  CA: 'CAD',
  AU: 'AUD',
  NZ: 'NZD',
  CH: 'CHF',
  SE: 'SEK',
  NO: 'NOK',
  DK: 'DKK',
  PL: 'PLN',
  TR: 'TRY',
  TH: 'THB',
  VN: 'VND',
  ID: 'IDR',
  PH: 'PHP',
  SG: 'SGD',
  HK: 'HKD',
  TW: 'TWD',
  ZA: 'ZAR',
  AE: 'AED',
  SA: 'SAR',
  AR: 'ARS',
  CL: 'CLP',
  CO: 'COP',
  PE: 'PEN',
  DE: 'EUR',
  FR: 'EUR',
  ES: 'EUR',
  IT: 'EUR',
  NL: 'EUR',
  BE: 'EUR',
  AT: 'EUR',
  IE: 'EUR',
  PT: 'EUR',
  FI: 'EUR',
  GR: 'EUR',
};

export function formatFiatAmount(
  value: number,
  currency: string,
  locale: string,
): string {
  if (!Number.isFinite(value)) {
    return '—';
  }
  if (value > 0 && value < 0.01) {
    try {
      const zero = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency,
        currencyDisplay: 'narrowSymbol',
        maximumFractionDigits: 0,
      }).format(0);
      const symbol = zero.replace(/[\d\s.,]/g, '').trim() || currency;
      return `<${symbol}0.01`;
    } catch {
      return '<0.01';
    }
  }

  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}
