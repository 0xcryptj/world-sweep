export function WorldAtmosphere() {
  return (
    <div
      className="world-atmosphere pointer-events-none fixed inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="world-atmosphere__gradient absolute inset-0" />
      <div className="world-atmosphere__veil absolute inset-0" />
      <div className="world-atmosphere__spec absolute inset-0" />
    </div>
  );
}
