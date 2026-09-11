'use client';

import React, { type ComponentPropsWithoutRef, type CSSProperties } from 'react';

import { cn } from '@/lib/utils';

export interface ShimmerButtonProps extends ComponentPropsWithoutRef<'button'> {
  shimmerColor?: string;
  shimmerSize?: string;
  borderRadius?: string;
  shimmerDuration?: string;
  background?: string;
}

export const ShimmerButton = React.forwardRef<
  HTMLButtonElement,
  ShimmerButtonProps
>(
  (
    {
      shimmerColor = '#ffffff',
      shimmerSize = '0.05em',
      shimmerDuration = '3s',
      borderRadius = '14px',
      background = 'var(--forager-accent)',
      className,
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        style={
          {
            '--spread': '90deg',
            '--shimmer-color': shimmerColor,
            '--radius': borderRadius,
            '--speed': shimmerDuration,
            '--cut': shimmerSize,
            '--bg': background,
          } as CSSProperties
        }
        className={cn(
          'forager-btn group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden whitespace-nowrap [background:var(--bg)] [border-radius:var(--radius)]',
          'border border-black/10 text-black',
          'transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px',
          'disabled:cursor-not-allowed',
          className,
        )}
        ref={ref}
        {...props}
      >
        <div className="pointer-events-none -z-30 blur-[2px] @container-[size] absolute inset-0 overflow-visible">
          <div className="animate-shimmer-slide absolute inset-0 aspect-square h-[100cqh] rounded-none">
            <div className="animate-spin-around absolute -inset-full w-auto rotate-0 [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
          </div>
        </div>
        <span className="relative z-20" style={{ color: '#000' }}>
          {children}
        </span>
        <div
          className={cn(
            'pointer-events-none absolute inset-0 z-10 size-full rounded-[inherit]',
            'shadow-[inset_0_-8px_10px_#00000014]',
            'transform-gpu transition-all duration-300 ease-in-out',
            'group-hover:shadow-[inset_0_-6px_10px_#0000001f]',
            'group-active:shadow-[inset_0_-10px_10px_#00000024]',
          )}
        />
        <div className="absolute inset-(--cut) -z-20 [border-radius:var(--radius)] [background:var(--bg)]" />
      </button>
    );
  },
);

ShimmerButton.displayName = 'ShimmerButton';
