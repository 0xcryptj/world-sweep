import { cn } from '@/lib/utils';

type CubeLoaderProps = {
  className?: string;
  size?: 'xs' | 'sm' | 'md';
};

/**
 * CSS 3D transmitting-modules cube (CodeSandbox loader motion).
 * Scan / quote / balance only — no Three.js, no GLTF, no Environment scene.
 */
export function CubeLoader({ className, size = 'md' }: CubeLoaderProps) {
  return (
    <div
      className={cn(
        'forager-cube-loader',
        size === 'sm' ? 'forager-cube-loader-sm' : null,
        size === 'xs' ? 'forager-cube-loader-xs' : null,
        className,
      )}
      aria-hidden
    >
      <div className="forager-cube">
        <div className="forager-cube-sides">
          <span className="forager-cube-face forager-cube-face-front" />
          <span className="forager-cube-face forager-cube-face-back" />
          <span className="forager-cube-face forager-cube-face-right" />
          <span className="forager-cube-face forager-cube-face-left" />
          <span className="forager-cube-face forager-cube-face-top" />
          <span className="forager-cube-face forager-cube-face-bottom" />
        </div>
      </div>
    </div>
  );
}
