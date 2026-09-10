'use client';

import type { AppError } from '@/lib/errors';
import { sanitizeErrorDetails } from '@/lib/safe-error';

type ErrorBannerProps = {
  error: AppError;
  onDismiss?: () => void;
};

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  const safeDetails = sanitizeErrorDetails(error.details);
  return (
    <div
      role="alert"
      className="forager-notice shrink-0 text-[15px] text-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="forager-title">{error.title}</p>
            {error.code && (
              <span className="rounded-full bg-forager-accent/15 px-2 py-0.5 text-[12px] text-forager-accent">
                {error.code.replaceAll('_', ' ')}
              </span>
            )}
          </div>
          <p className="forager-subtitle">{error.message}</p>
          {safeDetails && (
            <p className="rounded-xl bg-forager-bg-elevated px-3 py-2 text-xs text-forager-text-muted">
              {safeDetails}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="forager-text-action"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
