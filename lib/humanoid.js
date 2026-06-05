'use strict';

const fs = require('fs');
const path = require('path');

const FRAME_RATE_HZ = 30;
const MEDIA_CACHE = {};

function exists(file) {
  try { return fs.existsSync(file); } catch (_) { return false; }
}

function bytesOf(data) {
  if (data instanceof Uint8Array) return data;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(data)) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data && data.buffer) return new Uint8Array(data.buffer, data.byteOffset || 0, data.byteLength || data.length || 0);
  if (typeof data === 'string') {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) out[i] = data.charCodeAt(i) & 0xff;
    return out;
  }
  return new Uint8Array(data || 0);
}

function readFileBytes(file) {
  try {
    return bytesOf(fs.readFileSync(file, { encoding: 'buffer' }));
  } catch (_) {
    return bytesOf(fs.readFileSync(file));
  }
}

function listDir(dir) {
  try {
    return fs.readdirSync(dir).filter(name => name !== '.' && name !== '..');
  } catch (_) {
    return [];
  }
}

function findEpisodeDirs(root) {
  const out = [];
  function walk(dir, depth) {
    if (depth > 5) return;
    if (exists(path.join(dir, 'data.json'))) {
      out.push(dir);
      return;
    }
    const names = listDir(dir).sort();
    for (let i = 0; i < names.length; i++) {
      const child = path.join(dir, names[i]);
      try {
        if (fs.statSync(child).isDirectory()) walk(child, depth + 1);
      } catch (_) {}
    }
  }
  walk(root, 0);
  return out.sort();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function normalizeSteps(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  if (Array.isArray(value.data)) return value.data;
  if (Array.isArray(value.steps)) return value.steps;
  if (Array.isArray(value.frames)) return value.frames;
  if (Array.isArray(value.episode)) return value.episode;
  return [];
}

function episodeName(dir, root) {
  const rel = path.relative(root, dir);
  return rel && rel !== '.' ? rel.replace(/\\/g, '/') : path.basename(dir);
}

function episodeInfo(root, dir) {
  const steps = normalizeSteps(readJson(path.join(dir, 'data.json')));
  const first = steps[0] || {};
  const last = steps.length > 0 ? steps[steps.length - 1] : {};
  const startSec = numeric(first.time, 0);
  const endSec = numeric(last.time, steps.length > 1 ? (steps.length - 1) / FRAME_RATE_HZ : 0);
  const durationMs = Math.max(steps.length > 1 ? (steps.length - 1) * 1000 / FRAME_RATE_HZ : 0, (endSec - startSec) * 1000);
  return {
    dir: dir,
    name: episodeName(dir, root),
    steps: steps,
    stepCount: steps.length,
    durationMs: Math.max(0, durationMs),
    robotType: first.robot_type || first.robotType || ''
  };
}

function datasetInfo(root) {
  const episodes = findEpisodeDirs(root).map(dir => episodeInfo(root, dir));
  let durationMs = 0;
  let steps = 0;
  for (let i = 0; i < episodes.length; i++) {
    durationMs += episodes[i].durationMs;
    steps += episodes[i].stepCount;
  }
  return {
    root: root,
    episodes: episodes,
    episodeCount: episodes.length,
    stepCount: steps,
    durationMs: durationMs
  };
}

function numeric(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function arrayOf(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(Number);
  if (value.length != null && typeof value !== 'string') {
    const out = [];
    for (let i = 0; i < value.length; i++) out.push(Number(value[i] || 0));
    return out;
  }
  return [];
}

function stateArray(step, name) {
  const states = step && step.states || {};
  return arrayOf(states[name] || step[name] || []);
}

function actionArray(step, name) {
  const actions = step && step.actions || {};
  return arrayOf(actions[name] || step[name] || []);
}

function vectorFrom(value) {
  const arr = arrayOf(value);
  if (arr.length >= 3) return { x: arr[0] || 0, y: arr[1] || 0, z: arr[2] || 0 };
  const obj = value && typeof value === 'object' ? value : {};
  return {
    x: numeric(obj.x != null ? obj.x : obj[0], 0),
    y: numeric(obj.y != null ? obj.y : obj[1], 0),
    z: numeric(obj.z != null ? obj.z : obj[2], 0)
  };
}

function firstPresent() {
  for (let i = 0; i < arguments.length; i++) {
    if (arguments[i] != null) return arguments[i];
  }
  return null;
}

function odometry(step) {
  const states = step && step.states || {};
  const src = firstPresent(step.odometry, step.odom, step.kinematics, step.pose, step.base_pose, states.odometry, {});
  const position = vectorFrom(firstPresent(src.position, src.pos, src.translation, src.xyz, [0, 0, 0]));
  const rpy = firstPresent(src.rpy, src.rotation, src.euler, step.rpy, [0, 0, 0]);
  const rot = arrayOf(rpy);
  const velocity = vectorFrom(firstPresent(src.velocity, src.vel, step.velocity, [0, 0, 0]));
  return {
    position: position,
    rotation: {
      roll: numeric(src.roll != null ? src.roll : rot[0], 0),
      pitch: numeric(src.pitch != null ? src.pitch : rot[1], 0),
      yaw: numeric(src.yaw != null ? src.yaw : rot[2], 0)
    },
    velocity: velocity,
    speed: Math.sqrt(velocity.x * velocity.x + velocity.y * velocity.y + velocity.z * velocity.z)
  };
}

function imu(step) {
  const src = firstPresent(step.imu, step.IMU, step.states && step.states.imu, {});
  return {
    orientation: arrayOf(firstPresent(src.orientation, src.quaternion, src.quat, [])),
    accelerometer: arrayOf(firstPresent(src.accelerometer, src.accel, src.linear_acceleration, [])),
    gyroscope: arrayOf(firstPresent(src.gyroscope, src.gyro, src.angular_velocity, [])),
    rpy: arrayOf(firstPresent(src.rpy, src.euler, []))
  };
}

function mediaPath(episodeDir, step, names) {
  for (let i = 0; i < names.length; i++) {
    const value = step[names[i]];
    if (typeof value === 'string' && value) return path.isAbsolute(value) ? value : path.join(episodeDir, value);
  }
  return '';
}

function numberedFile(dir, index, exts) {
  if (!exists(dir)) return '';
  const cacheKey = dir + '|' + exts.join(',');
  if (!MEDIA_CACHE[cacheKey]) {
    MEDIA_CACHE[cacheKey] = listDir(dir).filter(name => {
      for (let i = 0; i < exts.length; i++) {
        if (name.toLowerCase().slice(-exts[i].length) === exts[i]) return true;
      }
      return false;
    }).sort();
  }
  const names = MEDIA_CACHE[cacheKey];
  return names[index] ? path.join(dir, names[index]) : '';
}

function flattenPressure(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    const out = [];
    for (let i = 0; i < value.length; i++) {
      const item = value[i];
      if (item && typeof item === 'object' && item.usable_readings) {
        const readings = arrayOf(item.usable_readings);
        for (let j = 0; j < readings.length; j++) out.push(readings[j]);
      } else if (typeof item === 'number') {
        out.push(item);
      }
    }
    return out;
  }
  return arrayOf(value);
}

function stepMedia(episodeDir, step, index) {
  const lidar = mediaPath(episodeDir, step, ['lidar', 'lidar_path', 'lidarFile', 'lidar_file', 'pcd']) ||
    numberedFile(path.join(episodeDir, 'lidar'), index, ['.pcd']);
  const rgb = mediaPath(episodeDir, step, ['image', 'image_path', 'rgb_path', 'color_path', 'imageFile']) ||
    numberedFile(path.join(episodeDir, 'color'), index, ['.png', '.jpg', '.jpeg']);
  const depth = mediaPath(episodeDir, step, ['depth', 'depth_path', 'depthFile']) ||
    numberedFile(path.join(episodeDir, 'depth'), index, ['.png', '.npy', '.bin', '.lzma']);
  return {
    lidar: lidar,
    rgb: rgb,
    depth: depth
  };
}

function relativeMedia(root, file) {
  if (!file) return '';
  return path.relative(root, file).replace(/\\/g, '/');
}

function framePayload(root, episode, step, stepIndex, frameId, time, pointCount) {
  const odom = odometry(step);
  const media = stepMedia(episode.dir, step, stepIndex);
  const robotType = step.robot_type || step.robotType || episode.robotType || 'G1';
  const joints = {
    arm: stateArray(step, 'arm_state'),
    leg: stateArray(step, 'leg_state'),
    hand: stateArray(step, 'hand_state'),
    armAction: actionArray(step, 'sol_q'),
    leftHandAction: actionArray(step, 'left_angles'),
    rightHandAction: actionArray(step, 'right_angles')
  };
  const pressure = flattenPressure(firstPresent(step.hand_pressure, step.pressure, step.states && step.states.hand_pressure, step.states && step.states.hand_pressure_state, []));
  return {
    frame: {
      frame_id: frameId,
      source_episode: episode.name,
      source_step: stepIndex,
      position: odom.position,
      rotation: odom.rotation,
      speed: odom.speed,
      point_count: pointCount
    },
    robot: {
      type: robotType,
      frame_rate_hz: FRAME_RATE_HZ
    },
    joints: joints,
    imu: imu(step),
    odometry: odom,
    hands: {
      pressure: pressure
    },
    sensors: {
      lidar_points: pointCount,
      rgb: !!media.rgb,
      depth: !!media.depth,
      imu: true,
      joints: joints.arm.length + joints.leg.length + joints.hand.length
    },
    media: {
      lidar: relativeMedia(root, media.lidar),
      rgb: relativeMedia(root, media.rgb),
      depth: relativeMedia(root, media.depth)
    },
    signals: {
      speed_mps: odom.speed,
      joint_count: joints.arm.length + joints.leg.length + joints.hand.length,
      hand_pressure_count: pressure.length,
      point_count: pointCount,
      roll_rad: odom.rotation.roll,
      pitch_rad: odom.rotation.pitch,
      yaw_rad: odom.rotation.yaw
    },
    events: []
  };
}

function lineEnd(bytes, start) {
  for (let i = start; i < bytes.length; i++) {
    if (bytes[i] === 10) return i + 1;
  }
  return bytes.length;
}

function readHeader(bytes) {
  let pos = 0;
  const lines = [];
  while (pos < bytes.length) {
    const end = lineEnd(bytes, pos);
    let text = '';
    for (let i = pos; i < end; i++) {
      const ch = bytes[i];
      if (ch !== 10 && ch !== 13) text += String.fromCharCode(ch);
    }
    lines.push(text);
    pos = end;
    if (/^DATA\s+/i.test(text)) break;
  }
  const meta = {};
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].trim().split(/\s+/);
    if (!parts[0]) continue;
    meta[parts[0].toUpperCase()] = parts.slice(1);
  }
  meta.headerBytes = pos;
  return meta;
}

