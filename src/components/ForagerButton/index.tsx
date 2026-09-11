'use client';

import { ShimmerButton } from '@/components/ui/shimmer-button';
import { cn } from '@/lib/utils';
import { ButtonHTMLAttributes, ReactNode } from 'react';

type ForagerButtonVariant = 'primary' | 'secondary' | 'ghost';

type ForagerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ForagerButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
};

const sizeClasses = {
  sm: 'h-8 px-3 text-[15px]',
  md: 'h-[44px] px-4 text-[17px]',
  lg: 'h-[50px] px-5 text-[17px] font-semibold',
};

const variantClasses: Record<ForagerButtonVariant, string> = {
  primary: 'forager-btn-primary',
  secondary: 'forager-btn-secondary',
  ghost: 'forager-btn-ghost',
};

export function ForagerButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  disabled,
  ...props
}: ForagerButtonProps) {
  if (variant === 'primary') {
    return (
      <ShimmerButton
        type={type}
        disabled={disabled}
        shimmerColor="rgba(0,0,0,0.28)"
        background="var(--forager-accent)"
        borderRadius="14px"
        className={cn(
          sizeClasses[size],
          'font-semibold text-black shadow-[0_10px_28px_rgb(255_255_255_/_12%)] disabled:opacity-45 disabled:shadow-none',
          className,
        )}
        {...props}
      >
        {children}
      </ShimmerButton>
    );
  }

  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'forager-btn',
        variantClasses[variant],
        sizeClasses[size],
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forager-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-forager-bg',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
