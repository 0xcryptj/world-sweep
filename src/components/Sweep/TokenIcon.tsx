'use client';

import { DEFAULT_TOKEN_ICON, resolveTokenIconUrl } from '@/lib/token-icons';
import type { WalletToken } from '@/lib/types';
import Image from 'next/image';
import { useMemo, useState } from 'react';

type TokenIconProps = Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'> & {
  className?: string;
};

function initials(symbol: string): string {
  const cleaned = symbol.replace(/[^a-zA-Z0-9]/g, '').slice(0, 3);
  return cleaned.length > 0 ? cleaned.toUpperCase() : '?';
}

export function TokenIcon({
  address,
  symbol,
  logoUrl,
  className = '',
}: TokenIconProps) {
  const sources = useMemo(() => {
    const primary = resolveTokenIconUrl({ address, symbol, logoUrl });
    const fallbacks = [DEFAULT_TOKEN_ICON].filter((src) => src !== primary);

    return [primary, ...fallbacks];
  }, [address, logoUrl, symbol]);

  const [sourceIndex, setSourceIndex] = useState(0);
  const currentSource = sources[sourceIndex] ?? DEFAULT_TOKEN_ICON;
  const isRemote = currentSource.startsWith('http');

  const isPixelIcon = !isRemote && currentSource.endsWith('.svg');

  if (symbol === 'UNKNOWN' && currentSource === DEFAULT_TOKEN_ICON) {
    return (
      <div
        className={`flex h-10 w-10 items-center justify-center rounded-xl border border-forager-border bg-forager-bg-elevated text-xs font-bold text-forager-purple ${className}`}
        aria-hidden
      >
        {initials(symbol)}
      </div>
    );
  }

  if (isRemote) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={currentSource}
        alt={`${symbol} icon`}
        className={`h-10 w-10 rounded-lg object-cover ${className}`}
        loading="lazy"
        onError={() => {
          setSourceIndex((index) => index + 1);
        }}
      />
    );
  }

  return (
    <Image
      src={currentSource}
      alt={`${symbol} icon`}
      width={40}
      height={40}
      className={`h-10 w-10 object-contain p-0.5 ${isPixelIcon ? 'icon-light' : ''} ${className}`}
      onError={() => {
        setSourceIndex((index) => index + 1);
      }}
    />
  );
}
