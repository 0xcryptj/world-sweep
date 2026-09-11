'use client';

import { cn } from '@/lib/utils';
import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { useRef } from 'react';

gsap.registerPlugin(useGSAP);

const GLYPHS = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789$#*+=';
const SLOTS = 4;
const MAX_MS = 720;

function seededGlyph(text: string, index: number, slot: number, avoid: string) {
  const n =
    (text.charCodeAt(index % text.length) * 31 + slot * 17 + index * 13) %
    GLYPHS.length;
  const glyph = GLYPHS[n] ?? 'A';
  return glyph === avoid ? GLYPHS[(n + 3) % GLYPHS.length] ?? 'K' : glyph;
}

type TechScrambleProps = {
  text: string;
  className?: string;
  as?: 'h1' | 'p' | 'span';
};

export function TechScramble({
  text,
  className,
  as: Tag = 'h1',
}: TechScrambleProps) {
  const rootRef = useRef<HTMLHeadingElement | HTMLParagraphElement | HTMLSpanElement>(null);

  useGSAP(
    () => {
      const root = rootRef.current;
      if (!root) {
        return;
      }
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return;
      }

      const chars = root.querySelectorAll<HTMLElement>('[data-scramble-char]');
      const stagger =
        chars.length > 0 ? Math.min(0.042, (MAX_MS / 1000) * 0.55 / chars.length) : 0;

      chars.forEach((el, i) => {
        const stack = el.querySelector<HTMLElement>('[data-glyph-stack]');
        if (!stack) {
          return;
        }
        const slots = stack.querySelectorAll('[data-glyph]').length;
        gsap.fromTo(
          stack,
          { y: 0 },
          {
            y: `-${slots - 1}em`,
            duration: 0.36,
            delay: i * stagger,
            ease: 'power2.inOut',
          },
        );
      });
    },
    { dependencies: [text] },
  );

  return (
    <Tag
      ref={rootRef as never}
      className={cn('forager-headline forager-scramble', className)}
      aria-label={text}
    >
      {Array.from(text).map((ch, index) => (
        <span
          key={`${ch}-${index}`}
          data-scramble-char
          data-final={ch}
          aria-hidden
          className="forager-scramble-char"
        >
          {ch === ' ' ? (
            '\u00a0'
          ) : (
            <span data-glyph-stack className="forager-scramble-stack">
              {Array.from({ length: SLOTS }, (_, slot) => (
                <span key={slot} data-glyph className="forager-scramble-glyph">
                  {slot === SLOTS - 1 ? ch : seededGlyph(text, index, slot, ch)}
                </span>
              ))}
            </span>
          )}
        </span>
      ))}
    </Tag>
  );
}
