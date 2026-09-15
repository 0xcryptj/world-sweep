import { withBasePath } from './base-path';

/** Keyed pixel strip for splash (walk / forage / gold, no grass box). */
export const FORAGE_SPRITE_SRC = withBasePath(
  '/assets/pics/forager-forage-strip.png',
);

export const FORAGE_SPRITE_FRAME_COUNT = 17;
/** Frames 0–7 are him + bush. Frame 8 is the first gold-hold (bush gone). */
export const FORAGE_SPRITE_WALK_FRAMES = 8;
export const FORAGE_SPRITE_GOLD_FRAME = 8;
export const FORAGE_SPRITE_FRAME_WIDTH = 330;
export const FORAGE_SPRITE_FRAME_HEIGHT = 246;
export const FORAGE_SPRITE_DURATION_MS = 4800;
