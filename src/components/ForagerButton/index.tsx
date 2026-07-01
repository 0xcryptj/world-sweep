'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type ForagerButtonVariant = 'primary' | 'secondary' | 'ghost';

type ForagerButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ForagerButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
};

const sizeClasses = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-6 text-base font-semibold',
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
      className={`forager-btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
