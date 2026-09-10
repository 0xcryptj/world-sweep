import { auth } from '@/auth';
import { verifyForageOnChain } from '@/lib/forage-verify';
import {
  hasForageEventForTx,
  recordForageEvent,
} from '@/lib/forage-stats';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

// The on-chain verification polls the Worldcoin userop API and the World
// Chain RPC for the receipt (short blocks, but indexing can lag a few seconds).
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

type RecordForageRequest = {
  walletAddress: string;
  userOpHash?: string;
  txHash?: string;
  /** Legacy client hints — never recorded; the chain is the source of truth. */
  wldReceivedWei?: string;
  tokensSwapped?: number;
};

const HEX_HASH = /^0x[0-9a-fA-F]{40,80}$/;

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // One authenticated wallet should not be able to spam the public stats store.
  const limit = rateLimit(
    `forage-events:${session.user.walletAddress.toLowerCase()}`,
    20,
    60_000,
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many forage events. Try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(limit.retryAfterMs / 1000)) } },
    );
  }

  try {
    const body = (await request.json()) as RecordForageRequest;

    if (!body.walletAddress) {
      return NextResponse.json(
        { error: 'walletAddress is required' },
        { status: 400 },
      );
    }

    if (
      body.walletAddress.toLowerCase() !==
      session.user.walletAddress.toLowerCase()
    ) {
      return NextResponse.json({ error: 'Wallet mismatch' }, { status: 403 });
    }

    if (body.userOpHash && !HEX_HASH.test(body.userOpHash)) {
      return NextResponse.json({ error: 'Invalid userOpHash' }, { status: 400 });
    }

    if (body.txHash && !HEX_HASH.test(body.txHash)) {
      return NextResponse.json({ error: 'Invalid txHash' }, { status: 400 });
    }

    if (!body.userOpHash && !body.txHash) {
      return NextResponse.json(
        { error: 'userOpHash or txHash is required to verify the forage' },
        { status: 400 },
      );
    }

    // SOURCE OF TRUTH: derive the recorded numbers from the transaction
    // receipt on World Chain. Client-claimed amounts are ignored — a malicious
    // client cannot inflate the leaderboard or global stats.
    const verification = await verifyForageOnChain({
      userWallet: body.walletAddress,
      txHash: body.txHash,
      userOpHash: body.userOpHash,
    });

    if (!verification.ok) {
      return NextResponse.json(
        { error: `Forage not verifiable on-chain: ${verification.reason}` },
        { status: verification.retryable ? 425 : 400 },
      );
    }

    const { verified } = verification;

    // DEDUPE: one on-chain transaction can only ever be recorded once.
    if (await hasForageEventForTx(verified.txHash)) {
      return NextResponse.json(
        { error: 'This transaction has already been recorded' },
        { status: 409 },
      );
    }

    const event = await recordForageEvent({
      walletAddress: body.walletAddress,
      username: session.user.username,
      profilePictureUrl: session.user.profilePictureUrl,
      wldReceivedWei: verified.wldReceivedWei.toString(),
      tokensSwapped: verified.tokensSwapped,
      userOpHash: body.userOpHash,
      txHash: verified.txHash,
    });

    return NextResponse.json({ event });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to record forage';
    // Unique-index violation from a concurrent duplicate insert.
    if (/duplicate key|forage_events_tx_hash/i.test(message)) {
      return NextResponse.json(
        { error: 'This transaction has already been recorded' },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
