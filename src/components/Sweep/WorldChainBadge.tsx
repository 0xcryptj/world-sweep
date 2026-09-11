export function WorldChainBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`forager-world-badge ${className}`}
      aria-hidden
    >
      <svg viewBox="0 0 16 16" width="14" height="14">
        <circle cx="8" cy="8" r="8" fill="#0a0a0a" />
        <circle
          cx="8"
          cy="8"
          r="5.15"
          fill="none"
          stroke="#f5f5f5"
          strokeWidth="1.35"
        />
        <circle cx="8" cy="8" r="1.55" fill="#f5f5f5" />
      </svg>
    </span>
  );
}
