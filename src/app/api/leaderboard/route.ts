import { auth } from '@/auth';
import { getLeaderboardData } from '@/lib/forage-stats';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth();
    const data = await getLeaderboardData(session?.user?.walletAddress);
    return NextResponse.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to load leaderboard';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
