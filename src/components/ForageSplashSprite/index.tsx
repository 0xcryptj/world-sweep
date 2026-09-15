import {
  FORAGE_SPRITE_DURATION_MS,
  FORAGE_SPRITE_FRAME_COUNT,
  FORAGE_SPRITE_FRAME_HEIGHT,
  FORAGE_SPRITE_FRAME_WIDTH,
  FORAGE_SPRITE_GOLD_FRAME,
  FORAGE_SPRITE_SRC,
  FORAGE_SPRITE_WALK_FRAMES,
} from '@/lib/forage-sprite';
import { cn } from '@/lib/utils';
import type { CSSProperties } from 'react';

type ForageSplashSpriteProps = {
  variant?: 'hero' | 'ambient' | 'backdrop';
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
        variant === 'backdrop'
          ? 'forager-forage-sprite-backdrop'
          : variant === 'ambient'
            ? 'forager-forage-sprite-ambient'
            : 'forager-forage-sprite-hero',
        className,
      )}
      style={
        {
          '--forage-n': FORAGE_SPRITE_FRAME_COUNT,
          '--forage-walk': FORAGE_SPRITE_WALK_FRAMES,
          '--forage-gold': FORAGE_SPRITE_GOLD_FRAME,
          '--forage-ms': `${FORAGE_SPRITE_DURATION_MS}ms`,
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
