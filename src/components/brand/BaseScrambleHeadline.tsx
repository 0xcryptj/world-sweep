'use client';

import { useSplashRevealed } from '@/components/SplashScreen/splash-reveal';
import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import {
  BASE_SCRAMBLE_EASE,
  scrambleDurationMs,
  scrambleReel,
  shouldScrambleHeadline,
  splitHeadlineTokens,
} from '@/lib/brand/base-scramble';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);
  return reduced;
}

type HeadlineTag = 'h1' | 'h2' | 'span';

/**
 * Base “tech scramble”: cascading vertical glyph swaps that resolve
 * into the headline (brand.base.org/motion). Medium weight, <800ms.
 */
export function BaseScrambleHeadline({
  text,
  className,
  as: Tag = 'span',
  deferUntilReveal = false,
}: {
  text: string;
  className?: string;
  as?: HeadlineTag;
  deferUntilReveal?: boolean;
}) {
  const revealed = useSplashRevealed();
  const canPlay = !deferUntilReveal || revealed;
  const reduced = usePrefersReducedMotion();
  const [settled, setSettled] = useState(false);
  const allowed = shouldScrambleHeadline(text);
  const tokens = useMemo(() => splitHeadlineTokens(text), [text]);
  const glyphCount = useMemo(
    () => tokens.reduce((n, token) => n + (/\s/.test(token) ? 0 : token.length), 0),
    [tokens],
  );
  const timing = useMemo(() => scrambleDurationMs(glyphCount), [glyphCount]);

  useEffect(() => {
    if (!canPlay) {
      return;
    }
    setSettled(false);
    if (!allowed || reduced) {
      return;
    }
    const timer = window.setTimeout(() => setSettled(true), timing.totalMs);
    return () => window.clearTimeout(timer);
  }, [allowed, canPlay, reduced, text, timing.totalMs]);

  const headlineClass = cn('forager-wordmark', className);

  if (!canPlay) {
    return (
      <Tag className={headlineClass} style={{ fontWeight: 500, opacity: 0 }} aria-hidden>
        {text}
      </Tag>
    );
  }

  if (reduced || !allowed || settled) {
    return (
      <Tag className={headlineClass} style={{ fontWeight: 500 }}>
        {text}
      </Tag>
    );
  }

  let scrambleIndex = 0;

  return (
    <Tag
      className={cn('base-scramble-headline', headlineClass)}
      aria-label={text}
      data-base-scramble="running"
      data-base-scramble-ms={timing.totalMs}
      style={{ fontWeight: 500 }}
    >
      {tokens.map((token, ti) => {
        if (/\s/.test(token)) {
          return <span key={`space-${ti}`}> </span>;
        }
        return (
          <span key={`word-${ti}`} className="base-scramble-word">
            {token.split('').map((ch, ci) => {
              const delay = scrambleIndex * timing.staggerMs;
              const seed = scrambleIndex;
              scrambleIndex += 1;
              const reel = scrambleReel(ch, seed);
              return (
                <span
                  key={`${ch}-${ci}`}
                  className="base-scramble-cell"
                  aria-hidden
                >
                  <span
                    className="base-scramble-reel"
                    style={{
                      animationDuration: `${timing.charMs}ms`,
                      animationDelay: `${delay}ms`,
                      animationTimingFunction: BASE_SCRAMBLE_EASE,
                      ['--scramble-to' as string]: `calc(${reel.length - 1} * -1.5em)`,
                    }}
                  >
                    {reel.map((glyph, gi) => (
                      <span key={`${glyph}-${gi}`} className="base-scramble-glyph">
                        {glyph}
                      </span>
                    ))}
                  </span>
                </span>
              );
            })}
          </span>
        );
      })}
    </Tag>
  );
}
