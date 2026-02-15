from __future__ import annotations

import argparse
import json
import re
import shutil
from pathlib import Path

import cv2

FRAME_PATTERN = re.compile(r"frame_(\d+)_(\d+)\.png")
ROOT_DIR = Path(__file__).parent
PREPARED_DATA_DIR = ROOT_DIR / "prepared_data"
SPATIAL_ANNOTATIONS_DIR = ROOT_DIR / "annotations" / "spatial"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Dump raw frames and spatial annotations for sanity checks."
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT_DIR / "spatial_sanity_dump",
        help="Destination folder for the dump.",
    )
    parser.add_argument(
        "--clips",
        nargs="*",
        default=None,
        help="Optional clip names to process. If omitted, all spatial annotation files are used.",
    )
    return parser.parse_args()


def load_annotations(annotation_file: Path) -> list[dict]:
    data = json.loads(annotation_file.read_text())
    return data["annotations"]


def group_annotations_by_timestep(annotations: list[dict]) -> dict[int, list[dict]]:
    grouped: dict[int, list[dict]] = {}
    for annotation in annotations:
        timestep = int(annotation["timestep"])
        grouped.setdefault(timestep, []).append(annotation)
    return grouped


def get_frame_mapping(clip_dir: Path) -> dict[int, Path]:
    frame_mapping: dict[int, Path] = {}
    for frame_path in sorted(clip_dir.glob("frame_*.png")):
        match = FRAME_PATTERN.fullmatch(frame_path.name)
        if not match:
            continue
        timestep = int(match.group(1))
        frame_mapping[timestep] = frame_path
    return frame_mapping


def draw_annotations(frame_path: Path, annotations: list[dict], output_path: Path) -> None:
    image = cv2.imread(str(frame_path))
    assert image is not None, f"Could not read frame: {frame_path}"

    for annotation in annotations:
        x, y = annotation["pil_coords"]
        point = (int(x), int(y))
        text = f'{annotation["id"]}: {annotation["query"]}'

        cv2.circle(image, point, 8, (255, 255, 255), thickness=2)
        cv2.circle(image, point, 6, (0, 0, 255), thickness=-1)
        cv2.putText(
            image,
            text,
            (point[0] + 10, max(20, point[1] - 10)),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.5,
            (0, 255, 255),
            1,
            cv2.LINE_AA,
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(str(output_path), image)


def process_clip(clip_name: str, output_dir: Path) -> dict:
    clip_dir = PREPARED_DATA_DIR / clip_name
    annotation_file = SPATIAL_ANNOTATIONS_DIR / f"{clip_name}.json"
    annotations = load_annotations(annotation_file)
    grouped_annotations = group_annotations_by_timestep(annotations)
    frame_mapping = get_frame_mapping(clip_dir)

    clip_output_dir = output_dir / clip_name
    raw_output_dir = clip_output_dir / "raw_frames"
    annotated_output_dir = clip_output_dir / "annotated_frames"
    raw_output_dir.mkdir(parents=True, exist_ok=True)
    annotated_output_dir.mkdir(parents=True, exist_ok=True)

    copied_frames = 0
    annotated_frames = 0
    used_timesteps = sorted({int(annotation["timestep"]) for annotation in annotations})
    for timestep in used_timesteps:
        frame_path = frame_mapping[timestep]
        raw_target = raw_output_dir / frame_path.name
        shutil.copy2(frame_path, raw_target)
        copied_frames += 1

        frame_annotations = grouped_annotations[timestep]
        draw_annotations(
            frame_path=frame_path,
            annotations=frame_annotations,
            output_path=annotated_output_dir / frame_path.name,
        )
        annotated_frames += 1

    shutil.copy2(annotation_file, clip_output_dir / "spatial_annotations.json")
    frame_links = []
    for annotation in annotations:
        timestep = int(annotation["timestep"])
        frame_path = frame_mapping[timestep]
        frame_links.append(
            {
                "annotation_id": annotation["id"],
                "timestep": timestep,
                "frame_file": frame_path.name,
                "pil_coords": annotation["pil_coords"],
                "numpy_coords": annotation["numpy_coords"],
                "query": annotation["query"],
            }
        )
    (clip_output_dir / "annotation_frame_index.json").write_text(
        json.dumps({"clip": clip_name, "links": frame_links}, indent=2)
    )

    return {
        "clip": clip_name,
        "raw_frames": copied_frames,
        "annotated_frames": annotated_frames,
        "spatial_annotations": len(annotations),
    }


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir
    output_dir.mkdir(parents=True, exist_ok=True)

    if args.clips:
        clip_names = args.clips
    else:
        clip_names = sorted(annotation_path.stem for annotation_path in SPATIAL_ANNOTATIONS_DIR.glob("*.json"))

    summary = []
    for clip_name in clip_names:
        summary.append(process_clip(clip_name, output_dir))

    summary_path = output_dir / "summary.json"
    summary_path.write_text(json.dumps({"clips": summary}, indent=2))
    print(f"Wrote dump to: {output_dir}")
    print(f"Summary: {summary_path}")


if __name__ == "__main__":
    main()
