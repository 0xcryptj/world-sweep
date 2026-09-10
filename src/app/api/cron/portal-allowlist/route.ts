import { NextResponse } from 'next/server';
import { syncPortalAllowlist } from '@/lib/portal-sync';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Vercel Cron — retry Developer Portal Permit2 sync for queued tokens (ORB, …).
 * Auth: Authorization: Bearer $CRON_SECRET (Vercel sets this automatically).
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret) {
    const auth = request.headers.get('authorization') ?? '';
    if (auth !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const result = await syncPortalAllowlist({ force: true });
  return NextResponse.json(result, {
    status: result.ok || result.skipped ? 200 : 502,
  });
}
