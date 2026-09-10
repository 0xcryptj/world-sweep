'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { apiPath } from '@/lib/base-path';
import { buildInviteLink } from '@/lib/growth';
import { shareInviteLink } from '@/lib/share';
import { hapticImpact, hapticSelection } from '@/lib/haptics';
import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';

export function InvitePanel() {
  const { data: session } = useSession();
  const wallet = session?.user?.walletAddress;
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [inviteCount, setInviteCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!wallet) return;
    void (async () => {
      try {
        const response = await fetch(apiPath('/invites'));
        if (!response.ok) return;
        const payload = (await response.json()) as {
          inviteCode?: string;
          inviteCount?: number;
        };
        if (payload.inviteCode) setInviteCode(payload.inviteCode);
        if (typeof payload.inviteCount === 'number') {
          setInviteCount(payload.inviteCount);
        }
      } catch {
        // Soft-fail — invite UI is optional.
      }
    })();
  }, [wallet]);

  if (!wallet) return null;

  const link = inviteCode ? buildInviteLink(inviteCode) : null;

  const onShare = async () => {
    void hapticImpact('medium');
    setBusy(true);
    try {
      await shareInviteLink(wallet);
    } finally {
      setBusy(false);
    }
  };

  const onCopy = async () => {
    if (!link) return;
    void hapticSelection();
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="forager-group p-4">
      <p className="text-[17px] font-semibold">Invite foragers</p>
      <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
        Share Forager with World App friends who hold leftover mini-app tokens.
        {inviteCount > 0
          ? ` ${inviteCount} friend${inviteCount === 1 ? '' : 's'} joined via your link.`
          : ' Your link tracks who opens Forager from you.'}
      </p>
      {inviteCode ? (
        <p className="mt-3 text-[13px] text-forager-text-muted">
          Code · {inviteCode}
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        <ForagerButton
          variant="primary"
          size="md"
          className="w-full"
          disabled={busy}
          onClick={() => void onShare()}
        >
          {busy ? 'Opening share…' : 'Share invite'}
        </ForagerButton>
        <ForagerButton
          variant="secondary"
          size="md"
          className="w-full"
          disabled={!link}
          onClick={() => void onCopy()}
        >
          {copied ? 'Copied' : 'Copy invite link'}
        </ForagerButton>
      </div>
    </div>
  );
}
