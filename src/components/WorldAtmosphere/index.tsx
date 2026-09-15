'use client';

import { AsciiArt } from '@/components/ui/trippin-spiral';
import { usePathname } from 'next/navigation';

export function WorldAtmosphere() {
  const pathname = usePathname();
  const onEnter = pathname === '/enter' || pathname === '/';

  return (
    <div
      className="world-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div className="world-atmosphere__gradient absolute inset-0" />
      {!onEnter ? (
        <div className="forager-enter-ascii forager-atmosphere-ascii">
          <AsciiArt />
        </div>
      ) : null}
    </div>
  );
}
