'use client';

import { usePathname } from 'next/navigation';

export function WorldAtmosphere() {
  const pathname = usePathname();
  if (pathname === '/enter' || pathname === '/') {
    return null;
  }

  return (
    <div
      className="world-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div className="world-atmosphere__gradient absolute inset-0" />
    </div>
  );
}
