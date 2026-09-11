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
}: TokenListRowProps) {
  const usd = formatTokenUsd(tokenUsdValue(token));
  const change = formatPctChange(token.priceChange24h);
  const changeTone =
    token.priceChange24h == null
      ? ''
      : token.priceChange24h < 0
        ? 'forager-chg-down'
        : 'forager-chg-up';

  const content = (
    <>
      <TokenIcon
        size="md"
        address={token.address}
        symbol={token.symbol}
        logoUrl={token.logoUrl}
        badge
      />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="forager-wallet-ticker truncate">{token.symbol}</p>
          {verified ? (
            <TokenBadge label="Verified" tone={verifiedTone} icon />
          ) : null}
        </div>
        <p className="forager-wallet-qty truncate">{token.balanceFormatted}</p>
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
        className={cn(
          'forager-wallet-row forager-row-enter',
          selected && 'forager-wallet-row-selected',
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
