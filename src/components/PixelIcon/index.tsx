import { PIXEL_ICONS, type PixelIconName } from '@/lib/pixel-icons';
import Image from 'next/image';

type PixelIconProps = {
  name: PixelIconName;
  size?: number;
  className?: string;
  alt?: string;
  variant?: 'default' | 'light';
};

export function PixelIcon({
  name,
  size = 24,
  className = '',
  alt = '',
  variant = 'default',
}: PixelIconProps) {
  return (
    <Image
      src={PIXEL_ICONS[name]}
      alt={alt || name}
      width={size}
      height={size}
      className={`shrink-0 ${variant === 'light' ? 'icon-light' : ''} ${className}`}
      aria-hidden={!alt}
    />
  );
}
