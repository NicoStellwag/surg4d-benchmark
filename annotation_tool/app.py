from flask import Flask, render_template, jsonify, send_from_directory, request
from pathlib import Path
import yaml
import json

app = Flask(__name__)

PREPARED_DATA_DIR = Path(__file__).parent.parent / "prepared_data"
SPATIAL_ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations" / "spatial"
TEMPORAL_ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations" / "temporal"
DIRECTIONAL_ANNOTATIONS_DIR = Path(__file__).parent.parent / "annotations" / "directional"
SPATIAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
TEMPORAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
DIRECTIONAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)

def load_clips():
    config_path = Path(__file__).parent.parent / "config.yaml"
    with open(config_path) as f:
        config = yaml.safe_load(f)
    return config.get("cholecseg8k_clips", [])

def get_spatial_annotation_count(clip_name):
    annotation_file = SPATIAL_ANNOTATIONS_DIR / f"{clip_name}.json"
    if annotation_file.exists():
        with open(annotation_file) as f:
            data = json.load(f)
            return len(data.get("annotations", []))
    return 0

def get_temporal_annotation_count(clip_name):
    annotation_file = TEMPORAL_ANNOTATIONS_DIR / f"{clip_name}.json"
    if annotation_file.exists():
        with open(annotation_file) as f:
            data = json.load(f)
            return len(data.get("annotations", []))
    return 0

def get_directional_annotation_count(clip_name):
    annotation_file = DIRECTIONAL_ANNOTATIONS_DIR / f"{clip_name}.json"
    if annotation_file.exists():
        with open(annotation_file) as f:
            data = json.load(f)
            return len(data.get("annotations", []))
    return 0

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/clips")
def get_clips():
    clips = load_clips()
    return jsonify(clips)

@app.route("/api/annotation-counts")
def get_annotation_counts():
    clips = load_clips()
    counts = {}
    for clip in clips:
        counts[clip["name"]] = {
            "spatial": get_spatial_annotation_count(clip["name"]),
            "temporal": get_temporal_annotation_count(clip["name"]),
            "directional": get_directional_annotation_count(clip["name"])
        }
    return jsonify(counts)

@app.route("/api/clips/<clip_name>/frames")
def get_clip_frames(clip_name):
    clip_dir = PREPARED_DATA_DIR / clip_name
    if not clip_dir.exists():
        return jsonify({"error": "Clip not found"}), 404

    frame_files = sorted([f.name for f in clip_dir.glob("frame_*.png")])
    return jsonify({"frames": frame_files})

# Spatial annotations endpoint
@app.route("/api/clips/<clip_name>/annotations", methods=["GET", "POST"])
def handle_spatial_annotations(clip_name):
    # Ensure directory exists
    SPATIAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    annotation_file = SPATIAL_ANNOTATIONS_DIR / f"{clip_name}.json"

    if request.method == "GET":
        if annotation_file.exists():
            with open(annotation_file) as f:
                return jsonify(json.load(f))
        return jsonify({"annotations": []})

    elif request.method == "POST":
        data = request.get_json()
        with open(annotation_file, "w") as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})

# Temporal annotations endpoint
@app.route("/api/clips/<clip_name>/temporal-annotations", methods=["GET", "POST"])
def handle_temporal_annotations(clip_name):
    # Ensure directory exists
    TEMPORAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    annotation_file = TEMPORAL_ANNOTATIONS_DIR / f"{clip_name}.json"

    if request.method == "GET":
        if annotation_file.exists():
            with open(annotation_file) as f:
                return jsonify(json.load(f))
        return jsonify({"annotations": []})

    elif request.method == "POST":
        data = request.get_json()
        with open(annotation_file, "w") as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})

# Directional annotations endpoint
@app.route("/api/clips/<clip_name>/directional-annotations", methods=["GET", "POST"])
def handle_directional_annotations(clip_name):
    DIRECTIONAL_ANNOTATIONS_DIR.mkdir(parents=True, exist_ok=True)
    annotation_file = DIRECTIONAL_ANNOTATIONS_DIR / f"{clip_name}.json"

    if request.method == "GET":
        if annotation_file.exists():
            with open(annotation_file) as f:
                return jsonify(json.load(f))
        return jsonify({"annotations": []})

    elif request.method == "POST":
        data = request.get_json()
        with open(annotation_file, "w") as f:
            json.dump(data, f, indent=2)
        return jsonify({"success": True})

@app.route("/data/<path:filename>")
def serve_data(filename):
    return send_from_directory(PREPARED_DATA_DIR, filename)

if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=8080)
