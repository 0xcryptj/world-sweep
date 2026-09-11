'use client';

import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

type FlickeringGridProps = {
  className?: string;
  squareSize?: number;
  gridGap?: number;
  flickerChance?: number;
  color?: string;
  maxOpacity?: number;
};

export function FlickeringGrid({
  className,
  squareSize = 3,
  gridGap = 10,
  flickerChance = 0.05,
  color = 'rgb(52, 110, 58)',
  maxOpacity = 0.12,
}: FlickeringGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const colorMatch = color.match(/\d+/g);
    const fill =
      colorMatch && colorMatch.length >= 3
        ? `rgba(${colorMatch[0]}, ${colorMatch[1]}, ${colorMatch[2]},`
        : 'rgba(52, 110, 58,';

    let cols = 0;
    let rows = 0;
    let squares = new Float32Array(0);
    let dpr = 1;
    let inView = true;
    let frame = 0;
    let lastTime = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      const width = container.clientWidth;
      const height = container.clientHeight;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      cols = Math.ceil(width / (squareSize + gridGap));
      rows = Math.ceil(height / (squareSize + gridGap));
      squares = new Float32Array(cols * rows);
      for (let i = 0; i < squares.length; i += 1) {
        squares[i] = Math.random() * maxOpacity;
      }
    };

    const draw = (time: number) => {
      if (!inView) {
        frame = requestAnimationFrame(draw);
        return;
      }
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTime = time;
      for (let i = 0; i < squares.length; i += 1) {
        if (Math.random() < flickerChance * delta) {
          squares[i] = Math.random() * maxOpacity;
        }
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const cell = (squareSize + gridGap) * dpr;
      const size = squareSize * dpr;
      for (let i = 0; i < cols; i += 1) {
        for (let j = 0; j < rows; j += 1) {
          ctx.fillStyle = `${fill}${squares[i * rows + j]})`;
          ctx.fillRect(i * cell, j * cell, size, size);
        }
      }
      frame = requestAnimationFrame(draw);
    };

    resize();
    frame = requestAnimationFrame(draw);

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const visibility = new IntersectionObserver(([entry]) => {
      inView = entry.isIntersecting;
    });
    visibility.observe(canvas);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      visibility.disconnect();
    };
  }, [color, flickerChance, gridGap, maxOpacity, squareSize]);

  return (
    <div ref={containerRef} className={cn('h-full w-full', className)}>
      <canvas ref={canvasRef} className="pointer-events-none" />
    </div>
  );
}
