'use client';

import { asymptoticPendingProgress } from '@/lib/pending-progress';
import { useEffect, useState, type ReactNode } from 'react';

type ProgressRingProps = {
  /** 0–1 when the caller knows real progress. Omit for timed fill. */
  progress?: number;
  /**
   * Characteristic time for uncontrolled asymptotic fill (not a freeze point).
   * Progress keeps creeping until the parent unmounts or passes real progress.
   */
  durationMs?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children?: ReactNode;
};

/**
 * Circular edge-fill indicator. Prefer a real `progress` value when available;
 * otherwise uses a continuous asymptote that never parks at a fixed percent.
 */
export function ProgressRing({
  progress: controlledProgress,
  durationMs = 12_000,
  size = 72,
  strokeWidth = 3.5,
  className = '',
  children,
}: ProgressRingProps) {
  const [timedProgress, setTimedProgress] = useState(0);
  const isControlled = typeof controlledProgress === 'number';

  useEffect(() => {
    if (isControlled) {
      return;
    }

    setTimedProgress(0);
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      setTimedProgress(asymptoticPendingProgress(now - start, durationMs));
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [durationMs, isControlled]);

  const progress = Math.min(
    1,
    Math.max(0, isControlled ? controlledProgress : timedProgress),
  );

  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  return (
    <div
      className={`forager-progress-ring ${className}`}
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <svg
        className="forager-progress-ring-svg"
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden
      >
        <circle
          className="forager-progress-ring-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
        />
        <circle
          className="forager-progress-ring-fill"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      {children ? (
        <div className="forager-progress-ring-center">{children}</div>
      ) : null}
    </div>
  );
}
