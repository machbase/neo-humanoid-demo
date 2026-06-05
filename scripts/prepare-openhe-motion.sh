#!/usr/bin/env bash
set -euo pipefail

MOTION_PATH="${1:-lafan1_retargeted/walk1_subject1.pkl}"
TASK_PREFIX="${TASK_PREFIX:-openhe}"
RAW_ROOT="${RAW_ROOT:-data/raw/openhe/g1-retargeted-motions}"
OUT_ROOT="${OUT_ROOT:-data/raw/openhe-converted}"
VENV="${VENV:-/tmp/neo-openhe-venv}"
BASE_URL="${BASE_URL:-https://huggingface.co/datasets/openhe/g1-retargeted-motions/resolve/main}"

if ! command -v curl >/dev/null 2>&1; then
  echo "curl is required" >&2
  exit 2
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required for OpenHE pickle conversion" >&2
  exit 2
fi

safe_name() {
  printf '%s' "$1" | tr -c 'A-Za-z0-9_.-' '_'
}

motion_base="$(basename "$MOTION_PATH" .pkl)"
task_name="$(safe_name "${TASK_PREFIX}_${motion_base}")"
archive="$RAW_ROOT/$MOTION_PATH"
url="$BASE_URL/$MOTION_PATH"

mkdir -p "$(dirname "$archive")" "$OUT_ROOT"

if [ ! -s "$archive" ]; then
  echo "download $url"
  tmp="${archive}.download"
  rm -f "$tmp"
  curl -L --fail --retry 3 --retry-delay 3 -o "$tmp" "$url"
  mv "$tmp" "$archive"
else
  echo "use existing $archive"
fi

if [ ! -x "$VENV/bin/python" ]; then
  python3 -m venv "$VENV"
fi

"$VENV/bin/python" - "$VENV" <<'PY'
import importlib.util
import subprocess
import sys

venv = sys.argv[1]
missing = [name for name in ("numpy", "joblib") if importlib.util.find_spec(name) is None]
if missing:
    subprocess.check_call([f"{venv}/bin/python", "-m", "pip", "install", "-q"] + missing)
PY

"$VENV/bin/python" - "$archive" "$OUT_ROOT" "$task_name" "$MOTION_PATH" "$TASK_PREFIX" <<'PY'
import json
import math
import os
import sys

import joblib

archive, out_root, task_name, motion_path, task_prefix = sys.argv[1:6]

def round_list(values, digits=6):
    return [round(float(v), digits) for v in values]

def quat_to_rpy(q):
    x, y, z, w = [float(v) for v in q]
    sinr_cosp = 2.0 * (w * x + y * z)
    cosr_cosp = 1.0 - 2.0 * (x * x + y * y)
    roll = math.atan2(sinr_cosp, cosr_cosp)
    sinp = 2.0 * (w * y - z * x)
    pitch = math.copysign(math.pi / 2, sinp) if abs(sinp) >= 1 else math.asin(sinp)
    siny_cosp = 2.0 * (w * z + x * y)
    cosy_cosp = 1.0 - 2.0 * (y * y + z * z)
    yaw = math.atan2(siny_cosp, cosy_cosp)
    return roll, pitch, yaw

def mapped_arm(dof):
    left = list(dof[15:19])
    right = list(dof[19:23])
    return round_list(left + [0.0, 0.0, 0.0] + right + [0.0, 0.0, 0.0])

data = joblib.load(archive)
motion_key = next(iter(data))
motion = data[motion_key]
fps = int(motion.get("fps", 30))
root = motion["root_trans_offset"]
rots = motion["root_rot"]
dofs = motion["dof"]
contacts = motion.get("contact_mask")
steps = []
prev = None

for i in range(len(dofs)):
    pos = [float(v) for v in root[i]]
    roll, pitch, yaw = quat_to_rpy(rots[i])
    if prev is None:
        vel = [0.0, 0.0, 0.0]
    else:
        vel = [(pos[j] - prev[j]) * fps for j in range(3)]
    prev = pos
    contact = contacts[i].tolist() if contacts is not None else []
    steps.append({
        "time": round(i / fps, 6),
        "robot_type": "g1",
        "robot": "g1",
        "task": task_name,
        "category": f"{task_prefix}_motion",
        "description": f"OpenHE Unitree G1 retargeted motion {motion_path}",
        "source_dataset": "openhe/g1-retargeted-motions",
        "source_motion": motion_key,
        "odometry": {
            "position": {"x": round(pos[0], 6), "y": round(pos[1], 6), "z": round(pos[2], 6)},
            "roll": round(roll, 6),
            "pitch": round(pitch, 6),
            "yaw": round(yaw, 6),
            "velocity": {"x": round(vel[0], 6), "y": round(vel[1], 6), "z": round(vel[2], 6)}
        },
        "imu": {
            "orientation": round_list(rots[i]),
            "rpy": [round(roll, 6), round(pitch, 6), round(yaw, 6)],
            "accelerometer": [],
            "gyroscope": []
        },
        "states": {
            "leg_state": round_list(dofs[i][:15]),
            "arm_state": mapped_arm(dofs[i]),
            "hand_state": []
        },
        "contact_mask": round_list(contact, 3)
    })

episode_dir = os.path.join(out_root, task_name, "episode_0")
os.makedirs(episode_dir, exist_ok=True)
out = os.path.join(episode_dir, "data.json")
with open(out, "w", encoding="utf-8") as f:
    json.dump({
        "dataset": "openhe/g1-retargeted-motions",
        "source_file": motion_path,
        "source_motion": motion_key,
        "fps": fps,
        "frames": len(steps),
        "steps": steps
    }, f, separators=(",", ":"))

print(json.dumps({
    "ok": True,
    "task": task_name,
    "out": out,
    "frames": len(steps),
    "durationSec": round(len(steps) / fps, 3)
}, indent=2))
PY
