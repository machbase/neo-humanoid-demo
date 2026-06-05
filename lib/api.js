'use strict';

const { Client } = require('machcli');
const zip = require('archive/zip');
const process = require('process');
const path = require('path');

function rootDir() {
  const script = String(process.argv[1] || '');
  const cgi = script.indexOf('/cgi-bin/');
  if (cgi >= 0) return script.slice(0, cgi);
  const app = script.indexOf('/app/');
  if (app >= 0) return script.slice(0, app);
  const scripts = script.indexOf('/scripts/');
  if (scripts >= 0) return script.slice(0, scripts);
  if (script.indexOf('/') < 0) return '/work';
  return path.dirname(script);
}

const ROOT = rootDir();
const { dbConfig } = require(path.join(ROOT, 'lib', 'env.js'));
const { TABLES } = require(path.join(ROOT, 'lib', 'schema.js'));

const DEFAULT_DATASET = 'humanoid-everyday';
const DEFAULT_SEQUENCE = 'humanoid-everyday-10m';
const FALLBACK_START = Date.parse('2026-01-01T00:00:00Z');
const FALLBACK_DURATION_MS = 10 * 60 * 1000;
const EPISODE_INDEX_LIMIT = 100000;

function get(row, name) {
  if (!row) return undefined;
  return row[name] != null ? row[name] : row[name.toUpperCase()];
}

function toIso(value) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'number') return new Date(value).toISOString();
  if (value == null) return null;
  return String(value);
}

function toEpochMs(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (value == null) return NaN;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function bytesOf(value) {
  if (value == null) return new Uint8Array(0);
  if (value instanceof Uint8Array) return value;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
  }
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  if (Array.isArray(value)) return new Uint8Array(value);
  if (typeof value === 'string' && value.indexOf('0x') === 0) {
    const out = new Uint8Array((value.length - 2) / 2);
    for (let i = 2, j = 0; i < value.length; i += 2, j++) out[j] = parseInt(value.slice(i, i + 2), 16);
    return out;
  }
  if (typeof value === 'string') {
    const out = new Uint8Array(value.length);
    for (let i = 0; i < value.length; i++) out[i] = value.charCodeAt(i) & 0xff;
    return out;
  }
  if (value.buffer) return new Uint8Array(value.buffer);
  return new Uint8Array(0);
}

function base64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

function stridedBuffer(value, stride) {
  const raw = value instanceof Uint8Array || Array.isArray(value) ? value : bytesOf(value);
  if (!stride || stride <= 1) return Buffer.from(raw);
  const pointBytes = 16;
  const pointCount = Math.floor(raw.length / pointBytes);
  const kept = Math.ceil(pointCount / stride);
  const out = Buffer.alloc(kept * pointBytes);
  let offset = 0;
  for (let i = 0; i < pointCount; i += stride) {
    const start = i * pointBytes;
    for (let j = 0; j < pointBytes; j++) out[offset + j] = raw[start + j];
    offset += pointBytes;
  }
  return offset === out.length ? out : out.subarray(0, offset);
}

function withDb(args, fn) {
  const db = new Client(dbConfig(args || {}));
  let conn;
  try {
    conn = db.connect();
    return fn(conn);
  } finally {
    try { conn && conn.close(); } catch (_) {}
    try { db && db.close(); } catch (_) {}
  }
}

function queryAll(conn, sql) {
  const params = [];
  for (let i = 2; i < arguments.length; i++) params.push(arguments[i]);
  const rows = params.length > 0 ? conn.query(sql, ...params) : conn.query(sql);
  const out = [];
  try {
    for (const row of rows) out.push(row);
  } finally {
    rows && rows.close && rows.close();
  }
  return out;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function safeFilePart(value, fallback) {
  const text = String(value || fallback || 'download').replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^_+|_+$/g, '');
  return text || fallback || 'download';
}

