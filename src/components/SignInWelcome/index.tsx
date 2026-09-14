'use client';

import { BaseScrambleHeadline } from '@/components/brand/BaseScrambleHeadline';
import { APP_NAME } from '@/lib/branding';
import { hasSignedInBefore, signInWelcomeLine } from '@/lib/signin-welcome';
import { useEffect, useState } from 'react';

export function SignInWelcome() {
  const [line, setLine] = useState(signInWelcomeLine(false));
  const [kicker, setKicker] = useState('');

  useEffect(() => {
    const returning = hasSignedInBefore();
    setLine(signInWelcomeLine(returning));
    setKicker(returning ? 'Welcome back, Forager' : '');
  }, []);

  return (
    <div className="flex flex-col items-center gap-5 overflow-visible">
      {kicker ? (
        <p className="forager-support-fade text-[13px] font-medium tracking-[0.14em] text-white/55 uppercase">
          {kicker}
        </p>
      ) : null}
      <BaseScrambleHeadline
        as="h1"
        text={APP_NAME}
        deferUntilReveal
        className="forager-display forager-wordmark"
      />
      <p className="forager-support-fade max-w-[18rem] text-[17px] leading-[1.4] text-forager-text-muted">
        {line}
      </p>
    </div>
  );
}
