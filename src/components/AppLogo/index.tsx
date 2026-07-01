import { APP_LOGO_SRC, APP_NAME } from '@/lib/branding';

type AppLogoProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const sizeMap = {
  sm: 40,
  md: 64,
  lg: 96,
} as const;

export function AppLogo({ size = 'md', className = '' }: AppLogoProps) {
  const dimension = sizeMap[size];

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={APP_LOGO_SRC}
      alt={`${APP_NAME} logo`}
      width={dimension}
      height={dimension}
      className={`shrink-0 object-contain ${className}`}
      style={{ background: 'transparent' }}
      decoding="async"
      fetchPriority={size === 'lg' ? 'high' : 'auto'}
    />
  );
}