function sqlNumber(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function parseJsonValue(value) {
  if (value == null) return {};
  if (typeof value === 'object' && !(value instanceof Uint8Array) && !(value instanceof ArrayBuffer)) return value;
  try {
    return JSON.parse(String(value));
  } catch (_) {
    return {};
  }
}

function syntheticJoints(frameId) {
  const t = frameId / 30;
  return {
    arm: [
      Math.sin(t) * 0.45, -0.22, Math.cos(t * 0.7) * 0.25, -0.65 + Math.sin(t * 1.3) * 0.2, 0, 0, 0,
      -Math.sin(t) * 0.45, 0.22, -Math.cos(t * 0.7) * 0.25, -0.65 - Math.sin(t * 1.3) * 0.2, 0, 0, 0
    ],
    leg: [
      0, 0.08, Math.sin(t * 1.8) * 0.32, -0.55 - Math.cos(t * 1.8) * 0.18, 0.22, 0,
      0, -0.08, -Math.sin(t * 1.8) * 0.32, -0.55 + Math.cos(t * 1.8) * 0.18, 0.22, 0,
      Math.sin(t * 0.6) * 0.12, 0, 0
    ],
    hand: []
  };
}

function fallbackManifest() {
  return {
    ok: true,
    source: 'synthetic-fallback',
    dataset: DEFAULT_DATASET,
    sequence: DEFAULT_SEQUENCE,
    minTime: new Date(FALLBACK_START).toISOString(),
    maxTime: new Date(FALLBACK_START + FALLBACK_DURATION_MS).toISOString(),
    durationMs: FALLBACK_DURATION_MS,
    frameCount: 18000,
    lods: [0, 1, 2],
    sensors: ['lidar', 'joints', 'imu', 'odometry', 'hand_pressure', 'rgb', 'depth']
  };
}

function fallbackFrame(ms) {
  const t = Number.isFinite(ms) ? ms : FALLBACK_START;
  const frameId = Math.max(0, Math.round((t - FALLBACK_START) / (1000 / 30)));
  const phase = frameId / 30;
  const x = Math.sin(phase * 0.18) * 1.2;
  const y = phase * 0.045;
  const yaw = Math.sin(phase * 0.12) * 0.28;
  const joints = syntheticJoints(frameId);
  return {
    ok: true,
    source: 'synthetic-fallback',
    frame: {
      time: new Date(t).toISOString(),
      frameId: frameId,
      position: { x: x, y: y, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: yaw },
      speed: 1.35 + Math.sin(phase * 0.5) * 0.25,
      pointCount: 2200,
      sourceEpisode: 'synthetic',
      sourceStep: frameId
    },
    robot: { type: 'G1', frameRateHz: 30 },
    joints: joints,
    imu: {
      orientation: [],
      accelerometer: [0, 0, 9.81],
      gyroscope: [0, 0, Math.cos(phase * 0.12) * 0.03],
      rpy: [0, 0, yaw]
    },
    odometry: {
      position: { x: x, y: y, z: 0 },
      rotation: { roll: 0, pitch: 0, yaw: yaw },
      velocity: { x: 0, y: 1.35, z: 0 },
      speed: 1.35
    },
    hands: { pressure: [] },
    sensors: { lidar_points: 2200, rgb: false, depth: false, imu: true, joints: 29 },
    media: {},
    signals: {
      speed_mps: 1.35,
      joint_count: 29,
      hand_pressure_count: 0,
      point_count: 2200,
      roll_rad: 0,
      pitch_rad: 0,
      yaw_rad: yaw
    },
    events: []
  };
}

function fallbackFrameIdMs(frameId) {
  return FALLBACK_START + Math.max(0, sqlNumber(frameId, 0)) * (1000 / 30);
}

function pointsToBuffer(points) {
  const out = new Uint8Array(points.length * 16);
  const view = new DataView(out.buffer);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const offset = i * 16;
    view.setFloat32(offset, Number(p[0] || 0), true);
    view.setFloat32(offset + 4, Number(p[1] || 0), true);
    view.setFloat32(offset + 8, Number(p[2] || 0), true);
    view.setFloat32(offset + 12, Number(p[3] == null ? 1 : p[3]), true);
  }
  return Buffer.from(out);
}

