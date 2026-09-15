"""Wipe stray corner grass on frames 5-7 and feather strip silhouettes.

Works from the already-keyed strip (does not re-chroma-key from source).
Run once per keyed strip — a second pass will keep eating the silhouette.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "pics" / "forager-forage-strip.png"
PREVIEW_DIR = ROOT / "public" / "assets" / "pics" / "_forage-key-preview"

FRAME_W = 330
FRAME_H = 246
IN_FEATHER = 2.6
OUT_FEATHER = 3.4
CORNER_FRAMES = (5, 6, 7)


def rgb_to_hsv(rgb: np.ndarray) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    rgb_f = rgb.astype(np.float32) / 255.0
    r, g, b = rgb_f[..., 0], rgb_f[..., 1], rgb_f[..., 2]
    maxc = np.maximum(np.maximum(r, g), b)
    minc = np.minimum(np.minimum(r, g), b)
    delta = np.maximum(maxc - minc, 1e-6)
    h = np.zeros_like(maxc)
    mask_r = (maxc == r) & (maxc != minc)
    mask_g = (maxc == g) & (maxc != minc)
    mask_b = (maxc == b) & (maxc != minc)
    h[mask_r] = ((g[mask_r] - b[mask_r]) / delta[mask_r]) % 6.0
    h[mask_g] = (b[mask_g] - r[mask_g]) / delta[mask_g] + 2.0
    h[mask_b] = (r[mask_b] - g[mask_b]) / delta[mask_b] + 4.0
    h = h * 60.0
    s = np.where(maxc <= 1e-6, 0.0, (maxc - minc) / np.maximum(maxc, 1e-6))
    return h, s, maxc


def gold_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    h, s, v = rgb_to_hsv(rgb)
    return (
        (h >= 22.0)
        & (h <= 58.0)
        & (s >= 0.34)
        & (v >= 0.42)
        & (r >= g - 4)
        & (r > b + 16)
        & (g > b + 6)
    )


def hood_core_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    h, s, v = rgb_to_hsv(rgb)
    return (
        (h >= 62.0)
        & (h <= 155.0)
        & (v >= 0.08)
        & (v <= 0.60)
        & (s >= 0.14)
        & (s <= 0.86)
        & (g + 6 >= r)
        & (g > b + 2)
        & (g < 176)
        & ((g < 168) | (v <= 0.52))
    )


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    h, s, v = rgb_to_hsv(rgb)
    return (h >= 14.0) & (h <= 48.0) & (s >= 0.22) & (v >= 0.28) & (v <= 0.92)


def protect_core(rgb: np.ndarray) -> np.ndarray:
    _, _, v = rgb_to_hsv(rgb)
    return gold_mask(rgb) | hood_core_mask(rgb) | skin_mask(rgb) | (v < 0.16)


def label_components(keep: np.ndarray) -> tuple[np.ndarray, list[tuple[int, int, int, int, int]]]:
    height, width = keep.shape
    labels = np.zeros((height, width), dtype=np.int32)
    boxes: list[tuple[int, int, int, int, int]] = [(0, 0, 0, 0, 0)]
    next_id = 1
    for y in range(height):
        for x in range(width):
            if not keep[y, x] or labels[y, x] != 0:
                continue
            queue = deque([(y, x)])
            labels[y, x] = next_id
            count = 0
            minx = maxx = x
            miny = maxy = y
            while queue:
                cy, cx = queue.popleft()
                count += 1
                minx = min(minx, cx)
                maxx = max(maxx, cx)
                miny = min(miny, cy)
                maxy = max(maxy, cy)
                for ny, nx in ((cy - 1, cx), (cy + 1, cx), (cy, cx - 1), (cy, cx + 1)):
                    if ny < 0 or nx < 0 or ny >= height or nx >= width:
                        continue
                    if not keep[ny, nx] or labels[ny, nx] != 0:
                        continue
                    labels[ny, nx] = next_id
                    queue.append((ny, nx))
            boxes.append((minx, miny, maxx, maxy, count))
            next_id += 1
    return labels, boxes


def wipe_corner_blotch(frame: np.ndarray, index: int) -> np.ndarray:
    """Remove leftover lime clumps in the far corner, away from the shrub."""
    out = frame.copy()
    rgb = out[..., :3].astype(np.float32)
    alpha = out[..., 3]
    keep = alpha > 16
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green = keep & (g > r + 8) & (g > b + 10) & (g > 70)

    yy, xx = np.indices(keep.shape)
    # Isolated island in the bottom-right (frames 6 and 7).
    labels, boxes = label_components(keep)
    drop = np.zeros_like(keep)
    for label_id, (minx, miny, maxx, maxy, count) in enumerate(boxes):
        if label_id == 0:
            continue
        cx = (minx + maxx) / 2.0
        cy = (miny + maxy) / 2.0
        cornerish = minx >= 275 and miny >= 200 and count < 900
        far = cx >= 290 and cy >= 215 and count < 1200
        if cornerish or far:
            drop[labels == label_id] = True

    # Frame 5's blotch is still bridged to the dirt — snip the hanging lime.
    hanging = np.zeros_like(keep)
    if index == 5:
        hanging = green & (xx >= 268) & (yy >= 219)
    elif index in (6, 7):
        hanging = green & (xx >= 292) & (yy >= 220)

    kill = drop | hanging
    out[kill, 3] = 0
    out[kill, :3] = 0
    print(
        f"frame {index:02d} wiped {int(kill.sum())} px "
        f"(island {int(drop.sum())}, hanging {int(hanging.sum())})"
    )
    return out


def distance_field(seed: np.ndarray, radius: float) -> np.ndarray:
    height, width = seed.shape
    inf = height + width + 8
    dist = np.full((height, width), inf, dtype=np.float32)
    dist[seed] = 0.0
    queue = deque(map(tuple, np.argwhere(seed)))
    while queue:
        y, x = queue.popleft()
        d = dist[y, x]
        if d >= radius:
            continue
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if ny < 0 or nx < 0 or ny >= height or nx >= width:
                continue
            nd = d + 1.0
            if nd < dist[ny, nx] and nd <= radius:
                dist[ny, nx] = nd
                queue.append((ny, nx))
    return dist


def feather_frame(frame: np.ndarray) -> np.ndarray:
    rgb = frame[..., :3].copy()
    alpha_in = frame[..., 3]
    keep = alpha_in >= 72
    protect = protect_core(rgb) & (alpha_in >= 40)

    dist_out = distance_field(keep, OUT_FEATHER)
    dist_in = distance_field(~keep, IN_FEATHER)

    fade_out = np.clip(1.0 - dist_out / OUT_FEATHER, 0.0, 1.0)
    fade_in = np.clip(dist_in / IN_FEATHER, 0.0, 1.0)
    fade_in[protect] = 1.0
    fade_in[~keep] = 0.0

    alpha = np.zeros(keep.shape, dtype=np.float32)
    alpha[keep] = 255.0 * fade_in[keep]
    fringe = (~keep) & (dist_out < OUT_FEATHER)
    alpha[fringe] = 255.0 * fade_out[fringe]
    alpha[protect] = 255.0
    alpha = np.clip(np.round(alpha), 0, 255).astype(np.uint8)

    out_rgb = rgb.astype(np.float32)
    r, g, b = out_rgb[..., 0], out_rgb[..., 1], out_rgb[..., 2]
    max_rb = np.maximum(r, b)
    fringe_px = (alpha > 8) & (alpha < 220) & ~protect
    spill = fringe_px & (g > max_rb + 18)
    out_rgb[..., 1] = np.where(spill, max_rb + (g - max_rb) * 0.28, g)
    out_rgb[alpha < 8] = 0
    return np.dstack([np.clip(out_rgb, 0, 255).astype(np.uint8), alpha])


def main() -> None:
    image = Image.open(SRC).convert("RGBA")
    arr = np.array(image)
    height, width = arr.shape[:2]
    if width % FRAME_W != 0 or height != FRAME_H:
        raise SystemExit(f"unexpected strip size {width}x{height}")

    frames = []
    count = width // FRAME_W
    for index in range(count):
        frame = arr[:, index * FRAME_W : (index + 1) * FRAME_W]
        if index in CORNER_FRAMES:
            frame = wipe_corner_blotch(frame, index)
        frames.append(feather_frame(frame))

    strip = np.concatenate(frames, axis=1)
    out = Image.fromarray(strip, mode="RGBA")
    out.save(SRC, optimize=True)
    PREVIEW_DIR.mkdir(exist_ok=True)
    bg = np.full((FRAME_H, FRAME_W, 3), 12, dtype=np.uint8)
    for index, frame in enumerate(frames):
        Image.fromarray(frame, mode="RGBA").save(PREVIEW_DIR / f"live-{index:02d}.png")
        if index in CORNER_FRAMES or index in (0, 8, 16):
            a = frame[..., 3:4].astype(np.float32) / 255.0
            comp = frame[..., :3].astype(np.float32) * a + bg.astype(np.float32) * (1.0 - a)
            Image.fromarray(comp.astype(np.uint8)).save(PREVIEW_DIR / f"blend-{index:02d}.png")
    print(f"wrote {SRC} ({out.size[0]}x{out.size[1]})")


if __name__ == "__main__":
    main()
