'use client';

import type { PixelIconName } from '@/lib/pixel-icons';
import { PixelIcon } from '@/components/PixelIcon';
import { useEffect, useState } from 'react';

type AppActivityProps = {
  title: string;
  messages: string[];
  icon?: PixelIconName;
  className?: string;
};

export function AppActivity({
  title,
  messages,
  icon = 'coin',
  className = '',
}: AppActivityProps) {
  const [messageIndex, setMessageIndex] = useState(0);
  const safeMessages = messages.length > 0 ? messages : ['Please wait...'];

  useEffect(() => {
    setMessageIndex(0);
  }, [title, safeMessages.join('|')]);

  useEffect(() => {
    if (messages.length <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setMessageIndex((current) => (current + 1) % messages.length);
    }, 2600);

    return () => window.clearInterval(timer);
  }, [messages]);

  return (
    <div
      className={`app-activity-overlay ${className}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="app-activity-card app-card">
        <div className="app-activity-icon-wrap">
          <div className="app-activity-ring" aria-hidden />
          <PixelIcon
            name={icon}
            size={40}
            variant="light"
            className="app-activity-icon"
            alt=""
          />
        </div>

        <p className="app-title text-base font-semibold">{title}</p>
        <p
          key={messageIndex}
          className="app-activity-message app-subtitle text-sm"
        >
          {safeMessages[messageIndex]}
        </p>

        <div className="flex items-center justify-center gap-1.5 pt-1">
          <span className="app-activity-dot" />
          <span className="app-activity-dot app-activity-dot-2" />
          <span className="app-activity-dot app-activity-dot-3" />
        </div>
      </div>
    </div>
  );
}

export function TokenListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-1.5" aria-hidden>
      {Array.from({ length: rows }, (_, index) => (
        <div
          key={index}
          className="app-card app-skeleton-row flex items-center gap-2.5 rounded-2xl px-3 py-2"
        >
          <div className="app-skeleton-block h-4 w-4 shrink-0 rounded" />
          <div className="app-skeleton-block h-8 w-8 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="app-skeleton-block h-3.5 w-16 rounded" />
            <div className="app-skeleton-block h-2.5 w-28 rounded" />
          </div>
          <div className="app-skeleton-block h-3 w-12 shrink-0 rounded" />
        </div>
      ))}
    </div>
  );
}