function bytesText(bytes, start) {
  const offset = start || 0;
  if (typeof Buffer !== 'undefined' && Buffer.from) {
    try {
      return Buffer.from(bytes.buffer, bytes.byteOffset + offset, bytes.byteLength - offset).toString('utf8');
    } catch (_) {
      try { return Buffer.from(bytes).toString('utf8').slice(offset); } catch (_) {}
    }
  }
  let text = '';
  for (let i = offset; i < bytes.length; i++) text += String.fromCharCode(bytes[i]);
  return text;
}

function fieldIndex(fields, name) {
  for (let i = 0; i < fields.length; i++) {
    if (String(fields[i]).toLowerCase() === name) return i;
  }
  return -1;
}

function readScalar(view, offset, size, type) {
  const t = String(type || 'F').toUpperCase();
  if (t === 'F' && size === 8) return view.getFloat64(offset, true);
  if (t === 'F') return view.getFloat32(offset, true);
  if (t === 'U' && size === 1) return view.getUint8(offset);
  if (t === 'U' && size === 2) return view.getUint16(offset, true);
  if (t === 'U' && size === 4) return view.getUint32(offset, true);
  if (t === 'I' && size === 1) return view.getInt8(offset);
  if (t === 'I' && size === 2) return view.getInt16(offset, true);
  if (t === 'I' && size === 4) return view.getInt32(offset, true);
  return 0;
}