function fallbackPointBytes(ms, lod) {
  const fr = fallbackFrame(ms).frame;
  const stride = lod === 0 ? 1 : lod === 1 ? 3 : 8;
  const count = Math.floor(2600 / stride);
  const points = [];
  for (let i = 0; i < count; i++) {
    const a = i * 2.399963 + fr.frameId * 0.018;
    const r = 0.8 + (i % 120) * 0.045;
    points.push([
      Math.cos(a) * r,
      Math.sin(a) * r + 1.8,
      Math.sin(i * 0.09 + fr.frameId * 0.03) * 0.7 + 1.0,
      0.4 + ((i * 13) % 100) / 140
    ]);
  }
  const bytes = pointsToBuffer(points);
  return {
    ok: true,
    source: 'synthetic-fallback',
    encoding: 'f32xyzi-le',
    frame: fr,
    lod: lod,
    pointCount: Math.floor(bytes.length / 16),
    byteCount: bytes.length,
    bytes: bytes
  };
}

function frameFromTimeline(row) {
  const payload = parseJsonValue(get(row, 'value'));
  const data = payload.frame || {};
  const position = data.position || {};
  const rotation = data.rotation || {};
  const frameId = Number(data.frame_id != null ? data.frame_id : get(row, 'frame_id') || 0);
  return {
    time: toIso(get(row, 'time')),
    frameId: frameId,
    position: {
      x: Number(position.x || 0),
      y: Number(position.y || 0),
      z: Number(position.z || 0)
    },
    rotation: {
      roll: Number(rotation.roll || 0),
      pitch: Number(rotation.pitch || 0),
      yaw: Number(rotation.yaw || 0)
    },
    speed: Number(data.speed || 0),
    pointCount: Number(data.point_count || 0),
    sourceEpisode: data.source_episode || data.sourceEpisode || '',
    sourceStep: Number(data.source_step != null ? data.source_step : data.sourceStep || 0)
  };
}

function normalizePayload(row) {
  const payload = parseJsonValue(get(row, 'value'));
  const fr = frameFromTimeline(row);
  return {
    ok: true,
    source: 'machbase',
    frame: fr,
    robot: payload.robot || {},
    joints: payload.joints || {},
    imu: payload.imu || {},
    odometry: payload.odometry || {},
    hands: payload.hands || {},
    sensors: payload.sensors || {},
    media: payload.media || {},
    signals: payload.signals || {},
    events: payload.events || []
  };
}

function episodeIndexFromRows(rows) {
  const map = {};
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const fr = frameFromTimeline(rows[i]);
    const payload = parseJsonValue(get(rows[i], 'value'));
    const payloadFrame = payload.frame || {};
    const name = fr.sourceEpisode || 'episode';
    const task = payloadFrame.task || String(name).split('/')[0] || '';
    let item = map[name];
    if (!item) {
      item = {
        name: name,
        task: task,
        category: payloadFrame.category || '',
        description: payloadFrame.taskDescription || '',
        frameStart: fr.frameId,
        frameEnd: fr.frameId,
        frameCount: 0,
        stepStart: fr.sourceStep,
        stepEnd: fr.sourceStep,
        minTime: fr.time,
        maxTime: fr.time,
        pointFrames: 0,
        robotType: ''
      };
      map[name] = item;
      out.push(item);
    }
    item.frameStart = Math.min(item.frameStart, fr.frameId);
    item.frameEnd = Math.max(item.frameEnd, fr.frameId);
    item.stepStart = Math.min(item.stepStart, fr.sourceStep);
    item.stepEnd = Math.max(item.stepEnd, fr.sourceStep);
    item.frameCount++;
    item.minTime = item.minTime || fr.time;
    item.maxTime = fr.time || item.maxTime;
    if (fr.pointCount > 0) item.pointFrames++;
    if (!item.robotType && payload.robot && payload.robot.type) item.robotType = payload.robot.type;
  }
  out.sort((a, b) => a.frameStart - b.frameStart);
  for (let i = 0; i < out.length; i++) {
    const start = toEpochMs(out[i].minTime);
    const end = toEpochMs(out[i].maxTime);
    out[i].index = i;
    out[i].durationMs = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0;
  }
  return out;
}

