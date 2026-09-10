import { auth } from '@/auth';
import { recordNotificationOptIn } from '@/lib/notifications';
import { rateLimit } from '@/lib/rate-limit';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  const session = await auth();
  if (!session?.user?.walletAddress) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const wallet = session.user.walletAddress;
  const limit = rateLimit(`notify-optin:${wallet.toLowerCase()}`, 10, 60_000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  try {
    await recordNotificationOptIn(wallet);
    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Opt-in failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
