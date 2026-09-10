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

  const runWalletAuth = useCallback(async () => {
    if (!isInstalled || isPending) {
      return;
    }

    void hapticImpact('medium');
    setIsPending(true);
    try {
      await walletAuth();
      void hapticNotification('success');
      router.replace('/home');
    } catch (error) {
      console.error('Wallet authentication error', error);
      void hapticNotification('error');
    } finally {
      setIsPending(false);
    }
  }, [isInstalled, isPending, router]);

  useEffect(() => {
    if (
      status === 'unauthenticated' &&
      isInstalled === true &&
      !hasAttemptedAuth.current
    ) {
      hasAttemptedAuth.current = true;
      void runWalletAuth();
    }
  }, [isInstalled, runWalletAuth, status]);

  if (status === 'loading' || status === 'authenticated') {
    return null;
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <LiveFeedback
        label={{
          failed: 'Sign in failed',
          pending: 'Signing in',
          success: 'Signed in',
        }}
        state={isPending ? 'pending' : undefined}
      >
        <ForagerButton
          onClick={() => void runWalletAuth()}
          disabled={isPending || !isInstalled}
          size="lg"
          variant="primary"
          className="w-full min-w-[220px]"
        >
          Sign in with World
        </ForagerButton>
      </LiveFeedback>
      {!isInstalled ? (
        <p className="max-w-[16rem] text-center text-[13px] leading-snug text-forager-text-muted">
          Open Forager inside World App to sign in.
        </p>
      ) : null}
    </div>
  );
};
