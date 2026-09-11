'use client';

import { ForageSplashSprite } from '@/components/ForageSplashSprite';
import { AnimatedShinyText } from '@/components/ui/animated-shiny-text';
import { SparklesText } from '@/components/ui/sparkles-text';
import { cn } from '@/lib/utils';
import { APP_NAME, APP_TAGLINE } from '@/lib/branding';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP);

type PreloaderProps = {
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
        scale: 1.18,
        opacity: 0,
        duration: 0.92,
        ease: 'power2.in',
      });

      tl.to(
        loader,
        {
          yPercent: -108,
          borderBottomLeftRadius: '50% 22%',
          borderBottomRightRadius: '50% 22%',
          duration: 1.28,
          ease: 'power3.inOut',
        },
        '<0.08',
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
      <div className="forager-splash-wash" />
      <div ref={stageRef} className="forager-splash-stage">
        <div className="forager-splash-mark">
          <ForageSplashSprite variant="hero" />
        </div>
        <div className="forager-splash-copy">
          <AnimatedShinyText className="forager-splash-kicker text-white/55">
            World Chain
          </AnimatedShinyText>
          <SparklesText
            sparklesCount={4}
            className="forager-display forager-splash-title"
          >
            {APP_NAME}
          </SparklesText>
          <p className="forager-splash-tagline">{APP_TAGLINE}</p>
        </div>
      </div>
    </div>
  );
}

export default Preloader;
