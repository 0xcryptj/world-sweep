'use client';

import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { usePathname } from 'next/navigation';

export function WorldAtmosphere() {
  const pathname = usePathname();
  if (pathname === '/enter' || pathname === '/') {
    return null;
  }

  return (
    <div
      className="world-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="world-atmosphere__gradient absolute inset-0" />
      <FlickeringGrid className="absolute inset-0" />
      <div className="world-atmosphere__veil absolute inset-0" />
    </div>
  );
}
