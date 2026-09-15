"""Replace one forage-strip frame with a PNG, or list frames.

Usage:
  python scripts/replace-forage-frame.py --index 9 path/to/frame.png
  python scripts/replace-forage-frame.py --export-dir ./frames
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
STRIP = ROOT / "public" / "assets" / "pics" / "forager-forage-strip.png"
FRAME_W = 330
FRAME_H = 246


def load_strip() -> Image.Image:
    if not STRIP.exists():
        raise SystemExit(f"missing strip: {STRIP}")
    return Image.open(STRIP).convert("RGBA")


def frame_count(image: Image.Image) -> int:
    return image.size[0] // FRAME_W


def export_frames(dest: Path) -> None:
    image = load_strip()
    dest.mkdir(parents=True, exist_ok=True)
    count = frame_count(image)
    for index in range(count):
        frame = image.crop((index * FRAME_W, 0, (index + 1) * FRAME_W, FRAME_H))
        frame.save(dest / f"frame-{index:02d}.png")
    print(f"exported {count} frames to {dest}")


def replace_frame(index: int, source: Path) -> None:
    image = load_strip()
    count = frame_count(image)
    if index < 0 or index >= count:
        raise SystemExit(f"frame {index} out of range 0..{count - 1}")
    incoming = Image.open(source).convert("RGBA")
    if incoming.size != (FRAME_W, FRAME_H):
        incoming = incoming.resize((FRAME_W, FRAME_H), Image.NEAREST)
    image.paste(incoming, (index * FRAME_W, 0))
    image.save(STRIP, optimize=True)
    print(f"wrote frame {index} into {STRIP}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--index", type=int)
    parser.add_argument("--export-dir", type=Path)
    parser.add_argument("png", nargs="?", type=Path)
    args = parser.parse_args()
    if args.export_dir:
        export_frames(args.export_dir)
        return
    if args.index is None or args.png is None:
        raise SystemExit("pass --index N and a PNG, or --export-dir")
    replace_frame(args.index, args.png)


if __name__ == "__main__":
    main()
