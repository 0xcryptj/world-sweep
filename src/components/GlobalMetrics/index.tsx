'use client';

import { NumberTicker } from '@/components/magicui/number-ticker';
import { ShineBorder } from '@/components/ui/shine-border';
import { formatWldAmount, type LeaderboardResponse } from '@/lib/forage-stats-types';
import { apiPath } from '@/lib/base-path';
import { useEffect, useState } from 'react';

type GlobalMetricsProps = {
  compact?: boolean;
};

export function GlobalMetrics({ compact = false }: GlobalMetricsProps) {
  const [data, setData] = useState<LeaderboardResponse['stats'] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(apiPath('/leaderboard'));
        const payload = (await response.json()) as LeaderboardResponse & {
          error?: string;
        };
        if (response.ok) {
          setData(payload.stats);
        }
      } catch {
        // Strip renders nothing on failure; stats are non-critical.
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div
        className="forager-group forager-skeleton-block h-[56px]"
        aria-hidden
      />
    );
  }

  if (!data) {
    return null;
  }

  if (compact) {
    return (
      <p className="text-center text-[13px] text-forager-text-muted">
        <b className="font-semibold text-foreground">
          {formatWldAmount(data.totalWldReclaimed)} WLD
        </b>{' '}
        reclaimed · {data.totalForagers} forager
        {data.totalForagers === 1 ? '' : 's'}
      </p>
    );
  }

  const decimals =
    data.totalWldReclaimed >= 100 ? 2 : data.totalWldReclaimed >= 1 ? 3 : 4;

  return (
    <div className="forager-group relative grid grid-cols-3 items-stretch overflow-hidden">
      <ShineBorder
        borderWidth={1}
        duration={12}
        shineColor={['transparent', '#ffffff', 'transparent']}
      />
      <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5">
        <div className="flex min-w-0 items-baseline gap-1">
          <NumberTicker
            value={data.totalWldReclaimed}
            decimalPlaces={decimals}
            className="forager-numeric text-[17px] font-semibold"
          />
          <span className="shrink-0 text-[13px] text-forager-text-muted">WLD</span>
        </div>
        <span className="text-[13px] text-forager-text-muted">Reclaimed</span>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5 shadow-[inset_0.5px_0_0_var(--forager-separator)]">
        <NumberTicker
          value={data.totalForages}
          className="forager-value-green text-[17px] font-semibold"
        />
        <span className="text-[13px] text-forager-text-muted">
          Forage{data.totalForages === 1 ? '' : 's'}
        </span>
      </div>
      <div className="flex min-w-0 flex-col justify-center gap-1 px-4 py-3.5 shadow-[inset_0.5px_0_0_var(--forager-separator)]">
        <NumberTicker
          value={data.totalForagers}
          className="forager-numeric text-[17px] font-semibold"
        />
        <span className="text-[13px] text-forager-text-muted">
          Forager{data.totalForagers === 1 ? '' : 's'}
        </span>
      </div>
    </div>
  );
}
