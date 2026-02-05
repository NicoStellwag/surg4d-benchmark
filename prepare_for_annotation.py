import yaml
import cv2
from pathlib import Path


def load_config(config_path: str) -> dict:
    with open(config_path) as f:
        return yaml.safe_load(f)


def prepare_clip(clip_config: dict, cholecseg8k_dir: Path, output_dir: Path):
    video_id = clip_config["video_id"]
    first_frame = clip_config["first_frame"]
    last_frame = clip_config["last_frame"]
    original_stride = clip_config["original_frame_stride"]
    annotation_stride = clip_config["annotation_frame_stride"]
    clip_name = clip_config["name"]

    video_dir = cholecseg8k_dir / f"video{video_id:02d}"
    
    video_subdirs = list(video_dir.iterdir())
    clip_dir = None
    for subdir in video_subdirs:
        if subdir.name.startswith(clip_name):
            clip_dir = subdir
            break
    
    if clip_dir is None:
        raise ValueError(f"Could not find clip directory for {clip_name} in {video_dir}")

    clip_output_dir = output_dir / clip_name
    clip_output_dir.mkdir(parents=True, exist_ok=True)

    video_frames = []
    annotation_frames = []
    annotation_mapping = []
    consecutive_id = 0
    
    for frame_id in range(first_frame, last_frame, original_stride):
        frame_file = clip_dir / f"frame_{frame_id}_endo.png"
        
        if not frame_file.exists():
            print(f"Warning: Frame file not found: {frame_file}")
            continue
        
        frame = cv2.imread(str(frame_file))
        if frame is None:
            print(f"Warning: Could not read frame: {frame_file}")
            continue
        
        video_frames.append(frame)
        
        if (frame_id - first_frame) % annotation_stride == 0:
            annotation_frames.append(frame)
            annotation_mapping.append((consecutive_id, frame_id))
            consecutive_id += 1

    if not video_frames:
        raise ValueError(f"No frames found for clip {clip_name}")

    height, width = video_frames[0].shape[:2]
    video_path = clip_output_dir / "video.mp4"
    fourcc = cv2.VideoWriter_fourcc(*'avc1')
    video_writer = cv2.VideoWriter(str(video_path), fourcc, 25.0, (width, height))
    
    for frame in video_frames:
        video_writer.write(frame)
    video_writer.release()
    
    print(f"Created video: {video_path}")

    for consecutive_id, original_frame_id in annotation_mapping:
        output_filename = f"frame_{consecutive_id:02d}_{original_frame_id:04d}.png"
        output_path = clip_output_dir / output_filename
        frame_idx = consecutive_id
        cv2.imwrite(str(output_path), annotation_frames[frame_idx])
    
    print(f"Saved {len(annotation_frames)} annotation frames to {clip_output_dir}")


def main():
    config_path = Path("config.yaml")
    cholecseg8k_dir = Path("cholecseg8k")
    output_dir = Path("prepared_data")
    
    output_dir.mkdir(exist_ok=True)
    
    config = load_config(str(config_path))
    
    for clip_config in config["cholecseg8k_clips"]:
        print(f"Processing clip: {clip_config['name']}")
        prepare_clip(clip_config, cholecseg8k_dir, output_dir)
        print()


if __name__ == "__main__":
    main()
