'use client';

import { withBasePath } from '@/lib/base-path';
import { cn } from '@/lib/utils';
import { useEffect, useRef } from 'react';

const ASCII_SRC = withBasePath('/assets/ascii/trippin-spiral.mp4');
const ASCII_POSTER = withBasePath('/assets/ascii/trippin-spiral.webp');
const PLAYBACK_RATE = 0.58;
const FADE_MEDIA_SEC = 1.15;

function seamWeight(video: HTMLVideoElement, fadeMediaSec: number) {
  const duration = video.duration;
  if (!Number.isFinite(duration) || duration <= 0) {
    return 1;
  }
  const nearest = Math.min(video.currentTime, duration - video.currentTime);
  return Math.max(0, Math.min(1, nearest / fadeMediaSec));
}

function armVideo(video: HTMLVideoElement, startAt?: number) {
  video.muted = true;
  video.defaultMuted = true;
  video.playbackRate = PLAYBACK_RATE;
  video.playsInline = true;
  const play = () => {
    video.playbackRate = PLAYBACK_RATE;
    void video.play().catch(() => undefined);
  };
  if (startAt != null && Number.isFinite(video.duration) && video.duration > 0) {
    video.currentTime = Math.min(startAt, Math.max(0, video.duration - 0.05));
  }
  play();
}

export function AsciiArt({ className }: { className?: string }) {
  const primaryRef = useRef<HTMLVideoElement>(null);
  const offsetRef = useRef<HTMLVideoElement>(null);
  const layerARef = useRef<HTMLSpanElement>(null);
  const layerBRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const primary = primaryRef.current;
    const offset = offsetRef.current;
    const layerA = layerARef.current;
    const layerB = layerBRef.current;
    if (!primary || !offset || !layerA || !layerB) {
      return;
    }

    const syncOffset = () => {
      if (!Number.isFinite(offset.duration) || offset.duration <= 0) {
        return;
      }
      const halfway = offset.duration * 0.5;
      if (Math.abs(offset.currentTime - halfway) > offset.duration * 0.35) {
        offset.currentTime = halfway;
      }
    };

    const start = () => {
      armVideo(primary, 0);
      if (Number.isFinite(offset.duration) && offset.duration > 0) {
        armVideo(offset, offset.duration * 0.5);
      } else {
        armVideo(offset);
      }
    };

    const onMeta = () => {
      start();
      syncOffset();
    };

    primary.addEventListener('loadedmetadata', onMeta);
    offset.addEventListener('loadedmetadata', onMeta);
    primary.addEventListener('play', () => {
      primary.playbackRate = PLAYBACK_RATE;
    });
    offset.addEventListener('play', () => {
      offset.playbackRate = PLAYBACK_RATE;
    });

    if (primary.readyState >= 1) {
      armVideo(primary, 0);
    }
    if (offset.readyState >= 1) {
      armVideo(offset, offset.duration * 0.5);
    }

    let frame = 0;
    const tick = () => {
      const weightA = seamWeight(primary, FADE_MEDIA_SEC);
      const weightB = seamWeight(offset, FADE_MEDIA_SEC);
      const sum = weightA + weightB;
      const opacityA = sum > 0.001 ? weightA / sum : 0.5;
      const opacityB = sum > 0.001 ? weightB / sum : 0.5;
      layerA.style.opacity = String(opacityA);
      layerB.style.opacity = String(opacityB);
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);

    return () => {
      window.cancelAnimationFrame(frame);
      primary.removeEventListener('loadedmetadata', onMeta);
      offset.removeEventListener('loadedmetadata', onMeta);
    };
  }, []);

  return (
    <div className={cn('forager-enter-ascii-bleed', className)} aria-hidden>
      <span ref={layerARef} className="forager-enter-ascii-layer">
        <video
          ref={primaryRef}
          src={ASCII_SRC}
          poster={ASCII_POSTER}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          disablePictureInPicture
          disableRemotePlayback
        />
      </span>
      <span ref={layerBRef} className="forager-enter-ascii-layer forager-enter-ascii-layer-b">
        <video
          ref={offsetRef}
          src={ASCII_SRC}
          autoPlay
          loop
          muted
          playsInline
          aria-hidden
          disablePictureInPicture
          disableRemotePlayback
        />
      </span>
    </div>
  );
}
