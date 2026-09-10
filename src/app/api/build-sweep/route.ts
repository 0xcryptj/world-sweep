import { auth } from '@/auth';
import { isPermit2Allowlisted } from '@/lib/allowlist';
import { buildSweepPlan } from '@/lib/sweep';
import { isForageableToken } from '@/lib/token-filters';
import type { WalletToken } from '@/lib/types';
import { withTimeout } from '@/lib/fetch-with-timeout';
import { sanitizeErrorMessage } from '@/lib/safe-error';
import { clientKeyFromRequest, rateLimit } from '@/lib/rate-limit';
import { loadDynamicAllowlistAddresses } from '@/lib/portal-allowlist-store';
import { queuePortalAllowlistSync } from '@/lib/portal-sync';
import { isAddress } from 'viem';
import { NextResponse } from 'next/server';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

/** Hard cap on client-supplied tokens to bound RPC fan-out per request. */
const MAX_INPUT_TOKENS = 40;

type BuildSweepRequest = {
  walletAddress: string;
  tokens: WalletToken[];
};

export async function POST(request: Request) {
  const traceId = crypto.randomUUID();

  // Expensive route (many RPC calls per token) — brake abusive callers.
  const limit = rateLimit(`build-sweep:${clientKeyFromRequest(request)}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Slow down and try again.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as BuildSweepRequest;

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

    // Defense-in-depth: if the caller is authenticated, the batch (approvals +
    // swaps + fee transfer) must be built for their own wallet — never let an
    // authenticated session mint calldata that routes another wallet's swap
    // output to an attacker-chosen recipient.
    const session = await auth();
    if (
      session?.user?.walletAddress &&
      session.user.walletAddress.toLowerCase() !==
        body.walletAddress.toLowerCase()
    ) {
      return NextResponse.json(
        { error: 'Wallet mismatch' },
        { status: 403 },
      );
    }

    await loadDynamicAllowlistAddresses().catch(() => []);

    const inputTokens = body.tokens.slice(0, MAX_INPUT_TOKENS).filter(isForageableToken);

    const pendingAllowlist = inputTokens.filter(
      (token) => !isPermit2Allowlisted(token.address),
    );
    if (pendingAllowlist.length > 0) {
      queuePortalAllowlistSync(
        pendingAllowlist.map((token) => ({
          address: token.address,
          symbol: token.symbol,
        })),
      );
    }

    const plan = await withTimeout(
      buildSweepPlan({
        walletAddress: body.walletAddress,
        tokens: inputTokens,
      }),
      45_000,
      'Building the forage batch timed out. Try fewer tokens.',
    );

    console.info('[build-sweep]', {
      traceId,
      walletAddress: body.walletAddress,
      inputTokens: body.tokens.length,
      quotedTokens: plan.quotes.length,
      skippedTokens: plan.skippedTokens.length,
      txCount: plan.transactions.length,
    });

    return NextResponse.json(plan);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to build sweep plan';
    console.error('[build-sweep] failed', {
      traceId,
      message,
    });
    const status = message.includes('timed out') ? 504 : 500;
    return NextResponse.json(
      { error: sanitizeErrorMessage(error, 'Failed to build the forage batch.'), traceId },
      { status },
    );
  }
}
