import { withBasePath } from './base-path';

/** Horizontal strip: bush walk / forage, then a gold-hold (no bush). */
export const FORAGE_SPRITE_SRC = withBasePath(
  '/assets/pics/forager-forage-strip.png',
);

export const FORAGE_SPRITE_FRAME_COUNT = 17;
/** Frames 0–6 are him + bush. Frame 7 is the first gold-hold (bush gone). */
export const FORAGE_SPRITE_WALK_FRAMES = 7;
export const FORAGE_SPRITE_GOLD_FRAME = 7;
export const FORAGE_SPRITE_FRAME_WIDTH = 330;
export const FORAGE_SPRITE_FRAME_HEIGHT = 246;
export const FORAGE_SPRITE_DURATION_MS = 4800;
