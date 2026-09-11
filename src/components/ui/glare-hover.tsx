'use client';

import { cn } from '@/lib/utils';
import { type CSSProperties, type ReactNode, useRef } from 'react';

type GlareHoverProps = {
  children?: ReactNode;
  glareColor?: string;
  glareOpacity?: number;
  glareAngle?: number;
  glareSize?: number;
  transitionDuration?: number;
  autoPlay?: boolean;
  className?: string;
  style?: CSSProperties;
};

export function GlareHover({
  children,
  glareColor = '#ffffff',
  glareOpacity = 0.45,
  glareAngle = -45,
  glareSize = 250,
  transitionDuration = 650,
  autoPlay = false,
  className = '',
  style = {},
}: GlareHoverProps) {
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const hex = glareColor.replace('#', '');
  let rgba = glareColor;
  if (/^[\dA-Fa-f]{6}$/.test(hex)) {
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    rgba = `rgba(${r}, ${g}, ${b}, ${glareOpacity})`;
  }

  const animateIn = () => {
    const el = overlayRef.current;
    if (!el || autoPlay) {
      return;
    }
    el.style.transition = 'none';
    el.style.backgroundPosition = '-100% -100%, 0 0';
    el.style.transition = `${transitionDuration}ms ease`;
    el.style.backgroundPosition = '100% 100%, 0 0';
  };

  const animateOut = () => {
    const el = overlayRef.current;
    if (!el || autoPlay) {
      return;
    }
    el.style.transition = `${transitionDuration}ms ease`;
    el.style.backgroundPosition = '-100% -100%, 0 0';
  };

  return (
    <div
      className={cn('relative grid place-items-center overflow-hidden', className)}
      style={style}
      onMouseEnter={animateIn}
      onMouseLeave={animateOut}
    >
      <div
        ref={overlayRef}
        aria-hidden
        className={autoPlay ? 'forager-glare-auto' : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(${glareAngle}deg, hsla(0,0%,0%,0) 60%, ${rgba} 70%, hsla(0,0%,0%,0) 100%)`,
          backgroundSize: `${glareSize}% ${glareSize}%, 100% 100%`,
          backgroundRepeat: 'no-repeat',
          backgroundPosition: '-100% -100%, 0 0',
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
      {children}
    </div>
  );
}
