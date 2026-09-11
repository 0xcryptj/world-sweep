'use client';

import { cn } from '@/lib/utils';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';

type HoverBorderGradientProps<T extends React.ElementType = 'button'> = {
  as?: T;
  containerClassName?: string;
  className?: string;
  duration?: number;
  clockwise?: boolean;
  children: React.ReactNode;
} & Omit<React.ComponentPropsWithoutRef<T>, 'as' | 'children'>;

export function HoverBorderGradient<T extends React.ElementType = 'button'>({
  children,
  containerClassName,
  className,
  as,
  duration = 1,
  clockwise = true,
  ...props
}: HoverBorderGradientProps<T>) {
  const Tag = (as || 'button') as React.ElementType;
  const [hovered, setHovered] = useState(false);
  const [direction, setDirection] = useState<
    'TOP' | 'LEFT' | 'BOTTOM' | 'RIGHT'
  >('TOP');

  const rotateDirection = (current: typeof direction) => {
    const positions = ['TOP', 'LEFT', 'BOTTOM', 'RIGHT'] as const;
    const index = positions.indexOf(current);
    const next = clockwise
      ? (index - 1 + positions.length) % positions.length
      : (index + 1) % positions.length;
    return positions[next];
  };

  const movingMap: Record<typeof direction, string> = {
    TOP: 'radial-gradient(20.7% 50% at 50% 0%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 100%)',
    LEFT: 'radial-gradient(16.6% 43.1% at 0% 50%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 100%)',
    BOTTOM:
      'radial-gradient(20.7% 50% at 50% 100%, rgba(255, 255, 255, 0.55) 0%, rgba(255, 255, 255, 0) 100%)',
    RIGHT:
      'radial-gradient(16.2% 41.2% at 100% 50%, rgba(255, 255, 255, 0.9) 0%, rgba(255, 255, 255, 0) 100%)',
  };

  const highlight =
    'radial-gradient(75% 181% at 50% 50%, #ffffff 0%, rgba(255, 255, 255, 0) 100%)';

  useEffect(() => {
    if (hovered) {
      return;
    }
    const interval = window.setInterval(() => {
      setDirection((prev) => rotateDirection(prev));
    }, duration * 1000);
    return () => window.clearInterval(interval);
  }, [hovered, duration, clockwise]);

  return (
    <Tag
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        'relative flex w-fit items-center justify-center overflow-hidden rounded-full border border-white/10 bg-black/20 p-px transition duration-500',
        containerClassName,
      )}
      {...props}
    >
      <div className={cn('relative z-10 w-auto rounded-[inherit]', className)}>
        {children}
      </div>
      <motion.div
        className="absolute inset-0 z-0 overflow-hidden rounded-[inherit]"
        style={{ filter: 'blur(2px)' }}
        initial={{ background: movingMap[direction] }}
        animate={{ background: hovered ? [movingMap[direction], highlight] : movingMap[direction] }}
        transition={{ ease: 'linear', duration }}
      />
      <div className="absolute inset-px z-[1] rounded-[inherit] bg-[#0b0b0b]" />
    </Tag>
  );
}
