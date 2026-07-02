'use client';

import { AppLogo } from '@/components/AppLogo';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';

type SplashScreenProps = {
  visible: boolean;
  exiting?: boolean;
};

export function SplashScreen({ visible, exiting = false }: SplashScreenProps) {
  return (
    <div
      aria-hidden={!visible}
      className={`splash-screen fixed inset-0 z-50 flex flex-col items-center justify-center transition-opacity duration-700 ease-in-out ${
        visible
          ? 'pointer-events-auto opacity-100'
          : 'pointer-events-none opacity-0'
      }`}
    >
      <div
        className={`flex flex-col items-center gap-8 px-8 text-center ${exiting ? 'splash-content-exit' : ''}`}
      >
        <div className={`relative ${exiting ? 'splash-logo-exit' : ''}`}>
          <div className="splash-logo-glow" aria-hidden />
          <div className="splash-logo-enter relative z-10">
            <div className="splash-logo-float">
              <AppLogo size="xl" />
            </div>
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
