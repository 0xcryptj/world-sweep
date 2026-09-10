'use client';

import {
  formatWldAmount,
  shortenAddress,
  type LeaderboardResponse,
} from '@/lib/forage-stats-types';
import { BRAND_COPY } from '@/lib/branding';
import { apiPath } from '@/lib/base-path';
import { SectionHeader } from '@/components/SectionHeader';
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
        const response = await fetch(apiPath('/leaderboard'));
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
      <p className="forager-subtitle text-sm">Loading leaderboard...</p>
    );
  }

  if (error || !data) {
    return (
      <p className="forager-subtitle text-sm">
        {error ?? 'Leaderboard unavailable right now.'}
      </p>
    );
  }

  return (
    <div className="forager-section">
      {!compact ? (
        <div className="grid grid-cols-3 gap-3">
          <MetricCard
            label={BRAND_COPY.globalReclaimed}
            value={`${formatWldAmount(data.stats.totalWldReclaimed)} WLD`}
            brass
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
        <SectionHeader title="Leaderboard" />
      )}

      <div className="forager-group">
        {data.leaderboard.length === 0 ? (
          <p className="px-4 py-4 text-[15px] text-forager-text-muted">
            No forages recorded yet. Be the first to reclaim junk into WLD.
          </p>
        ) : (
          data.leaderboard.map((entry, index) => (
            <div
              key={entry.walletAddress}
              className="forager-group-row flex items-center justify-between gap-3 px-4 py-3.5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="forager-value-green w-5 shrink-0 text-[15px]">
                  {index + 1}
                </span>
                {entry.profilePictureUrl ? (
                  <Marble src={entry.profilePictureUrl} className="w-9" />
                ) : (
                  <div className="forager-title flex h-9 w-9 items-center justify-center rounded-full bg-forager-surface text-xs text-forager-accent">
                    {entry.username?.slice(0, 1).toUpperCase() ?? '?'}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="forager-title truncate text-[17px]">
                    {entry.username ?? shortenAddress(entry.walletAddress)}
                  </p>
                  <p className="mt-0.5 text-[13px] text-forager-text-muted">
                    {entry.forageCount} forage
                    {entry.forageCount === 1 ? '' : 's'}
                  </p>
                </div>
              </div>
              <p className="forager-value-brass shrink-0 text-[15px]">
                {formatWldAmount(entry.totalWld)} WLD
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  brass = false,
}: {
  label: string;
  value: string;
  brass?: boolean;
}) {
  return (
    <div className="forager-group p-3 text-center">
      <p className="text-[12px] text-forager-text-muted">{label}</p>
      <p
        className={`mt-1 text-sm ${
          brass ? 'forager-value-brass' : 'forager-value-green'
        }`}
      >
        {value}
      </p>
    </div>
  );
}