function episodeIndexFromIndexRows(rows) {
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const minTime = toIso(get(row, 'min_time'));
    const maxTime = toIso(get(row, 'max_time'));
    const start = toEpochMs(minTime);
    const end = toEpochMs(maxTime);
    const duration = Number(get(row, 'duration_ms') || 0);
    out.push({
      name: get(row, 'source_episode') || '',
      task: get(row, 'task') || '',
      category: get(row, 'category') || '',
      description: get(row, 'description') || '',
      frameStart: Number(get(row, 'frame_start') || 0),
      frameEnd: Number(get(row, 'frame_end') || 0),
      frameCount: Number(get(row, 'frame_count') || 0),
      stepStart: Number(get(row, 'step_start') || 0),
      stepEnd: Number(get(row, 'step_end') || 0),
      minTime: minTime,
      maxTime: maxTime,
      pointFrames: Number(get(row, 'point_frames') || 0),
      robotType: get(row, 'robot_type') || '',
      index: Number(get(row, 'episode_index') != null ? get(row, 'episode_index') : i),
      durationMs: duration > 0 ? duration : Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, end - start) : 0
    });
  }
  return out;
}

function indexedEpisodes(conn, dataset, sequence, limit) {
  try {
    const rows = queryAll(
      conn,
      `SELECT episode_index, source_episode, task, category, description, robot_type, frame_start, frame_end, frame_count, step_start, step_end, min_time, max_time, duration_ms, point_frames FROM ${TABLES.episodeIndex} WHERE dataset = ? AND sequence = ? ORDER BY episode_index LIMIT ${limit}`,
      dataset,
      sequence
    );
    return episodeIndexFromIndexRows(rows || []);
  } catch (_) {
    return null;
  }
}

function scannedEpisodes(conn, dataset, sequence, limit) {
  const tagName = `${dataset}.${sequence}.timeline`;
  const rows = queryAll(
    conn,
    `SELECT time, value, frame_id FROM ${TABLES.timeline} WHERE name = ${sqlString(tagName)} ORDER BY frame_id LIMIT ${limit}`
  );
  return episodeIndexFromRows(rows || []);
}

function episodeByIndex(conn, dataset, sequence, index) {
  let items = indexedEpisodes(conn, dataset, sequence, EPISODE_INDEX_LIMIT);
  if (!items || !items.length) items = scannedEpisodes(conn, dataset, sequence, EPISODE_INDEX_LIMIT);
  const selected = items[sqlNumber(index, 0)];
  return selected || null;
}

function timelineSql(dataset, sequence, frameStart, frameEnd) {
  return `SELECT time, frame_id, value FROM ${TABLES.timeline} WHERE name = ${sqlString(`${dataset}.${sequence}.timeline`)} AND frame_id BETWEEN ${sqlNumber(frameStart, 0)} AND ${sqlNumber(frameEnd, 0)} ORDER BY frame_id`;
}

function machbaseQueryUrl(query, sql) {
  const base = query.machbaseBase || query.machbaseHttpBase || query['machbase-base'] || query['machbase-http-base'] || 'http://127.0.0.1:5654';
  return `${String(base).replace(/\/$/, '')}/db/query?q=${encodeURIComponent(sql)}&format=ndjson&compress=gzip&timeformat=ns`;
}

function timelineStats(conn, dataset, sequence) {
  const rows = queryAll(
    conn,
    `SELECT MIN(time) min_time, MAX(time) max_time, COUNT(*) frame_count FROM ${TABLES.timeline} WHERE dataset = ? AND sequence = ?`,
    dataset,
    sequence
  );
  if (!rows || rows.length === 0) return null;
  const row = rows[0];
  const count = Number(get(row, 'frame_count') || 0);
  if (count <= 0) return null;
  return {
    minTime: toIso(get(row, 'min_time')),
    maxTime: toIso(get(row, 'max_time')),
    minMs: toEpochMs(get(row, 'min_time')),
    maxMs: toEpochMs(get(row, 'max_time')),
    frameCount: count
  };
}

