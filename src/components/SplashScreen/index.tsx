'use client';

import { AppLogo } from '@/components/AppLogo';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';

type SplashScreenProps = {
  visible: boolean;
};

export function SplashScreen({ visible }: SplashScreenProps) {
  return (
    <div
      aria-hidden={!visible}
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-app-bg transition-opacity duration-500 ease-out ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      }`}
    >
      <div className="flex flex-col items-center gap-7 px-8 text-center">
        <div className="splash-logo-enter">
          <div className="splash-logo-float">
            <AppLogo size="lg" />
          </div>
        </div>

        <div className="splash-text-animate space-y-2">
          <h1 className="app-title text-3xl font-semibold tracking-tight">
            {APP_NAME}
          </h1>
          <p className="app-subtitle text-sm">{APP_TAGLINE}</p>
        </div>

        <div className="splash-dots-animate flex items-center gap-1.5">
          <span className="splash-dot h-2 w-2 rounded-sm" />
          <span className="splash-dot splash-dot-2 h-2 w-2 rounded-sm" />
          <span className="splash-dot splash-dot-3 h-2 w-2 rounded-sm" />
        </div>
      </div>
    </div>
  );
}
