'use client';

import { apiPath } from '@/lib/base-path';
import {
  clearStoredInviteCode,
  getStoredInviteCode,
} from '@/lib/growth';
import { useSession } from 'next-auth/react';
import { useEffect, useRef } from 'react';

/** Attributes a pending invite code once the user is signed in. */
export function InviteAttributionBootstrap() {
  const { data: session, status } = useSession();
  const ran = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated' || !session?.user?.walletAddress || ran.current) {
      return;
    }

    const code = getStoredInviteCode();
    if (!code) return;

    ran.current = true;
    void (async () => {
      try {
        const response = await fetch(apiPath('/invites'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'attribute', code }),
        });
        if (response.ok || response.status === 400) {
          clearStoredInviteCode();
        }
      } catch {
        ran.current = false;
      }
    })();
  }, [session?.user?.walletAddress, status]);

  return null;
}