function targetFrameId(conn, dataset, sequence, ms) {
  const stats = timelineStats(conn, dataset, sequence);
  if (!stats) return 0;
  if (!Number.isFinite(ms)) return 0;
  if (!Number.isFinite(stats.minMs) || !Number.isFinite(stats.maxMs) || stats.maxMs <= stats.minMs) return 0;
  const ratio = Math.max(0, Math.min(1, (ms - stats.minMs) / (stats.maxMs - stats.minMs)));
  return Math.max(0, Math.min(stats.frameCount - 1, Math.round(ratio * (stats.frameCount - 1))));
}

function episodes(args, query) {
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  const limit = Math.max(1, Math.min(EPISODE_INDEX_LIMIT, parseInt(query.limit || String(EPISODE_INDEX_LIMIT), 10) || EPISODE_INDEX_LIMIT));
  try {
    return withDb(args, (conn) => {
      let items = indexedEpisodes(conn, dataset, sequence, limit);
      if (!items || !items.length) items = scannedEpisodes(conn, dataset, sequence, limit);
      return {
        ok: true,
        source: 'machbase',
        dataset: dataset,
        sequence: sequence,
        episodeCount: items.length,
        frameCount: items.reduce((sum, item) => sum + item.frameCount, 0),
        episodes: items
      };
    });
  } catch (err) {
    return {
      ok: false,
      source: 'synthetic-fallback',
      warning: err.message,
      dataset: dataset,
      sequence: sequence,
      episodeCount: 0,
      frameCount: 0,
      episodes: []
    };
  }
}

function manifest(args) {
  const targetDataset = args.dataset || DEFAULT_DATASET;
  const targetSequence = args.sequence || DEFAULT_SEQUENCE;
  try {
    return withDb(args, (conn) => {
      const rows = queryAll(conn, `SELECT dataset, sequence, MIN(time) min_time, MAX(time) max_time, COUNT(*) frame_count FROM ${TABLES.timeline} GROUP BY dataset, sequence ORDER BY dataset, sequence LIMIT 20`);
      if (!rows || rows.length === 0) return fallbackManifest();
      let first = null;
      for (let i = 0; i < rows.length; i++) {
        if (get(rows[i], 'dataset') === targetDataset && get(rows[i], 'sequence') === targetSequence) {
          first = rows[i];
          break;
        }
      }
      if (!first) {
        const fb = fallbackManifest();
        fb.datasets = rows.map(row => ({
          dataset: get(row, 'dataset'),
          sequence: get(row, 'sequence'),
          minTime: toIso(get(row, 'min_time')),
          maxTime: toIso(get(row, 'max_time')),
          frameCount: Number(get(row, 'frame_count') || 0)
        }));
        fb.warning = `dataset not loaded: ${targetDataset}/${targetSequence}`;
        return fb;
      }
      const minMs = toEpochMs(get(first, 'min_time'));
      const maxMs = toEpochMs(get(first, 'max_time'));
      return {
        ok: true,
        source: 'machbase',
        datasets: rows.map(row => ({
          dataset: get(row, 'dataset'),
          sequence: get(row, 'sequence'),
          minTime: toIso(get(row, 'min_time')),
          maxTime: toIso(get(row, 'max_time')),
          frameCount: Number(get(row, 'frame_count') || 0)
        })),
        dataset: get(first, 'dataset'),
        sequence: get(first, 'sequence'),
        minTime: toIso(get(first, 'min_time')),
        maxTime: toIso(get(first, 'max_time')),
        durationMs: Number.isFinite(minMs) && Number.isFinite(maxMs) ? Math.max(0, maxMs - minMs) : 0,
        frameCount: Number(get(first, 'frame_count') || 0),
        lods: [0, 1, 2],
        sensors: ['lidar', 'joints', 'imu', 'odometry', 'hand_pressure', 'rgb', 'depth']
      };
    });
  } catch (err) {
    const fb = fallbackManifest();
    fb.warning = err.message;
    return fb;
  }
}

