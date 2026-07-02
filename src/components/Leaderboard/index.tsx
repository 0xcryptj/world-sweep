'use client';

import {
  formatWldAmount,
  shortenAddress,
  type LeaderboardResponse,
} from '@/lib/forage-stats-types';
import { Marble } from '@worldcoin/mini-apps-ui-kit-react';
import { useEffect, useState } from 'react';

type LeaderboardPanelProps = {
  compact?: boolean;
};

export function LeaderboardPanel({ compact = false }: LeaderboardPanelProps) {
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/leaderboard');
        const payload = (await response.json()) as LeaderboardResponse & {
          error?: string;
        };

        if (!response.ok) {
          throw new Error(payload.error ?? 'Failed to load leaderboard');
        }

        setData(payload);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : 'Failed to load leaderboard',
        );
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <p className="app-subtitle text-sm">Loading leaderboard...</p>
    );
  }

  if (error || !data) {
    return (
      <p className="app-subtitle text-sm">
        {error ?? 'Leaderboard unavailable right now.'}
      </p>
    );
  }

  return (
    <div className="flex w-full flex-col gap-4">
      {!compact ? (
        <div className="grid grid-cols-3 gap-2">
          <MetricCard
            label="WLD reclaimed"
            value={`${formatWldAmount(data.stats.totalWldReclaimed)} WLD`}
          />
          <MetricCard
            label="Forages"
            value={String(data.stats.totalForages)}
          />
          <MetricCard
            label="Foragers"
            value={String(data.stats.totalForagers)}
          />
        </div>
      ) : (
        <p className="app-subtitle text-xs">
          {formatWldAmount(data.stats.totalWldReclaimed)} WLD reclaimed globally
          · {data.stats.totalForagers} foragers
        </p>
      )}

      <div className="app-card rounded-2xl p-4">
        <p className="app-title mb-3 text-base font-semibold">
          Top reclaimers
        </p>

        {data.leaderboard.length === 0 ? (
          <p className="app-subtitle text-sm">
            No forages recorded yet. Be the first to reclaim junk into WLD.
          </p>
        ) : (
          <ol className="space-y-2">
            {data.leaderboard.map((entry, index) => (
              <li
                key={entry.walletAddress}
                className="flex items-center justify-between gap-3 rounded-xl bg-app-bg-elevated px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-5 shrink-0 text-sm font-bold text-app-purple">
                    {index + 1}
                  </span>
                  {entry.profilePictureUrl ? (
                    <Marble src={entry.profilePictureUrl} className="w-9" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-app-surface text-xs font-bold text-app-purple">
                      {entry.username?.slice(0, 1).toUpperCase() ?? '?'}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {entry.username ?? shortenAddress(entry.walletAddress)}
                    </p>
                    <p className="app-subtitle text-xs">
                      {entry.forageCount} forage
                      {entry.forageCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-sm font-semibold text-app-purple">
                  {formatWldAmount(entry.totalWld)} WLD
                </p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="app-card rounded-2xl p-3 text-center">
      <p className="app-subtitle text-[11px] uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-sm font-bold text-app-purple">{value}</p>
    </div>
  );
}
