'use client';

import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';

const ASCII_SRC = withBasePath('/assets/ascii/trippin-spiral.mp4');
const ASCII_POSTER = withBasePath('/assets/ascii/trippin-spiral.webp');

export function AsciiArt({ className }: { className?: string }) {
  return (
    <video
      className={cn(className)}
      src={ASCII_SRC}
      poster={ASCII_POSTER}
      autoPlay
      loop
      muted
      playsInline
      aria-hidden
      style={{
        display: 'block',
        width: '100%',
        height: '100%',
        objectFit: 'contain',
      }}
    />
  );
}
