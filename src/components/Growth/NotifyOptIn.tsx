'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { apiPath } from '@/lib/base-path';
import { NOTIFY_PROMPT_DISMISSED_KEY } from '@/lib/growth';
import { hapticImpact } from '@/lib/haptics';
import { MiniKit } from '@worldcoin/minikit-js';
import { Permission } from '@worldcoin/minikit-js/commands';
import { useEffect, useState } from 'react';

type NotifyOptInProps = {
  force?: boolean;
  onDone?: () => void;
};

export function NotifyOptIn({ force = false, onDone }: NotifyOptInProps) {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<'idle' | 'on' | 'denied'>('idle');

  useEffect(() => {
    if (force) {
      setVisible(true);
      return;
    }
    try {
      if (localStorage.getItem(NOTIFY_PROMPT_DISMISSED_KEY) === '1') {
        return;
      }
    } catch {
      // ignore
    }
    setVisible(true);
  }, [force]);

  if (!visible || status === 'on') {
    return null;
  }

  const dismiss = () => {
    try {
      localStorage.setItem(NOTIFY_PROMPT_DISMISSED_KEY, '1');
    } catch {
      // ignore
    }
    setVisible(false);
    onDone?.();
  };

  const enable = async () => {
    void hapticImpact('medium');
    setBusy(true);
    try {
      const result = await MiniKit.requestPermission({
        permission: Permission.Notifications,
      });
      const data = (result as { data?: { status?: string; permission?: string } })
        ?.data;
      const granted =
        data?.status === 'success' || data?.permission === 'notifications';

      if (granted) {
        await fetch(apiPath('/notifications/opt-in'), { method: 'POST' });
        setStatus('on');
        try {
          localStorage.setItem(NOTIFY_PROMPT_DISMISSED_KEY, '1');
        } catch {
          // ignore
        }
        onDone?.();
      } else {
        setStatus('denied');
      }
    } catch {
      setStatus('denied');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="forager-group p-4">
      <p className="text-[17px] font-semibold">Know when dust shows up</p>
      <p className="mt-3 text-[15px] leading-snug text-forager-text-muted">
        Get a rare ping when it&apos;s worth rescanning — not marketing spam.
        World pauses apps with low open rates, so we keep this functional.
      </p>
      {status === 'denied' ? (
        <p className="mt-3 text-[15px] text-forager-text-muted">
          Permission was denied. You can enable notifications later in World App
          settings.
        </p>
      ) : null}
      <div className="mt-4 flex flex-col gap-3">
        <ForagerButton
          variant="primary"
          size="md"
          className="w-full"
          disabled={busy || status === 'denied'}
          onClick={() => void enable()}
        >
          {busy ? 'Requesting…' : 'Enable alerts'}
        </ForagerButton>
        <ForagerButton
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={dismiss}
        >
          Not now
        </ForagerButton>
      </div>
    </div>
  );
}
