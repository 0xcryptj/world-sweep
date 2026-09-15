'use client';

import { CubeLoader } from '@/components/CubeLoader';
import { asymptoticPendingProgress } from '@/lib/pending-progress';
import { useEffect, useMemo, useRef, useState } from 'react';

const COMPLETE_SETTLE_MS = 240;

type ForagerActivityProps = {
  title: string;
  messages: string[];
  icon?: 'coin' | 'swap' | 'home' | 'wallet' | 'user';
  className?: string;
  durationMs?: number;
  variant?: 'scan' | 'default';
  complete?: boolean;
};

export function ForagerActivity({
  title,
  messages,
  className = '',
  durationMs = 12_000,
  variant = 'default',
  complete = false,
}: ForagerActivityProps) {
  const [timedProgress, setTimedProgress] = useState(0);
  const progressRef = useRef(0);
  const safeMessages = messages.length > 0 ? messages : ['Please wait...'];
  const messageKey = safeMessages.join('|');
  const isScan = variant === 'scan';

  useEffect(() => {
    progressRef.current = timedProgress;
  }, [timedProgress]);

  // Continuous asymptote while work is in flight — never parks at a fixed %.
  useEffect(() => {
    if (complete) {
      return;
    }

    setTimedProgress(0);
    progressRef.current = 0;
    const start = performance.now();
    let frame = 0;

    const tick = (now: number) => {
      const next = asymptoticPendingProgress(now - start, durationMs);
      progressRef.current = next;
      setTimedProgress(next);
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [complete, durationMs, title, messageKey]);

  // Real work finished — accelerate smoothly from current value to 100%.
  useEffect(() => {
    if (!complete) {
      return;
    }

    let frame = 0;
    const from = progressRef.current;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COMPLETE_SETTLE_MS);
      const eased = 1 - (1 - t) ** 2;
      const next = from + (1 - from) * eased;
      progressRef.current = next;
      setTimedProgress(next);
      if (t < 1) {
        frame = window.requestAnimationFrame(tick);
      } else {
        progressRef.current = 1;
        setTimedProgress(1);
      }
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [complete]);

  // Phase index tracks progress bands — not a random message carousel.
  const messageIndex = useMemo(() => {
    if (safeMessages.length <= 1) {
      return 0;
    }
    const band = 1 / safeMessages.length;
    const index = Math.min(
      safeMessages.length - 1,
      Math.floor(timedProgress / band),
    );
    return index;
  }, [safeMessages.length, timedProgress]);

  return (
    <div
      className={`forager-activity-overlay ${className}`}
      role="status"
      aria-live="polite"
      aria-busy={!complete}
    >
      <div
        className={`forager-activity-card ${isScan ? 'forager-activity-card-scan' : ''}`}
      >
        <div className="forager-activity-stage">
          <CubeLoader size={isScan ? 'md' : 'sm'} />
        </div>

        <div className="forager-activity-copy">
          <p className="forager-title text-[16px] leading-snug tracking-[-0.015em]">
            {title}
          </p>

          {isScan && title === 'Scanning wallet' ? (
            <p className="forager-subtitle max-w-[26ch] px-1 text-[12px] leading-relaxed">
              Please wait — this usually takes a few seconds
            </p>
          ) : isScan && (title === 'Building preview' || title === 'Quoting tokens') ? (
            <p className="forager-subtitle max-w-[26ch] px-1 text-[12px] leading-relaxed">
              Checking routes and locking your WLD estimate
            </p>
          ) : null}

          {isScan && safeMessages.length > 1 ? (
            <div className="forager-scan-phases" aria-hidden>
              {safeMessages.map((_, index) => (
                <span
                  key={index}
                  className={`forager-scan-phase-dot ${
                    index <= messageIndex ? 'forager-scan-phase-dot-active' : ''
                  }`}
                />
              ))}
            </div>
          ) : null}

          <p
            key={`${title}-${messageIndex}`}
            className="forager-activity-message forager-subtitle text-[13px] leading-relaxed"
          >
            {safeMessages[messageIndex]}
          </p>
        </div>
      </div>
    </div>
  );
}

export function TokenListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="forager-group-row flex items-center gap-3 px-4 py-3.5"
        >
          <div className="forager-skeleton-block h-[22px] w-[22px] shrink-0 rounded-full" />
          <div className="forager-skeleton-block h-9 w-9 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="forager-skeleton-block h-3.5 w-16 rounded-full" />
            <div className="forager-skeleton-block h-2.5 w-28 rounded-full" />
          </div>
          <div className="forager-skeleton-block h-3 w-12 shrink-0 rounded-full" />
        </div>
      ))}
    </div>
  );
}
