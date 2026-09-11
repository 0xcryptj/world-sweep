'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { Page } from '@/components/PageLayout';
import { ForagerPixelMark } from '@/components/ForagerPixelMark';
import { apiPath } from '@/lib/base-path';
import {
  clearStoredInviteCode,
  getStoredInviteCode,
  sanitizeInviteCode,
  storeInviteCode,
} from '@/lib/growth';
import { APP_NAME, APP_SIGNIN_TAGLINE } from '@/lib/branding';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

function InviteInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { data: session, status } = useSession();
  const [message, setMessage] = useState('Opening Forager…');

  const rawCode = searchParams.get('code') ?? searchParams.get('ref');
  const code = sanitizeInviteCode(rawCode);

  useEffect(() => {
    if (code) {
      storeInviteCode(code);
    }
  }, [code]);

  useEffect(() => {
    if (status === 'loading') return;

    const pending = code ?? getStoredInviteCode();

    void (async () => {
      if (session?.user?.walletAddress && pending) {
        try {
          const response = await fetch(apiPath('/invites'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'attribute', code: pending }),
          });
          if (response.ok) {
            clearStoredInviteCode();
            setMessage('Invite applied. Heading to forage…');
          } else {
            setMessage('Continuing to forage…');
          }
        } catch {
          setMessage('Continuing to forage…');
        }
      } else if (!session?.user) {
        setMessage('Sign in to forage leftover tokens into WLD.');
        return;
      }

      router.replace('/home');
    })();
  }, [code, router, session?.user, status]);

  return (
    <Page.Main className="flex min-h-[70vh] flex-col items-center justify-center gap-8 text-center">
      <ForagerPixelMark size={128} className="forager-pixel-mark-enter" />
      <div className="flex flex-col items-center gap-3 overflow-visible">
          <h1 className="forager-display">{APP_NAME}</h1>
          <p className="forager-support-fade text-[17px] leading-[1.35] text-forager-text-muted">
            {APP_SIGNIN_TAGLINE}
          </p>
      </div>
      <p className="forager-subtitle max-w-sm text-[15px]">{message}</p>
      {status === 'unauthenticated' ? (
        <ForagerButton
          variant="primary"
          size="lg"
          onClick={() => router.push('/enter')}
        >
          Sign in
        </ForagerButton>
      ) : null}
    </Page.Main>
  );
}

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <Page.Main className="flex min-h-[70vh] items-center justify-center">
          <p className="forager-subtitle text-sm">Loading invite…</p>
        </Page.Main>
      }
    >
      <InviteInner />
    </Suspense>
  );
}
