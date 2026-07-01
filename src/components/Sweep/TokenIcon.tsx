'use client';

import { PIXEL_ICONS } from '@/lib/pixel-icons';
import { getTokenIconSources } from '@/lib/token-icons';
import type { WalletToken } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';

type TokenIconProps = Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'> & {
  className?: string;
  size?: 'sm' | 'md';
};

const sizeMap = {
  sm: 32,
  md: 40,
} as const;

export function TokenIcon({
  address,
  symbol,
  logoUrl,
  className = '',
  size = 'md',
}: TokenIconProps) {
  const dimension = sizeMap[size];
  const sources = useMemo(
    () => getTokenIconSources({ address, symbol, logoUrl }),
    [address, logoUrl, symbol],
  );

  const [sourceIndex, setSourceIndex] = useState(0);
  const [useFallback, setUseFallback] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setUseFallback(false);
  }, [address, logoUrl, sources]);

  const dimensionClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const frameClass = `shrink-0 overflow-hidden rounded-xl bg-forager-surface ${className}`;

  if (useFallback) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={PIXEL_ICONS.coin}
        alt={`${symbol} icon`}
        width={dimension}
        height={dimension}
        className={`${dimensionClass} icon-light object-contain p-1 ${frameClass}`}
        aria-hidden
      />
    );
  }

  if (sources.length === 0) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={PIXEL_ICONS.coin}
        alt={`${symbol} icon`}
        width={dimension}
        height={dimension}
        className={`${dimensionClass} icon-light object-contain p-1 ${frameClass}`}
        aria-hidden
      />
    );
  }

  const currentSource = sources[sourceIndex];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={currentSource}
      alt={`${symbol} icon`}
      width={dimension}
      height={dimension}
      className={`${dimensionClass} object-cover ${frameClass}`}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => {
        setSourceIndex((index) => {
          const next = index + 1;
          if (next >= sources.length) {
            setUseFallback(true);
            return index;
          }
          return next;
        });
      }}
    />
  );
}
