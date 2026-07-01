import type { ForageEvent, LeaderboardEntry, PlatformStats } from './forage-stats-types';

export function aggregateStats(events: ForageEvent[]): PlatformStats {
  const wallets = new Set(events.map((event) => event.walletAddress.toLowerCase()));

  return {
    totalWldReclaimed: events.reduce((sum, event) => sum + event.wldReceived, 0),
    totalForages: events.length,
    totalForagers: wallets.size,
  };
}

export function buildLeaderboard(events: ForageEvent[]): LeaderboardEntry[] {
  const byWallet = new Map<string, LeaderboardEntry>();

  for (const event of events) {
    const key = event.walletAddress.toLowerCase();
    const existing = byWallet.get(key);

    if (!existing) {
      byWallet.set(key, {
        walletAddress: event.walletAddress,
        username: event.username,
        profilePictureUrl: event.profilePictureUrl,
        totalWld: event.wldReceived,
        forageCount: 1,
        lastForagedAt: event.createdAt,
      });
      continue;
    }

    existing.totalWld += event.wldReceived;
    existing.forageCount += 1;
    if (event.createdAt > existing.lastForagedAt) {
      existing.lastForagedAt = event.createdAt;
      existing.username = event.username ?? existing.username;
      existing.profilePictureUrl =
        event.profilePictureUrl ?? existing.profilePictureUrl;
    }
  }

  return [...byWallet.values()].sort((a, b) => b.totalWld - a.totalWld);
}
