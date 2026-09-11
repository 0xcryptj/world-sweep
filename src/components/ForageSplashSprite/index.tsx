import {
  FORAGE_SPRITE_FRAME_COUNT,
  FORAGE_SPRITE_FRAME_HEIGHT,
  FORAGE_SPRITE_FRAME_WIDTH,
  FORAGE_SPRITE_SRC,
} from '@/lib/forage-sprite';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

type ForageSplashSpriteProps = {
  variant?: 'hero' | 'ambient';
  className?: string;
};

export function ForageSplashSprite({
  variant = 'hero',
  className,
}: ForageSplashSpriteProps) {
  return (
    <div
      className={cn(
        'forager-forage-sprite',
        variant === 'ambient'
          ? 'forager-forage-sprite-ambient'
          : 'forager-forage-sprite-hero',
        className,
      )}
      style={
        {
          '--forage-n': FORAGE_SPRITE_FRAME_COUNT,
          '--forage-aspect': `${FORAGE_SPRITE_FRAME_WIDTH} / ${FORAGE_SPRITE_FRAME_HEIGHT}`,
        } as CSSProperties
      }
      aria-hidden
    >
      <span className="forager-forage-frame">
        <span
          className="forager-forage-sheet"
          style={{ backgroundImage: `url('${FORAGE_SPRITE_SRC}')` }}
        />
        <span className="forager-forage-veil" />
      </span>
    </div>
  );
}
