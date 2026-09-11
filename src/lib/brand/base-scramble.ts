/** Base tech-scramble — brand.base.org/motion + /typography. Headlines only, <800ms. */
export const BASE_SCRAMBLE_EASE = 'cubic-bezier(0.4, 0, 0.2, 1)';
export const BASE_SCRAMBLE_CHAR_MS = 320;
export const BASE_SCRAMBLE_STAGGER_MS = 56;
export const BASE_SCRAMBLE_ROLL_STEPS = 4;
export const BASE_SCRAMBLE_MAX_MS = 780;
export const BASE_SCRAMBLE_MAX_CHARS = 40;

/** Tech-adjacent latin set — not emoji, not a full charset dump. */
export const BASE_SCRAMBLE_GLYPHS =
  'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz0123456789#%+=';

const WALLET_LIKE = /^(0x[a-fA-F0-9]{8,}|[1-9A-HJ-NP-Za-km-z]{32,})$/;

/**
 * Scramble only short product headlines. Never body, addresses, percents, or long copy.
 */
export function shouldScrambleHeadline(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  if (trimmed.length > BASE_SCRAMBLE_MAX_CHARS) return false;
  if (trimmed.includes('\n')) return false;
  if (/%/.test(trimmed)) return false;
  if (WALLET_LIKE.test(trimmed.replace(/\s/g, ''))) return false;
  return true;
}

export function scrambleDurationMs(glyphCount: number): {
  charMs: number;
  staggerMs: number;
  totalMs: number;
} {
  const n = Math.max(1, glyphCount);
  const charMs = BASE_SCRAMBLE_CHAR_MS;
  const cascadeBudget = Math.max(0, BASE_SCRAMBLE_MAX_MS - charMs);
  const staggerMs =
    n > 1 ? Math.min(BASE_SCRAMBLE_STAGGER_MS, cascadeBudget / (n - 1)) : 0;
  const totalMs = Math.min(
    BASE_SCRAMBLE_MAX_MS,
    charMs + (n - 1) * staggerMs,
  );
  return { charMs, staggerMs, totalMs };
}

/** Deterministic reel so SSR and client match — cascade, not Math.random flicker. */
export function scrambleReel(finalChar: string, seed: number): string[] {
  const steps: string[] = [];
  const pool = BASE_SCRAMBLE_GLYPHS;
  for (let i = 0; i < BASE_SCRAMBLE_ROLL_STEPS; i += 1) {
    const idx = (seed + i * 17 + finalChar.charCodeAt(0) * 13) % pool.length;
    const glyph = pool[idx] ?? 'A';
    steps.push(glyph === finalChar ? pool[(idx + 3) % pool.length] ?? 'K' : glyph);
  }
  steps.push(finalChar);
  return steps;
}

/** Split on whitespace so words wrap as units; glyphs inside a word stay on one line. */
export function splitHeadlineTokens(text: string): string[] {
  return text.split(/(\s+)/).filter((token) => token.length > 0);
}
