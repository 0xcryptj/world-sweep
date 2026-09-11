import { APP_LOGO_SRC, APP_NAME } from '@/lib/branding';
import { cn } from '@/lib/utils';

type ForagerHeroMarkProps = {
  size?: number;
  animated?: boolean;
  className?: string;
};

export function ForagerHeroMark({
  size = 180,
  animated = false,
  className = '',
}: ForagerHeroMarkProps) {
  return (
    <div
      className={cn(
        'forager-hero-mark',
        animated ? 'forager-hero-mark-animated' : '',
        className,
      )}
      style={{ width: size, height: size }}
    >
      <span className="forager-hero-bloom" aria-hidden />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={APP_LOGO_SRC}
        alt={`${APP_NAME} logo`}
        width={size}
        height={size}
        className="forager-hero-sprite"
        decoding="async"
        fetchPriority="high"
      />
    </div>
  );
}