function frame(args, query) {
  const ms = parseInt(query.time || '', 10);
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  try {
    return withDb(args, (conn) => {
      const requestedFrameId = query.frameId != null ? query.frameId : query.frameid;
      const frameId = requestedFrameId != null ? parseInt(requestedFrameId, 10) : targetFrameId(conn, dataset, sequence, ms);
      const tagName = `${dataset}.${sequence}.timeline`;
      const rows = queryAll(
        conn,
        `SELECT time, value, frame_id FROM ${TABLES.timeline} WHERE name = ${sqlString(tagName)} AND frame_id <= ${sqlNumber(frameId, 0)} ORDER BY frame_id DESC LIMIT 1`
      );
      if (!rows || rows.length === 0) {
        return fallbackFrame(requestedFrameId != null ? fallbackFrameIdMs(frameId) : ms);
      }
      return normalizePayload(rows[0]);
    });
  } catch (err) {
    const requestedFrameId = query.frameId != null ? query.frameId : query.frameid;
    const fb = fallbackFrame(requestedFrameId != null ? fallbackFrameIdMs(requestedFrameId) : ms);
    fb.warning = err.message;
    return fb;
  }
}

function requestedFrameIds(query) {
  const raw = query.frameIds || query.frameids || '';
  const out = [];
  const seen = {};
  if (raw) {
    const parts = String(raw).split(',');
    for (let i = 0; i < parts.length; i++) {
      const id = sqlNumber(parts[i], -1);
      if (id >= 0 && !seen[id]) {
        seen[id] = true;
        out.push(id);
      }
      if (out.length >= 300) break;
    }
  }
  return out;
}

function frames(args, query) {
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  const explicitIds = requestedFrameIds(query);
  const limit = Math.max(1, Math.min(300, sqlNumber(query.limit || query.count, 120)));
  const startFrameId = Math.max(0, sqlNumber(query.startFrameId != null ? query.startFrameId : query.frameId, 0));
  const endFrameId = query.endFrameId != null
    ? Math.max(startFrameId, sqlNumber(query.endFrameId, startFrameId + limit - 1))
    : startFrameId + limit - 1;
  try {
    return withDb(args, (conn) => {
      const tagName = `${dataset}.${sequence}.timeline`;
      const where = explicitIds.length
        ? `name = ${sqlString(tagName)} AND frame_id IN (${explicitIds.map(id => sqlNumber(id, 0)).join(',')})`
        : `name = ${sqlString(tagName)} AND frame_id BETWEEN ${sqlNumber(startFrameId, 0)} AND ${sqlNumber(endFrameId, startFrameId)}`;
      const rows = queryAll(
        conn,
        `SELECT time, value, frame_id FROM ${TABLES.timeline} WHERE ${where} ORDER BY frame_id LIMIT ${limit}`
      );
      return {
        ok: true,
        source: 'machbase',
        dataset: dataset,
        sequence: sequence,
        frameCount: rows.length,
        frames: rows.map(normalizePayload)
      };
    });
  } catch (err) {
    const fallbackIds = explicitIds.length ? explicitIds : [startFrameId];
    return {
      ok: false,
      source: 'synthetic-fallback',
      warning: err.message,
      dataset: dataset,
      sequence: sequence,
      frameCount: fallbackIds.length,
      frames: fallbackIds.map(id => fallbackFrame(fallbackFrameIdMs(id)))
    };
  }
}

function poses(args, query) {
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  const limit = Math.max(1, Math.min(50000, parseInt(query.limit || '20000', 10) || 20000));
  try {
    return withDb(args, (conn) => {
      const tagName = `${dataset}.${sequence}.timeline`;
      const rows = queryAll(
        conn,
        `SELECT time, value, frame_id FROM ${TABLES.timeline} WHERE name = ${sqlString(tagName)} ORDER BY frame_id LIMIT ${limit}`
      );
      if (!rows || rows.length === 0) return { ok: true, source: 'machbase', frames: [] };
      return {
        ok: true,
        source: 'machbase',
        frames: rows.map(frameFromTimeline)
      };
    });
  } catch (err) {
    return {
      ok: false,
      source: 'synthetic-fallback',
      warning: err.message,
      frames: []
    };
  }
}

