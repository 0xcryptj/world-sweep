'use client';

import { TokenIcon } from '@/components/Sweep/TokenIcon';
import { TokenBadge } from '@/components/TokenBadge';
import {
  formatPctChange,
  formatTokenUsd,
  tokenUsdValue,
} from '@/lib/format-token-value';
import { cn } from '@/lib/utils';
import type { CSSProperties, ReactNode } from 'react';

export type TokenListRowData = {
  address: string;
  symbol: string;
  name?: string;
  balanceFormatted: string;
  logoUrl?: string | null;
  priceUsd?: number | null;
  priceChange24h?: number | null;
  cachedRoute?: { amountOut?: string } | null;
  quoteWldWei?: string | null;
};

type TokenListRowProps = {
  token: TokenListRowData;
  selected?: boolean;
  disabled?: boolean;
  verified?: boolean;
  verifiedTone?: 'verified' | 'pending';
  onToggle?: () => void;
  accessory?: ReactNode;
  className?: string;
  style?: CSSProperties;
  detail?: string;
  wldUsd?: number | null;
};

export function TokenListRow({
  token,
  selected = false,
  disabled = false,
  verified = false,
  verifiedTone = 'verified',
  onToggle,
  accessory,
  className,
  style,
  wldUsd,
  detail,
}: TokenListRowProps) {
  const usd = formatTokenUsd(tokenUsdValue(token, wldUsd));
  const change = formatPctChange(token.priceChange24h);
  const changeTone =
    token.priceChange24h == null
      ? ''
      : token.priceChange24h < 0
        ? 'forager-chg-down'
        : 'forager-chg-up';

  const content = (
    <>
      {onToggle && !disabled ? (
        <span
          className="forager-token-check"
          data-checked={selected ? 'true' : 'false'}
          aria-hidden
        />
      ) : null}
      <TokenIcon
        size="md"
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="forager-wallet-ticker truncate">{token.symbol}</p>
          {verified ? (
            <TokenBadge label="Verified" tone={verifiedTone} icon />
          ) : null}
        </div>
        <p className="forager-wallet-qty truncate">{token.balanceFormatted}</p>
        {detail ? (
          <p className="truncate text-[12px] leading-snug text-forager-text-muted">
            {detail}
          </p>
        ) : null}
      </div>
      <div className="shrink-0 text-right">
        <p className="forager-wallet-usd">{usd || '—'}</p>
        {change ? (
          <p className={cn('forager-wallet-chg', changeTone)}>{change}</p>
        ) : (
          <p className="forager-wallet-chg forager-wallet-chg-empty"> </p>
        )}
      </div>
      {accessory}
    </>
  );

  if (onToggle && !disabled) {
    return (
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${token.symbol} to forage into WLD`}
        className={cn(
          'forager-wallet-row forager-token-row forager-row-enter',
          selected && 'forager-wallet-row-selected forager-token-row-selected',
          className,
        )}
        style={style}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'forager-wallet-row forager-row-enter',
        disabled && 'forager-wallet-row-locked',
        className,
      )}
      style={style}
    >
      {content}
    </div>
  );
}
