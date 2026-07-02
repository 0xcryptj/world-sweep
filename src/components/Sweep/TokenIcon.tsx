'use client';

import { PixelIcon } from '@/components/PixelIcon';
import {
  getTokenIconSources,
  TOKEN_ICON_FALLBACK,
  tokenIconHue,
} from '@/lib/token-icons';
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
  const [remoteVisible, setRemoteVisible] = useState(false);
  const [useSymbolFallback, setUseSymbolFallback] = useState(false);

  useEffect(() => {
    setSourceIndex(0);
    setRemoteVisible(false);
    setUseSymbolFallback(false);
  }, [address, logoUrl, sources]);

  const dimensionClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const frameClass = `relative shrink-0 overflow-hidden rounded-xl bg-app-surface ${className}`;
  const currentSource = sources[sourceIndex];

  const tryNextSource = () => {
    setRemoteVisible(false);
    setSourceIndex((index) => {
      const next = index + 1;
      if (next < sources.length) {
        return next;
      }

      setUseSymbolFallback(true);
      return index;
    });
  };

  const symbolFallback = symbol.trim().slice(0, 3).toUpperCase() || '?';
  const hue = tokenIconHue(address);

  return (
    <div
      className={`${dimensionClass} ${frameClass}`}
      aria-label={`${symbol} icon`}
    >
      <PixelIcon
        name="coin"
        size={dimension}
        variant="light"
        className={`absolute inset-0 m-auto h-[75%] w-[75%] transition-opacity duration-150 ${
          remoteVisible || useSymbolFallback ? 'opacity-0' : 'opacity-100'
        }`}
        alt=""
      />

      {useSymbolFallback ? (
        <div
          className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold uppercase tracking-tight text-white"
          style={{
            backgroundColor: `hsl(${hue} 58% 42%)`,
          }}
          aria-hidden
        >
          {symbolFallback}
        </div>
      ) : null}

      {currentSource && !useSymbolFallback ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={currentSource}
          src={currentSource}
          alt=""
          width={dimension}
          height={dimension}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-150 ${
            remoteVisible ? 'opacity-100' : 'opacity-0'
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
            setRemoteVisible(true);
          }}
          onError={tryNextSource}
        />
      ) : null}

      <span className="sr-only">{symbol}</span>
    </div>
  );
}

export { TOKEN_ICON_FALLBACK };