function points(args, query) {
  const payload = pointsBinary(args, query);
  if (!payload || !payload.ok) return payload;
  const bytes = payload.bytes || Buffer.alloc(0);
  const out = {
    ok: true,
    source: payload.source,
    encoding: 'base64-f32xyzi-chunks',
    frame: payload.frame,
    lod: payload.lod,
    chunks: [{
      index: 0,
      pointCount: Math.floor(bytes.length / 16),
      byteCount: bytes.length,
      data: base64(bytes)
    }]
  };
  if (payload.warning) out.warning = payload.warning;
  return out;
}

function pointsBinary(args, query) {
  const ms = parseInt(query.time || '', 10);
  const lod = parseInt(query.lod || '1', 10);
  const requestedFrameId = query.frameId != null ? query.frameId : query.frameid;
  const fr = frame(args, query).frame;
  if (!fr || fr.frameId == null) return fallbackPointBytes(ms, lod);
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  try {
    return withDb(args, (conn) => {
      const tagName = `${dataset}.${sequence}.lidar.raw`;
      const episode = fr.sourceEpisode || '';
      const step = fr.sourceStep != null ? fr.sourceStep : 0;
      const pointWhere = episode
        ? `name = ${sqlString(tagName)} AND source_episode = ${sqlString(episode)} AND source_step <= ${sqlNumber(step, 0)}`
        : `name = ${sqlString(tagName)} AND frame_id <= ${sqlNumber(fr.frameId, 0)}`;
      const rows = queryAll(
        conn,
        `SELECT value, point_count, byte_count, source_episode, source_step, frame_id FROM ${TABLES.points} WHERE ${pointWhere} ORDER BY frame_id DESC LIMIT 1`
      );
      if (!rows || rows.length === 0) {
        return {
          ok: true,
          source: 'machbase',
          encoding: 'f32xyzi-le',
          frame: fr,
          lod: lod,
          pointCount: 0,
          byteCount: 0,
          bytes: Buffer.alloc(0)
        };
      }
      const stride = lod === 0 ? 1 : lod === 1 ? 4 : 12;
      const bytes = stridedBuffer(get(rows[0], 'value'), stride);
      fr.pointCount = Number(get(rows[0], 'point_count') || Math.floor(bytes.length / 16));
      fr.pointFrameId = Number(get(rows[0], 'frame_id') || fr.frameId);
      fr.sourceEpisode = get(rows[0], 'source_episode') || fr.sourceEpisode || '';
      fr.sourceStep = Number(get(rows[0], 'source_step') || fr.sourceStep || 0);
      return {
        ok: true,
        source: 'machbase',
        encoding: 'f32xyzi-le',
        frame: fr,
        lod: lod,
        pointCount: Math.floor(bytes.length / 16),
        byteCount: bytes.length,
        bytes: bytes
      };
    });
  } catch (err) {
    const fb = fallbackPointBytes(Number.isFinite(ms) ? ms : fallbackFrameIdMs(fr.frameId), lod);
    fb.warning = err.message;
    return fb;
  }
}

function timelineQueryLink(args, query) {
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  try {
    return withDb(args, (conn) => {
      const ep = episodeByIndex(conn, dataset, sequence, query.episode);
      if (!ep) return { ok: false, source: 'machbase', reason: 'episode not found' };
      const sql = timelineSql(dataset, sequence, ep.frameStart, ep.frameEnd);
      return {
        ok: true,
        source: 'machbase',
        dataset: dataset,
        sequence: sequence,
        episode: ep,
        sql: sql,
        url: machbaseQueryUrl(query, sql)
      };
    });
  } catch (err) {
    return { ok: false, source: 'machbase', reason: err.message };
  }
}

