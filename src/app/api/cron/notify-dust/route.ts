import {
  listOptedInWallets,
  sendWorldNotification,
} from '@/lib/notifications';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Functional re-engage nudge for opted-in users who haven't been notified recently.
 * Cron: weekly. Keep copy value-based (not marketing spam).
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const wallets = await listOptedInWallets(100);
    if (wallets.length === 0) {
      return NextResponse.json({ sent: 0, failed: 0, skipped: true });
    }

    const result = await sendWorldNotification({
      walletAddresses: wallets,
      title: 'Junk tokens waiting?',
      message:
        'Hey ${username} — reopen Forager to scan for forageable World Chain dust.',
      path: '/home',
    });

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Notification cron failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
