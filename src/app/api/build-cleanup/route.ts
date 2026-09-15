import { auth } from '@/auth';
import { buildCleanupPlan } from '@/lib/cleanup';
import { isCleanupReason } from '@/lib/token-filters';
import { withTimeout } from '@/lib/fetch-with-timeout';
import { queuePortalCleanupSync } from '@/lib/portal-sync';
import { clientKeyFromRequest, rateLimit } from '@/lib/rate-limit';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { isAddress } from 'viem';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const MAX_INPUT_TOKENS = 40;

type BuildCleanupRequest = {
  walletAddress: string;
  tokens: Array<{
    address: string;
    symbol: string;
    name?: string;
    balance?: string;
    reason?: string;
  }>;
};

export async function POST(request: Request) {
  const limit = rateLimit(
    `build-cleanup:${clientKeyFromRequest(request)}`,
    20,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Slow down and try again.' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) },
      },
    );
  }

  try {
    const body = (await request.json()) as BuildCleanupRequest;
    if (!body.walletAddress || !Array.isArray(body.tokens)) {
      return NextResponse.json(
        { error: 'walletAddress and tokens are required' },
        { status: 400 },
      );
    }
    if (!isAddress(body.walletAddress)) {
      return NextResponse.json(
        { error: 'Invalid wallet address' },
        { status: 400 },
      );
    }

    const session = await auth();
    if (
      session?.user?.walletAddress &&
      session.user.walletAddress.toLowerCase() !==
        body.walletAddress.toLowerCase()
    ) {
      return NextResponse.json({ error: 'Wallet mismatch' }, { status: 403 });
    }

    const inputTokens = body.tokens
      .slice(0, MAX_INPUT_TOKENS)
      .filter((token) => isCleanupReason(token.reason));

    queuePortalCleanupSync(
      inputTokens.map((token) => ({
        address: token.address,
        symbol: token.symbol,
      })),
    );

    const plan = await withTimeout(
      buildCleanupPlan({
        walletAddress: body.walletAddress,
        tokens: inputTokens,
      }),
      40_000,
      'Building cleanup timed out. Try again.',
    );

    console.info('[build-cleanup]', {
      walletAddress: body.walletAddress,
      inputTokens: body.tokens.length,
      sentTokens: plan.tokens.length,
      skippedTokens: plan.skippedTokens.length,
      txCount: plan.transactions.length,
    });

    return NextResponse.json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to build cleanup';
    const status = message.includes('timed out') ? 504 : 500;
    return NextResponse.json(
      {
        error: sanitizeErrorMessage(error, 'Could not build this cleanup.'),
      },
      { status },
    );
  }
}
