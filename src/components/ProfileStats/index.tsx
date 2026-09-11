'use client';

import { LeaderboardPanel } from '@/components/Leaderboard';
import { InvitePanel } from '@/components/Growth/InvitePanel';
import { NotifyOptIn } from '@/components/Growth/NotifyOptIn';
import { WidgetPrompt } from '@/components/Growth/WidgetPrompt';
import {
  formatWldAmount,
  type LeaderboardResponse,
} from '@/lib/forage-stats-types';
import { apiPath } from '@/lib/base-path';
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
        const response = await fetch(apiPath('/leaderboard'));
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
    <div className="forager-page-stack">
      <div className="forager-group flex items-center gap-4 px-4 py-4">
        <Marble src={user.profilePictureUrl} className="w-14" />
        <div className="min-w-0">
          <p className="truncate text-[20px] font-semibold capitalize tracking-[-0.45px]">
            {user.username}
          </p>
          <p className="mt-1 text-[15px] text-forager-text-muted">
            Signed in with World App
          </p>
        </div>
      </div>

      <div className="forager-group grid grid-cols-2">
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
        <p className="forager-notice text-[15px] leading-snug text-forager-text-muted">
          Complete your first successful forage from Home to appear on the
          leaderboard.
        </p>
      ) : null}

      <InvitePanel />
      <NotifyOptIn />
      <WidgetPrompt />

      <LeaderboardPanel compact />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-4 shadow-[inset_0.5px_0_0_var(--forager-separator)] first:shadow-none">
      <p className="text-[13px] text-forager-text-muted">{label}</p>
      <p className="forager-value-green mt-1 text-[17px]">{value}</p>
    </div>
  );
}
