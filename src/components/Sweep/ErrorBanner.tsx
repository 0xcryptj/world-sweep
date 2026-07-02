'use client';

import type { AppError } from '@/lib/errors';

type ErrorBannerProps = {
  error: AppError;
  onDismiss?: () => void;
};

export function ErrorBanner({ error, onDismiss }: ErrorBannerProps) {
  return (
    <div
      role="alert"
      className="rounded-2xl border border-app-purple/40 bg-app-purple/10 px-4 py-3 text-sm text-foreground"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold">{error.title}</p>
            {error.code && (
              <span className="rounded-full bg-app-purple/20 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-app-purple-bright">
                {error.code.replaceAll('_', ' ')}
              </span>
            )}
          </div>
          <p className="text-app-text-muted">{error.message}</p>
          {error.details && (
            <p className="app-glass-subtle rounded-xl px-3 py-2 text-xs text-app-text-muted">
              {error.details}
            </p>
          )}
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 text-xs font-medium text-app-purple underline"
          >
            Dismiss
          </button>
        )}
      </div>
    </div>
  );
}
