import { formatUnits } from 'viem';

export const MAX_BALANCE_DECIMALS = 7;

/** Trim a decimal string to at most `maxDecimals` places and drop trailing zeros. */
export function capDecimalPlaces(
  value: string,
  maxDecimals = MAX_BALANCE_DECIMALS,
): string {
  const trimmed = value.trim();
  if (!trimmed.includes('.')) {
    return trimmed;
  }

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole, fraction = ''] = unsigned.split('.');
  const capped = fraction.slice(0, maxDecimals).replace(/0+$/, '');

  if (!capped) {
    return negative ? `-${whole}` : whole;
  }

  const formatted = `${whole}.${capped}`;
  return negative ? `-${formatted}` : formatted;
}

export function formatUnitsCapped(
  amount: bigint,
  decimals: number,
  maxDecimals = MAX_BALANCE_DECIMALS,
): string {
  return capDecimalPlaces(formatUnits(amount, decimals), maxDecimals);
}
