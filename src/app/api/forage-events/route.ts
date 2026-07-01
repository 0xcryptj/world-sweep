import { auth } from '@/auth';
import { recordForageEvent } from '@/lib/forage-stats';
import { NextResponse } from 'next/server';

type RecordForageRequest = {
  walletAddress: string;
  wldReceivedWei: string;
  tokensSwapped: number;
  userOpHash?: string;
  txHash?: string;
};

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user?.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as RecordForageRequest;

    if (!body.walletAddress || !body.wldReceivedWei || !body.tokensSwapped) {
      return NextResponse.json(
        { error: 'walletAddress, wldReceivedWei, and tokensSwapped are required' },
        { status: 400 },
      );
    }

    if (
      body.walletAddress.toLowerCase() !==
      session.user.walletAddress.toLowerCase()
    ) {
      return NextResponse.json({ error: 'Wallet mismatch' }, { status: 403 });
    }

    const event = await recordForageEvent({
      walletAddress: body.walletAddress,
      username: session.user.username,
      profilePictureUrl: session.user.profilePictureUrl,
      wldReceivedWei: body.wldReceivedWei,
      tokensSwapped: body.tokensSwapped,
      userOpHash: body.userOpHash,
      txHash: body.txHash,
    });

    return NextResponse.json({ event });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to record forage';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
