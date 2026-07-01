import { APP_LOGO_SRC, APP_NAME } from '@/lib/branding';
import Image from 'next/image';

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
    <div className={`relative shrink-0 overflow-hidden ${className}`}>
      <Image
        src={APP_LOGO_SRC}
        alt={`${APP_NAME} logo`}
        width={dimension}
        height={dimension}
        className="object-contain mix-blend-lighten"
        priority={size === 'lg'}
      />
    </div>
  );
}
