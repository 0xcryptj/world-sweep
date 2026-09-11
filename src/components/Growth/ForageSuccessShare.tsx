'use client';

import { ForagerButton } from '@/components/ForagerButton';
import { AnimatedWld } from '@/components/Sweep/AnimatedWld';
import { formatWld } from '@/lib/sweep';
import { shareForageResult } from '@/lib/share';
import { hapticImpact } from '@/lib/haptics';
import { useState } from 'react';

type ForageSuccessShareProps = {
  walletAddress: string;
  wldReceivedWei: string;
  tokenCount: number;
  onDismiss: () => void;
  onContinueGrowth: () => void;
};

export function ForageSuccessShare({
  walletAddress,
  wldReceivedWei,
  tokenCount,
  onDismiss,
  onContinueGrowth,
}: ForageSuccessShareProps) {
  const [sharing, setSharing] = useState(false);

  const onShare = async () => {
    void hapticImpact('medium');
    setSharing(true);
    try {
      await shareForageResult({
        walletAddress,
        wldAmountLabel: formatWld(wldReceivedWei),
        tokenCount,
      });
      onContinueGrowth();
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="forager-group p-4">
      <p className="text-[13px] font-medium text-forager-accent">Forage complete</p>
      <div className="mt-3 flex flex-wrap items-baseline gap-x-2">
        <AnimatedWld
          amountWei={wldReceivedWei}
          className="forager-value-green text-[28px] font-bold"
        />
        <span className="forager-subtitle text-[15px]">
          from {tokenCount} leftover token{tokenCount === 1 ? '' : 's'}
        </span>
      </div>
      <p className="forager-subtitle mt-3 text-[15px] leading-snug">
        Share this win — friends with dusty World Chain wallets are your best
        audience.
      </p>
      <div className="mt-4 flex flex-col gap-3">
        <ForagerButton
          variant="primary"
          size="lg"
          className="w-full"
          disabled={sharing}
          onClick={() => void onShare()}
        >
          {sharing ? 'Opening share…' : 'Share forage'}
        </ForagerButton>
        <ForagerButton
          variant="ghost"
          size="md"
          className="w-full"
          onClick={onDismiss}
        >
          Done
        </ForagerButton>
      </div>
    </div>
  );
}
