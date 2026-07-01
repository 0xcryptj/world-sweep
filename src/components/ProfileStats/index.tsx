'use client';

import { LeaderboardPanel } from '@/components/Leaderboard';
import {
  formatWldAmount,
  shortenAddress,
  type LeaderboardResponse,
} from '@/lib/forage-stats-types';
import { Marble } from '@worldcoin/mini-apps-ui-kit-react';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

export function ProfileStats() {
  const { data: session } = useSession();
  const [data, setData] = useState<LeaderboardResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch('/api/leaderboard');
        const payload = (await response.json()) as LeaderboardResponse;
        if (response.ok) {
          setData(payload);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const user = session?.user;

  if (!user) {
    return null;
  }

  return (
    <div className="flex w-full flex-col gap-4">
      <div className="forager-card flex items-center gap-4 rounded-2xl p-4">
        <Marble src={user.profilePictureUrl} className="w-16" />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold capitalize">
            {user.username}
          </p>
          <p className="forager-subtitle text-sm">
            {shortenAddress(user.walletAddress)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatCard
          label="WLD reclaimed"
          value={
            loading
              ? '…'
              : `${formatWldAmount(data?.userRank?.totalWld ?? 0)} WLD`
          }
        />
        <StatCard
          label="Rank"
          value={
            loading
              ? '…'
              : data?.userRankPosition
                ? `#${data.userRankPosition}`
                : 'Unranked'
          }
        />
      </div>

      {!loading && !data?.userRank ? (
        <p className="forager-subtitle rounded-2xl border border-forager-border bg-forager-bg-elevated px-4 py-3 text-sm">
          Complete your first successful forage from Home to appear on the
          leaderboard.
        </p>
      ) : null}

      <LeaderboardPanel compact />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="forager-card rounded-2xl p-4">
      <p className="forager-subtitle text-xs">{label}</p>
      <p className="mt-1 text-lg font-bold text-forager-purple">{value}</p>
    </div>
  );
}
