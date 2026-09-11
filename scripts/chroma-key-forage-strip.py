"""Chroma-key the forage strip's lime grass field only.

Protects dark/olive hood greens and gold coin hues. Feathers only the
grass matte — no flood through the character, no despill on hood/gold.
"""

from __future__ import annotations

import shutil
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "assets" / "pics" / "forager-forage-strip.png"
BACKUP = ROOT / "public" / "assets" / "pics" / "forager-forage-strip-source.png"
PREVIEW_DIR = ROOT / "public" / "assets" / "pics" / "_forage-key-preview"

FRAME_W = 330
FRAME_H = 246


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


def protect_mask(rgb: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    h, s, v = rgb_to_hsv(rgb)
    # Dark / olive hood and tunic — keep these greens.
    hood = (
        (h >= 55.0)
        & (h <= 165.0)
        & (v < 0.52)
        & (s >= 0.12)
        & (g + 6 >= r)
    )
    # Gold coin and warm metal — never treat as grass.
    gold = (
        (h >= 18.0)
        & (h <= 64.0)
        & (s >= 0.28)
        & (v >= 0.36)
        & (r >= g - 8)
        & (r > b + 10)
    )
    skin = (h >= 14.0) & (h <= 50.0) & (s >= 0.22) & (v >= 0.30)
    outline = v < 0.22
    return hood | gold | skin | outline


def lime_field_mask(rgb: np.ndarray, key: np.ndarray) -> np.ndarray:
    r = rgb[..., 0].astype(np.float32)
    g = rgb[..., 1].astype(np.float32)
    b = rgb[..., 2].astype(np.float32)
    h, s, v = rgb_to_hsv(rgb)
    dist = np.sqrt((r - key[0]) ** 2 + (g - key[1]) ** 2 + (b - key[2]) ** 2)
    # Bright lime grass only — not dark hood, not gold.
    lime = (
        (h >= 68.0)
        & (h <= 132.0)
        & (v >= 0.50)
        & (s >= 0.32)
        & (g > r + 16)
        & (g > b + 20)
    )
    near_key = (dist <= 48.0) & (v >= 0.48) & (g > r + 10) & (g > b + 12)
    # Pale path stones in the field — not eyes (those sit near v=1).
    stone = (
        (s <= 0.24)
        & (v >= 0.52)
        & (v <= 0.90)
        & (np.abs(r - g) < 28)
        & (np.abs(g - b) < 34)
        & (r >= 130)
    )
    return (lime | near_key | stone) & ~protect_mask(rgb)


def flood_from_edges(is_bg: np.ndarray) -> np.ndarray:
    height, width = is_bg.shape
    keyed = np.zeros((height, width), dtype=bool)
    queue: deque[tuple[int, int]] = deque()

    def try_push(y: int, x: int) -> None:
        if y < 0 or x < 0 or y >= height or x >= width:
            return
        if keyed[y, x] or not is_bg[y, x]:
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


def despill_fringe(rgb: np.ndarray, alpha: np.ndarray, protect: np.ndarray) -> np.ndarray:
    """Pull lime spill only off the grass fringe — never hood or gold."""
    out = rgb.astype(np.float32)
    r, g, b = out[..., 0], out[..., 1], out[..., 2]
    max_rb = np.maximum(r, b)
    fringe = (alpha > 8) & (alpha < 210) & ~protect
    spill = fringe & (g > max_rb + 18)
    g2 = np.where(spill, max_rb + (g - max_rb) * 0.55, g)
    out[..., 1] = g2
    return np.clip(out, 0, 255).astype(np.uint8)


def feather_grass_only(alpha: np.ndarray, protect: np.ndarray) -> np.ndarray:
    img = Image.fromarray(alpha, mode="L")
    img = img.filter(ImageFilter.GaussianBlur(radius=0.55))
    arr = np.array(img).astype(np.float32)
    arr = np.where(arr >= 242, 255.0, arr)
    arr[protect] = 255.0
    return np.clip(arr, 0, 255).astype(np.uint8)


def key_frame(frame: np.ndarray) -> np.ndarray:
    rgb = frame[..., :3].copy()
    protect = protect_mask(rgb)
    edge = np.concatenate(
        [
            rgb[1:10, 10:-10].reshape(-1, 3),
            rgb[-10:-1, 10:-10].reshape(-1, 3),
            rgb[10:-10, 1:10].reshape(-1, 3),
            rgb[10:-10, -10:-1].reshape(-1, 3),
        ]
    )
    key = np.median(edge, axis=0)
    field = lime_field_mask(rgb, key)
    keyed = flood_from_edges(field)
    keyed |= field & ~protect
    keyed[protect] = False
    alpha = np.where(keyed, 0, 255).astype(np.uint8)
    alpha = feather_grass_only(alpha, protect)
    rgb = despill_fringe(rgb, alpha, protect)
    return np.dstack([rgb, alpha])


def main() -> None:
    if not SRC.exists() and not BACKUP.exists():
        raise SystemExit(f"missing sprite strip: {SRC}")
    if BACKUP.exists() is False and SRC.exists():
        shutil.copy2(SRC, BACKUP)
        print(f"backed up original -> {BACKUP.name}")

    image = Image.open(BACKUP if BACKUP.exists() else SRC).convert("RGBA")
    arr = np.array(image)
    height, width = arr.shape[:2]
    if width != FRAME_W * 17 or height != FRAME_H:
        print(f"unexpected size {width}x{height}; continuing with {FRAME_W}x{FRAME_H} slices")

    frames = []
    frame_count = width // FRAME_W
    for index in range(frame_count):
        x0 = index * FRAME_W
        frame = arr[:, x0 : x0 + FRAME_W]
        keyed = key_frame(frame)
        frames.append(keyed)
        opaque = (keyed[..., 3] > 16).mean()
        print(f"frame {index:02d} opaque {opaque:.1%}")

    strip = np.concatenate(frames, axis=1)
    out = Image.fromarray(strip, mode="RGBA")
    out.save(SRC, optimize=True)
    PREVIEW_DIR.mkdir(exist_ok=True)
    for index in range(max(0, len(frames) - 5), len(frames)):
        Image.fromarray(frames[index], mode="RGBA").save(
            PREVIEW_DIR / f"keyed-{index:02d}.png"
        )
    if frames:
        Image.fromarray(frames[0], mode="RGBA").save(PREVIEW_DIR / "keyed-00.png")
    print(f"wrote {SRC} ({out.size[0]}x{out.size[1]})")


if __name__ == "__main__":
    main()