function episodeExportZip(args, query) {
  const dataset = query.dataset || args.dataset || DEFAULT_DATASET;
  const sequence = query.sequence || args.sequence || DEFAULT_SEQUENCE;
  try {
    return withDb(args, (conn) => {
      const ep = episodeByIndex(conn, dataset, sequence, query.episode);
      if (!ep) return { ok: false, source: 'machbase', reason: 'episode not found' };
      const timelineRows = queryAll(conn, timelineSql(dataset, sequence, ep.frameStart, ep.frameEnd));
      const pointRows = queryAll(
        conn,
        `SELECT time, value, frame_id, point_count, byte_count, source_episode, source_step FROM ${TABLES.points} WHERE name = ${sqlString(`${dataset}.${sequence}.lidar.raw`)} AND frame_id BETWEEN ${sqlNumber(ep.frameStart, 0)} AND ${sqlNumber(ep.frameEnd, 0)} ORDER BY frame_id`
      );
      const timelineLines = [];
      for (let i = 0; i < timelineRows.length; i++) {
        timelineLines.push(JSON.stringify({
          time: toIso(get(timelineRows[i], 'time')),
          frame_id: Number(get(timelineRows[i], 'frame_id') || 0),
          payload: parseJsonValue(get(timelineRows[i], 'value'))
        }));
      }

      const lidarLines = [];
      const entries = [];
      for (let i = 0; i < pointRows.length; i++) {
        const row = pointRows[i];
        const frameId = Number(get(row, 'frame_id') || 0);
        const bytes = bytesOf(get(row, 'value'));
        const file = `lidar/${frameId}.xyzi.bin`;
        lidarLines.push(JSON.stringify({
          time: toIso(get(row, 'time')),
          frame_id: frameId,
          point_count: Number(get(row, 'point_count') || Math.floor(bytes.length / 16)),
          byte_count: Number(get(row, 'byte_count') || bytes.length),
          source_episode: get(row, 'source_episode') || '',
          source_step: Number(get(row, 'source_step') || 0),
          file: file
        }));
        entries.push({ name: file, data: Buffer.from(bytes) });
      }

      const sql = timelineSql(dataset, sequence, ep.frameStart, ep.frameEnd);
      const manifestData = {
        dataset: dataset,
        sequence: sequence,
        task: ep.task,
        category: ep.category,
        description: ep.description,
        robotType: ep.robotType,
        sourceEpisode: ep.name,
        frameStart: ep.frameStart,
        frameEnd: ep.frameEnd,
        frameCount: ep.frameCount,
        stepStart: ep.stepStart,
        stepEnd: ep.stepEnd,
        minTime: ep.minTime,
        maxTime: ep.maxTime,
        durationMs: ep.durationMs,
        pointFrames: pointRows.length,
        exportedAt: new Date().toISOString(),
        tables: {
          timeline: TABLES.timeline,
          lidar: TABLES.points
        },
        encodings: {
          timeline: 'ndjson',
          lidar: 'little-endian float32 xyzi repeated'
        },
        machbase: {
          timelineSql: sql,
          timelineNdjsonUrl: machbaseQueryUrl(query, sql)
        }
      };

      entries.unshift(
        { name: 'manifest.json', data: JSON.stringify(manifestData, null, 2) + '\n' },
        { name: 'timeline.ndjson', data: timelineLines.join('\n') + (timelineLines.length ? '\n' : '') },
        { name: 'lidar.frames.ndjson', data: lidarLines.join('\n') + (lidarLines.length ? '\n' : '') }
      );
      const archive = zip.zipSync(entries);
      const filename = `humanoid-${safeFilePart(ep.task || ep.name, 'episode')}-${safeFilePart(ep.name.split('/').pop(), 'episode')}-sensors.zip`;
      return {
        ok: true,
        source: 'machbase',
        filename: filename,
        episode: ep,
        byteCount: archive.byteLength || archive.length || 0,
        bytes: Buffer.from(archive)
      };
    });
  } catch (err) {
    return { ok: false, source: 'machbase', reason: err.message };
  }
}

module.exports = {
  episodes,
  episodeExportZip,
  episodeIndexFromRows,
  frame,
  frames,
  manifest,
  poses,
  points,
  pointsBinary,
  timelineQueryLink
};
