import { buildSweepPlan } from '@/lib/sweep';
import { isForageableToken } from '@/lib/token-filters';
import type { WalletToken } from '@/lib/types';
import { NextResponse } from 'next/server';

type BuildSweepRequest = {
  walletAddress: string;
  tokens: WalletToken[];
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as BuildSweepRequest;

    if (!body.walletAddress || !Array.isArray(body.tokens)) {
      return NextResponse.json(
        { error: 'walletAddress and tokens are required' },
        { status: 400 },
      );
    }

    const plan = await buildSweepPlan({
      walletAddress: body.walletAddress,
      tokens: body.tokens.filter(isForageableToken),
    });

    return NextResponse.json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to build sweep plan';
    const status = message.includes('No selected tokens have a swappable route')
      ? 422
      : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
