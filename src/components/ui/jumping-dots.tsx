type JumpingDotsProps = {
  label?: string;
  className?: string;
};

export function JumpingDots({
  label = 'Quoting',
  className = '',
}: JumpingDotsProps) {
  return (
    <span
      className={`forager-jump-dots ${className}`}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span />
      <span />
      <span />
    </span>
  );
}
