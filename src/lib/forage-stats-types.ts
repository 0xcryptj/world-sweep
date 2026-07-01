export type ForageEvent = {
  id: string;
  walletAddress: string;
  username: string | null;
  profilePictureUrl: string | null;
  wldReceivedWei: string;
  wldReceived: number;
  tokensSwapped: number;
  userOpHash: string | null;
  txHash: string | null;
  createdAt: string;
};

export type LeaderboardEntry = {
  walletAddress: string;
  username: string | null;
  profilePictureUrl: string | null;
  totalWld: number;
  forageCount: number;
  lastForagedAt: string;
};

export type PlatformStats = {
  totalWldReclaimed: number;
  totalForages: number;
  totalForagers: number;
};

export type LeaderboardResponse = {
  stats: PlatformStats;
  leaderboard: LeaderboardEntry[];
  userRank: LeaderboardEntry | null;
  userRankPosition: number | null;
};

export function formatWldAmount(amount: number): string {
  if (amount >= 1_000_000) {
    return `${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `${(amount / 1_000).toFixed(2)}K`;
  }
  if (amount >= 100) {
    return amount.toFixed(2);
  }
  if (amount >= 1) {
    return amount.toFixed(3);
  }
  return amount.toFixed(6);
}

export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