function pcdToPointBytes(file, stride) {
  if (!file || !exists(file)) return Buffer.alloc(0);
  const raw = readFileBytes(file);
  const header = readHeader(raw);
  const fields = header.FIELDS || [];
  const sizes = (header.SIZE || []).map(n => parseInt(n, 10) || 4);
  const types = header.TYPE || [];
  const counts = (header.COUNT || []).map(n => parseInt(n, 10) || 1);
  while (counts.length < fields.length) counts.push(1);
  const points = parseInt((header.POINTS || [header.WIDTH && header.WIDTH[0] || '0'])[0], 10) || 0;
  const dataMode = String((header.DATA || ['ascii'])[0]).toLowerCase();
  const ix = fieldIndex(fields, 'x');
  const iy = fieldIndex(fields, 'y');
  const iz = fieldIndex(fields, 'z');
  const ii = fieldIndex(fields, 'intensity');
  if (ix < 0 || iy < 0 || iz < 0) return Buffer.alloc(0);

  if (dataMode === 'ascii') {
    const rows = bytesText(raw, header.headerBytes).split(/\r?\n/);
    const kept = [];
    const step = Math.max(1, stride || 1);
    for (let i = 0; i < rows.length; i += step) {
      const row = rows[i].trim();
      if (!row) continue;
      const nums = row.split(/\s+/);
      kept.push([
        Number(nums[ix] || 0),
        Number(nums[iy] || 0),
        Number(nums[iz] || 0),
        ii >= 0 ? Number(nums[ii] || 0) : 1
      ]);
    }
    return pointsToBuffer(kept);
  }

  const offsets = [];
  let pointBytes = 0;
  for (let i = 0; i < fields.length; i++) {
    offsets[i] = pointBytes;
    pointBytes += sizes[i] * counts[i];
  }
  const view = new DataView(raw.buffer, raw.byteOffset + header.headerBytes, raw.byteLength - header.headerBytes);
  const keptCount = Math.ceil(points / Math.max(1, stride || 1));
  const out = new Uint8Array(keptCount * 16);
  const outView = new DataView(out.buffer);
  let outIndex = 0;
  for (let i = 0; i < points; i += Math.max(1, stride || 1)) {
    const base = i * pointBytes;
    outView.setFloat32(outIndex, readScalar(view, base + offsets[ix], sizes[ix], types[ix]), true);
    outView.setFloat32(outIndex + 4, readScalar(view, base + offsets[iy], sizes[iy], types[iy]), true);
    outView.setFloat32(outIndex + 8, readScalar(view, base + offsets[iz], sizes[iz], types[iz]), true);
    outView.setFloat32(outIndex + 12, ii >= 0 ? readScalar(view, base + offsets[ii], sizes[ii], types[ii]) : 1, true);
    outIndex += 16;
  }
  return Buffer.from(out.subarray(0, outIndex));
}

function pointsToBuffer(points) {
  const out = new Uint8Array(points.length * 16);
  const view = new DataView(out.buffer);
  for (let i = 0; i < points.length; i++) {
    const offset = i * 16;
    const p = points[i] || [];
    view.setFloat32(offset, Number(p[0] || 0), true);
    view.setFloat32(offset + 4, Number(p[1] || 0), true);
    view.setFloat32(offset + 8, Number(p[2] || 0), true);
    view.setFloat32(offset + 12, Number(p[3] == null ? 1 : p[3]), true);
  }
  return Buffer.from(out);
}

module.exports = {
  FRAME_RATE_HZ,
  datasetInfo,
  episodeInfo,
  findEpisodeDirs,
  framePayload,
  pcdToPointBytes,
  stepMedia
};
