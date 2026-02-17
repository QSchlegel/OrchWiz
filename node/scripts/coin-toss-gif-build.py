#!/usr/bin/env python3

from __future__ import annotations

import argparse
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build optimized coin-toss GIFs from PNG frames.")
    parser.add_argument("--frames", required=True, help="Directory containing frame-XXX.png files.")
    parser.add_argument("--out", required=True, help="Output GIF path.")
    parser.add_argument("--fps", type=int, default=20, help="Frames per second.")
    parser.add_argument("--colors", type=int, default=96, help="Palette size (fewer = smaller file).")
    parser.add_argument("--emoji", action="store_true", help="Optimize for Slack emoji (128x128, fewer frames/colors).")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    repo_root = Path(__file__).resolve().parents[2]
    core_dir = repo_root / ".agents" / "skills" / "skills" / "slack-gif-creator" / "core"
    sys.path.insert(0, str(core_dir))

    try:
        from gif_builder import GIFBuilder  # type: ignore
    except Exception as exc:  # pragma: no cover
        print("Failed to import slack-gif-creator GIFBuilder.")
        print(f"Expected at: {core_dir}")
        print("Install python deps via:")
        print(f"  python3 -m pip install -r {repo_root / '.agents' / 'skills' / 'skills' / 'slack-gif-creator' / 'requirements.txt'}")
        print(f"\nImport error: {exc}")
        return 2

    try:
        from PIL import Image  # type: ignore
    except Exception as exc:  # pragma: no cover
        print("Missing Pillow (PIL). Install python deps via:")
        print(f"  python3 -m pip install -r {repo_root / '.agents' / 'skills' / 'skills' / 'slack-gif-creator' / 'requirements.txt'}")
        print(f"\nImport error: {exc}")
        return 2

    frames_dir = Path(args.frames)
    if not frames_dir.exists():
        print(f"Frames directory does not exist: {frames_dir}")
        return 2

    frame_paths = sorted(frames_dir.glob("frame-*.png"))
    if not frame_paths:
        print(f"No frames found in {frames_dir} (expected frame-XXX.png).")
        return 2

    # Infer size from the first frame.
    first = Image.open(frame_paths[0])
    width, height = first.size

    builder = GIFBuilder(width=width, height=height, fps=args.fps)
    builder.add_frame(first)

    for frame_path in frame_paths[1:]:
        builder.add_frame(Image.open(frame_path))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    builder.save(
        out_path,
        num_colors=args.colors,
        optimize_for_emoji=args.emoji,
        remove_duplicates=False,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

