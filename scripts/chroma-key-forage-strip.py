"""Chroma-key the forage strip to character + bush only.

Re-keys from forager-forage-strip-source.png. Drops the lime grass field,
isolated speckles, and coin-adjacent chroma sparkle. Feathers subject alpha
into transparent. Protects hood greens and gold — never despill those.
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "pics" / "forager-forage-strip.png"
BACKUP = ROOT / "public" / "assets" / "pics" / "forager-forage-strip-source.png"
PREVIEW_DIR = ROOT / "public" / "assets" / "pics" / "_forage-key-preview"

FRAME_W = 330
FRAME_H = 246
MIN_KEEP_PX = 220
FEATHER_PX = 2.8


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
    """Olive hood / tunic, including mid highlights — not neon lime grass."""
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
        & (v <= 0.60)
        & ((g < 168) | (v <= 0.52))
    )


def skin_mask(rgb: np.ndarray) -> np.ndarray:
    h, s, v = rgb_to_hsv(rgb)
    return (h >= 14.0) & (h <= 48.0) & (s >= 0.22) & (v >= 0.28) & (v <= 0.92)


def outline_mask(rgb: np.ndarray) -> np.ndarray:
    _, _, v = rgb_to_hsv(rgb)
    return v < 0.16


def protect_core(rgb: np.ndarray) -> np.ndarray:
    return gold_mask(rgb) | hood_core_mask(rgb) | skin_mask(rgb) | outline_mask(rgb)


def grass_candidate(rgb: np.ndarray, key: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    h, s, v = rgb_to_hsv(rgb)
    dist = np.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
    lime = (
        (h >= 62.0)
        & (h <= 138.0)
        & (v >= 0.32)
        & (s >= 0.22)
        & (g > r + 8)
        & (g > b + 10)
    )
    near_key = (dist <= 62.0) & (v >= 0.36) & (g > r + 6) & (g > b + 8)
    pale = (
        (s <= 0.28)
        & (v >= 0.48)
        & (v <= 0.93)
        & (np.abs(r - g) < 32)
        & (np.abs(g - b) < 38)
        & (r >= 118)
        & (g >= 130)
    )
    sparkle = (
        (h >= 55.0)
        & (h <= 140.0)
        & (v >= 0.55)
        & (s >= 0.18)
        & (g > r + 4)
        & (g > b + 6)
    )
    return (lime | near_key | pale | sparkle) & ~gold_mask(rgb)


def flood_from_edges(walkable: np.ndarray, blocked: np.ndarray) -> np.ndarray:
    height, width = walkable.shape
    keyed = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    def try_push(y: int, x: int) -> None:
        if y < 0 or x < 0 or y >= height or x >= width:
            return
        if keyed[y, x] or blocked[y, x] or not walkable[y, x]:
            return
        keyed[y, x] = True
        queue.append((y, x))

    for x in range(width):
        try_push(0, x)
        try_push(height - 1, x)
    for y in range(height):
        try_push(y, 0)
        try_push(y, width - 1)

    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            try_push(ny, nx)
    return keyed


def label_components(keep: np.ndarray) -> tuple[np.ndarray, list[int]]:
    height, width = keep.shape
    labels = np.zeros((height, width), dtype=np.int32)
    sizes: list[int] = [0]
    next_id = 1
    for y in range(height):
        for x in range(width):
            if not keep[y, x] or labels[y, x] != 0:
                continue
            queue = deque([(y, x)])
            labels[y, x] = next_id
            count = 0
            while queue:
                cy, cx = queue.popleft()
                count += 1
                for ny, nx in (
                    (cy - 1, cx),
                    (cy + 1, cx),
                    (cy, cx - 1),
                    (cy, cx + 1),
                ):
                    if ny < 0 or nx < 0 or ny >= height or nx >= width:
                        continue
                    if not keep[ny, nx] or labels[ny, nx] != 0:
                        continue
                    labels[ny, nx] = next_id
                    queue.append((ny, nx))
            sizes.append(count)
            next_id += 1
    return labels, sizes


def drop_speckles(keep: np.ndarray) -> np.ndarray:
    """Keep the character and bush only — the two largest solid blobs."""
    labels, sizes = label_components(keep)
    ranked = sorted(
        ((label_id, size) for label_id, size in enumerate(sizes) if label_id > 0),
        key=lambda item: item[1],
        reverse=True,
    )
    out = np.zeros_like(keep)
    kept = 0
    for label_id, size in ranked:
        if size < MIN_KEEP_PX:
            continue
        out[labels == label_id] = True
        kept += 1
        if kept >= 2:
            break
    return out


def reclaim_subject(rgb: np.ndarray, keep: np.ndarray) -> np.ndarray:
    """Pull hood / gold / skin pixels back if they sit on the subject edge."""
    reclaim = gold_mask(rgb) | hood_core_mask(rgb) | skin_mask(rgb) | outline_mask(rgb)
    grown = keep.copy()
    height, width = keep.shape
    coords = np.argwhere(keep)
    for y, x in coords:
        for ny in range(max(0, y - 2), min(height, y + 3)):
            for nx in range(max(0, x - 2), min(width, x + 3)):
                if reclaim[ny, nx]:
                    grown[ny, nx] = True
    return grown


def distance_feather(keep: np.ndarray, radius: float) -> np.ndarray:
    """Alpha 255 on the subject core, fading to 0 across `radius` px."""
    height, width = keep.shape
    inf = height + width + 8
    dist = np.full((height, width), inf, dtype=np.float32)
    dist[keep] = 0.0
    queue = deque(map(tuple, np.argwhere(keep)))
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
    fade = np.clip(1.0 - dist / radius, 0.0, 1.0)
    fade[keep] = 1.0
    return np.round(fade * 255.0).astype(np.uint8)


def despill_fringe(rgb: np.ndarray, alpha: np.ndarray, protect: np.ndarray) -> np.ndarray:
    out = rgb.astype(np.float32)
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    max_rb = np.maximum(r, b)
    fringe = (alpha > 10) & (alpha < 200) & ~protect
    spill = fringe & (g > max_rb + 22)
    out[..., 1] = np.where(spill, max_rb + (g - max_rb) * 0.4, g)
    return np.clip(out, 0, 255).astype(np.uint8)


def key_frame(frame: np.ndarray) -> np.ndarray:
    rgb = frame[..., :3].copy()
    protect = protect_core(rgb)
    edge = np.concatenate(
        [
            rgb[1:12, 12:-12].reshape(-1, 3),
            rgb[-12:-1, 12:-12].reshape(-1, 3),
            rgb[12:-12, 1:12].reshape(-1, 3),
            rgb[12:-12, -12:-1].reshape(-1, 3),
        ]
    )
    key = np.median(edge, axis=0)
    grass = grass_candidate(rgb, key)
    flooded = flood_from_edges(grass, protect)
    keep = ~flooded
    keep[protect] = True
    keep = drop_speckles(keep)
    keep = reclaim_subject(rgb, keep)
    keep = drop_speckles(keep)
    keep[protect & (hood_core_mask(rgb) | gold_mask(rgb) | skin_mask(rgb))] = True
    keep = drop_speckles(keep)
    alpha = distance_feather(keep, FEATHER_PX)
    alpha[protect & keep] = 255
    rgb = despill_fringe(rgb, alpha, protect)
    # Kill leftover RGB sparkle in fully transparent pixels.
    rgb[alpha < 8] = 0
    return np.dstack([rgb, alpha])


def main() -> None:
    if not BACKUP.exists() and not SRC.exists():
        raise SystemExit(f"missing sprite strip: {SRC}")
    source = BACKUP if BACKUP.exists() else SRC
    image = Image.open(source).convert("RGBA")
    arr = np.array(image)
    height, width = arr.shape[:2]
    if width != FRAME_W * 17 or height != FRAME_H:
        print(f"unexpected size {width}x{height}; slicing {FRAME_W}x{FRAME_H}")

    frames = []
    frame_count = width // FRAME_W
    for index in range(frame_count):
        x0 = index * FRAME_W
        keyed = key_frame(arr[:, x0 : x0 + FRAME_W])
        frames.append(keyed)
        opaque = (keyed[..., 3] > 16).mean()
        print(f"frame {index:02d} opaque {opaque:.1%}")

    strip = np.concatenate(frames, axis=1)
    out = Image.fromarray(strip, mode="RGBA")
    out.save(SRC, optimize=True)
    PREVIEW_DIR.mkdir(exist_ok=True)
    for index, frame in enumerate(frames):
        Image.fromarray(frame, mode="RGBA").save(PREVIEW_DIR / f"keyed-{index:02d}.png")
    print(f"wrote {SRC} ({out.size[0]}x{out.size[1]}) from {source.name}")


if __name__ == "__main__":
    main()
