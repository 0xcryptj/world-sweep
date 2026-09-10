'use client';

import { capDecimalPlaces } from '@/lib/format-balance';
import { formatWld } from '@/lib/sweep';
import { useEffect, useRef, useState } from 'react';

const COUNT_UP_MS = 650;

/**
 * Renders a WLD amount (wei string) with a brief count-up animation when the
 * value changes. Falls back to the exact formatted value once settled so the
 * displayed number always matches formatWld output.
 */
export function AnimatedWld({
  amountWei,
  className = '',
}: {
  amountWei: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(() => formatWld(amountWei));
  const previousRef = useRef(0);
  const frameRef = useRef(0);

  useEffect(() => {
    const target = Number(amountWei) / 1e18;
    const from = previousRef.current;
    previousRef.current = target;

    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!Number.isFinite(target) || target === from || reducedMotion) {
      setDisplay(formatWld(amountWei));
      return;
    }

    const start = performance.now();

    const tick = (now: number) => {
      const progress = Math.min((now - start) / COUNT_UP_MS, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      if (progress >= 1) {
        setDisplay(formatWld(amountWei));
        return;
      }
      const value = from + (target - from) * eased;
      setDisplay(`${capDecimalPlaces(value.toFixed(5))} WLD`);
      frameRef.current = requestAnimationFrame(tick);
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameRef.current);
  }, [amountWei]);

  return <span className={`forager-numeric ${className}`}>{display}</span>;
}
