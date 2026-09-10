'use client';

import {
  getTokenIconSources,
  tokenIconHue,
} from '@/lib/token-icons';
import type { WalletToken } from '@/lib/types';
import { useEffect, useMemo, useState } from 'react';

type TokenIconProps = Pick<WalletToken, 'address' | 'symbol' | 'logoUrl'> & {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
};

const sizeMap = {
  xs: 24,
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
  const [loaded, setLoaded] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setLoaded(false);
    setExhausted(false);
  }, [address, logoUrl, sources]);

  const dimensionClass =
    size === 'xs' ? 'h-6 w-6' : size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const frameClass = `relative shrink-0 overflow-hidden rounded-xl border border-forager-border/60 shadow-[0_0_0_1px_rgba(0,0,0,0.2)] ${className}`;
  const currentSource = exhausted ? null : sources[sourceIndex];
  const safeSymbol = symbol?.trim() || 'Token';
  const initials = safeSymbol
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 2)
    .toUpperCase() || '?';
  const hue = tokenIconHue(address);

  const tryNextSource = () => {
    setLoaded(false);
    setSourceIndex((index) => {
      const next = index + 1;
      if (next < sources.length) {
        return next;
      }
      setExhausted(true);
      return index;
    });
  };

  if (!currentSource) {
    return (
      <div
        className={`${dimensionClass} ${frameClass} flex items-center justify-center`}
        style={{
          background: `radial-gradient(circle at 28% 25%, hsl(${hue} 55% 45%), hsl(${hue} 38% 20%) 68%)`,
        }}
        aria-label={`${safeSymbol} icon`}
      >
        <span className="text-[10px] font-semibold tracking-[0.08em] text-white/95">
          {initials}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${dimensionClass} ${frameClass} bg-forager-surface`}
      aria-label={`${symbol} icon`}
    >
      {!loaded ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{
            background: `radial-gradient(circle at 28% 25%, hsl(${hue} 55% 45%), hsl(${hue} 38% 20%) 68%)`,
          }}
          aria-hidden
        >
          <span className="text-[10px] font-semibold tracking-[0.08em] text-white/75">
            {initials}
          </span>
        </div>
      ) : null}

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={currentSource}
        src={currentSource}
        alt=""
        width={dimension}
        height={dimension}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={(event) => {
          const img = event.currentTarget;
          if (img.naturalWidth < 2 || img.naturalHeight < 2) {
            tryNextSource();
            return;
          }
          setLoaded(true);
        }}
        onError={tryNextSource}
      />

      <span className="sr-only">{safeSymbol}</span>
    </div>
  );
}
