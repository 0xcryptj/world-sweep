'use client';

import { withBasePath } from '@/lib/base-path';

export function CleanWalletArt() {
  return (
    <div className="relative mb-4 h-[120px] w-[120px]">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={withBasePath('/assets/pics/forager-clean-wallet.png')}
        alt=""
        width={120}
        height={120}
        className="h-full w-full object-contain"
        decoding="async"
      />
    </div>
  );
}
