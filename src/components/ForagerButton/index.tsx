'use client';

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
  ...props
}: ForagerButtonProps) {
  return (
    <button
      type={type}
      className={`forager-btn ${variantClasses[variant]} ${sizeClasses[size]} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forager-accent/70 focus-visible:ring-offset-1 focus-visible:ring-offset-forager-bg ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
