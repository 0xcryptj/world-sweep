import { APP_LOGO_SRC, APP_NAME } from '@/lib/branding';

type AppLogoProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** `bare` skips the glass shell (use inside another glass container). */
  variant?: 'glass' | 'bare';
};

const sizeMap = {
  xs: 30,
  sm: 40,
  md: 64,
  lg: 96,
} as const;

export function AppLogo({
  size = 'md',
  className = '',
  variant = 'glass',
}: AppLogoProps) {
  const dimension = sizeMap[size];

  // eslint-disable-next-line @next/next/no-img-element
  const image = (
    <img
      src={APP_LOGO_SRC}
      alt={`${APP_NAME} logo`}
      width={dimension}
      height={dimension}
      className="forager-logo-img"
      style={{ background: 'transparent' }}
      decoding="async"
      fetchPriority={size === 'lg' ? 'high' : 'auto'}
    />
  );

  if (variant === 'bare') {
    return (
      <span
        className={`inline-grid shrink-0 place-items-center ${className}`.trim()}
        style={{ width: dimension, height: dimension }}
      >
        {image}
      </span>
    );
  }

  const shellClass =
    size === 'xs'
      ? 'forager-logo-shell forager-logo-shell-xs'
      : size === 'sm'
        ? 'forager-logo-shell forager-logo-shell-sm'
        : size === 'lg'
          ? 'forager-logo-shell forager-logo-shell-lg'
          : 'forager-logo-shell';

  return (
    <span
      className={`${shellClass} ${className}`.trim()}
      style={{ width: dimension, height: dimension }}
    >
      {image}
    </span>
  );
}
