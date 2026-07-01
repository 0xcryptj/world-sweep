'use client';

import { walletAuth } from '@/auth/wallet';
import { ForagerButton } from '@/components/ForagerButton';
import { hapticImpact, hapticNotification } from '@/lib/haptics';
import { LiveFeedback } from '@worldcoin/mini-apps-ui-kit-react';
import { useMiniKit } from '@worldcoin/minikit-js/minikit-provider';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

export const AuthButton = () => {
  const { status } = useSession();
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const { isInstalled } = useMiniKit();
  const hasAttemptedAuth = useRef(false);

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/home');
    }
  }, [router, status]);

  const onClick = useCallback(async () => {
    if (!isInstalled || isPending) {
      return;
    }
    void hapticImpact('medium');
    setIsPending(true);
    try {
      await walletAuth();
      void hapticNotification('success');
    } catch (error) {
      console.error('Wallet authentication button error', error);
      void hapticNotification('error');
    } finally {
      setIsPending(false);
    }
  }, [isInstalled, isPending]);

  useEffect(() => {
    if (
      status === 'unauthenticated' &&
      isInstalled === true &&
      !hasAttemptedAuth.current
    ) {
      hasAttemptedAuth.current = true;
      void hapticImpact('light');
      setIsPending(true);
      walletAuth()
        .then(() => {
          void hapticNotification('success');
        })
        .catch((error) => {
          console.error('Auto wallet authentication error', error);
          void hapticNotification('error');
        })
        .finally(() => {
          setIsPending(false);
        });
    }
  }, [isInstalled, status]);

  if (status === 'loading' || status === 'authenticated') {
    return null;
  }

  return (
    <LiveFeedback
      label={{
        failed: 'Failed to login',
        pending: 'Logging in',
        success: 'Logged in',
      }}
      state={isPending ? 'pending' : undefined}
    >
      <ForagerButton
        onClick={onClick}
        disabled={isPending || !isInstalled}
        size="lg"
        variant="primary"
        className="min-w-[220px]"
      >
        Login with Wallet
      </ForagerButton>
    </LiveFeedback>
  );
};
