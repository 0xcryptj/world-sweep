'use client';

import { ButtonHTMLAttributes, ReactNode } from 'react';

type AppButtonVariant = 'primary' | 'secondary' | 'ghost';

type AppButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: AppButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  children: ReactNode;
};

const sizeClasses = {
  sm: 'h-9 px-4 text-sm',
  md: 'h-11 px-5 text-sm',
  lg: 'h-14 px-6 text-base font-semibold',
};

const variantClasses: Record<AppButtonVariant, string> = {
  primary: 'app-btn-primary',
  secondary: 'app-btn-secondary',
  ghost: 'app-btn-ghost',
};

export function AppButton({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  type = 'button',
  ...props
}: AppButtonProps) {
  return (
    <button
      type={type}
      className={`app-btn ${variantClasses[variant]} ${sizeClasses[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
