import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';

type ForagerPixelMarkProps = {
  className?: string;
  size?: number;
};

export function ForagerPixelMark({
  className,
  size = 120,
}: ForagerPixelMarkProps) {
  return (
    <img
      src={withBasePath('/assets/pics/forager-pixel.png')}
      alt=""
      width={size}
      height={size}
      className={cn('forager-pixel-mark', className)}
      draggable={false}
    />
  );
}
