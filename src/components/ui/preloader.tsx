'use client';

import { ForagerHeroMark } from '@/components/ForagerHeroMark';
import { cn } from '@/lib/utils';
import { APP_NAME } from '@/lib/branding';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP);

type PreloaderProps = {
  /** When true, play the curtain reveal. SplashGate should pass MiniKit + min-hold. */
  ready?: boolean;
  onComplete?: () => void;
  className?: string;
};

export function Preloader({
  ready = false,
  onComplete,
  className,
}: PreloaderProps) {
  const loaderRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const completedRef = useRef(false);

  useGSAP(
    () => {
      const loader = loaderRef.current;
      const stage = stageRef.current;
      if (!ready || !loader || !stage || completedRef.current) {
        return;
      }

      const finish = () => {
        if (completedRef.current) {
          return;
        }
        completedRef.current = true;
        gsap.set(loader, { pointerEvents: 'none', display: 'none' });
        onComplete?.();
      };

      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        finish();
        return;
      }

      gsap.set(stage, { transformOrigin: '50% 42%', force3D: true });
      gsap.set(loader, { force3D: true });

      const tl = gsap.timeline({
        defaults: { ease: 'power2.inOut' },
        onComplete: finish,
      });

      tl.to(stage, {
        scale: 1.72,
        opacity: 0,
        duration: 0.78,
        ease: 'power2.in',
      });

      tl.to(
        loader,
        {
          yPercent: -108,
          borderBottomLeftRadius: '50% 22%',
          borderBottomRightRadius: '50% 22%',
          duration: 1.12,
          ease: 'power3.inOut',
        },
        '<0.06',
      );
    },
    { dependencies: [ready, onComplete] },
  );

  return (
    <div
      ref={loaderRef}
      aria-hidden={ready}
      aria-busy={!ready}
      className={cn('forager-preloader', className)}
    >
      <div className="forager-splash-vignette" />
      <div ref={stageRef} className="forager-splash-stage">
        <ForagerHeroMark animated size={220} />
        <div className="forager-splash-copy">
          <p className="forager-splash-kicker">World Chain</p>
          <h1 className="forager-display forager-splash-title">{APP_NAME}</h1>
        </div>
      </div>
    </div>
  );
}

export default Preloader;
