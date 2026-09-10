'use client';

import { MiniKit } from '@worldcoin/minikit-js';
import { useCallback } from 'react';
import {
  buildForageShareText,
  buildInviteLink,
  inviteCodeFromWallet,
} from '@/lib/growth';
import { apiPath } from '@/lib/base-path';
import { hapticImpact } from '@/lib/haptics';

export async function shareForageResult(params: {
  walletAddress: string;
  wldAmountLabel: string;
  tokenCount: number;
}): Promise<boolean> {
  const inviteCode = inviteCodeFromWallet(params.walletAddress);
  void fetch(apiPath('/invites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register' }),
  }).catch(() => undefined);

  const url = buildInviteLink(inviteCode);
  const text = buildForageShareText({
    wldAmountLabel: params.wldAmountLabel,
    tokenCount: params.tokenCount,
  });

  try {
    await MiniKit.share({
      title: 'Forager',
      text,
      url,
    });
    return true;
  } catch (error) {
    console.error('Share failed', error);
    return false;
  }
}

export async function shareInviteLink(walletAddress: string): Promise<boolean> {
  const inviteCode = inviteCodeFromWallet(walletAddress);
  void fetch(apiPath('/invites'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'register' }),
  }).catch(() => undefined);

  try {
    await MiniKit.share({
      title: 'Join me on Forager',
      text: 'Clean junk World Chain tokens into WLD with Forager. Open my invite:',
      url: buildInviteLink(inviteCode),
    });
    return true;
  } catch (error) {
    console.error('Invite share failed', error);
    return false;
  }
}

export function useShareInvite(walletAddress: string | undefined) {
  return useCallback(async () => {
    if (!walletAddress) return false;
    void hapticImpact('light');
    return shareInviteLink(walletAddress);
  }, [walletAddress]);
}
