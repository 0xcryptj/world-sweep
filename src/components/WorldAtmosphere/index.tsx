'use client';

export function WorldAtmosphere() {
  return (
    <div
      className="world-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden bg-black"
      aria-hidden
    >
      <div className="world-atmosphere__gradient absolute inset-0" />
    </div>
  );
}
