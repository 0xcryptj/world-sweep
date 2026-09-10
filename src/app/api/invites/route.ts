import { auth } from '@/auth';
import {
  attributeInvite,
  ensureInviteCode,
  getInviteStats,
} from '@/lib/referrals';
import { sanitizeInviteCode } from '@/lib/growth';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  if (!session?.user?.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stats = await getInviteStats(session.user.walletAddress);
  return NextResponse.json(stats);
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wallet = session.user.walletAddress;
  const limit = rateLimit(`invites:${wallet.toLowerCase()}`, 30, 60_000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many invite requests. Try again shortly.' },
      { status: 429 },
    );
  }

  let body: { action?: 'register' | 'attribute'; code?: string };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const action = body.action ?? 'register';

  if (action === 'register') {
    const inviteCode = await ensureInviteCode(wallet);
    return NextResponse.json({ inviteCode });
  }

  if (action === 'attribute') {
    const code = sanitizeInviteCode(body.code);
    if (!code) {
      return NextResponse.json({ error: 'Invalid invite code' }, { status: 400 });
    }

    const result = await attributeInvite({
      walletAddress: wallet,
      inviteCode: code,
    });

    if (!result.ok) {
      const status =
        result.reason === 'unknown_code'
          ? 404
          : result.reason === 'self_referral'
            ? 400
            : 400;
      return NextResponse.json({ error: result.reason }, { status });
    }

    return NextResponse.json({ success: true, reason: result.reason });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
