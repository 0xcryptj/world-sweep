import {
  type ComponentPropsWithoutRef,
  type CSSProperties,
  type FC,
} from 'react';

import { cn } from '@/lib/utils';

export interface AnimatedShinyTextProps
  extends ComponentPropsWithoutRef<'span'> {
  shimmerWidth?: number;
}

export const AnimatedShinyText: FC<AnimatedShinyTextProps> = ({
  children,
  className,
  shimmerWidth = 100,
  ...props
}) => {
  return (
    <span
      style={
        {
          '--shiny-width': `${shimmerWidth}px`,
        } as CSSProperties
      }
      className={cn(
        'animate-shiny-text bg-size-[var(--shiny-width)_100%] bg-clip-text bg-no-repeat [background-position:0_0]',
        'bg-linear-to-r from-transparent via-white/80 via-50% to-transparent',
        className,
      )}
      {...props}
    >
      {children}
    </span>
  );
};
