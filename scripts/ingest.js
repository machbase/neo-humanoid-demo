'use strict';

const fs = require('fs');
const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig, intArg, parseArgs, resolveProjectPath } = require(path.join(ROOT, 'lib', 'env.js'));
const { TABLES, ensureSchema } = require(path.join(ROOT, 'lib', 'schema.js'));
const { FRAME_RATE_HZ, datasetInfo, framePayload, pcdToPointBytes, stepMedia } = require(path.join(ROOT, 'lib', 'humanoid.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function closeQuietly(obj) {
  try { obj && obj.close && obj.close(); } catch (_) {}
}

function stripRobotSuffix(name) {
  return String(name || '').replace(/_(g1|h1)$/i, '');
}

function addCatalogAlias(out, key, item) {
  if (key && !out[key]) out[key] = item;
}

function readCatalog(file) {
  if (!file) return {};
  try {
    const items = JSON.parse(fs.readFileSync(file, 'utf8'));
    const out = {};
    for (let i = 0; i < items.length; i++) {
      const item = items[i] || {};
      addCatalogAlias(out, item.task, item);
      addCatalogAlias(out, stripRobotSuffix(item.task), item);
      if (item.url) {
        const archiveName = path.basename(String(item.url).split('?')[0], '.zip');
        addCatalogAlias(out, archiveName, item);
        addCatalogAlias(out, stripRobotSuffix(archiveName), item);
      }
    }
    return out;
  } catch (_) {
    return {};
  }
}

function taskName(episodeName) {
  return String(episodeName || '').split('/')[0] || '';
}

function main() {
  const args = parseArgs(process.argv);
  const dataRoot = resolveProjectPath(args.dataRoot || args['data-root'], 'data/raw/humanoid-everyday', ROOT);
  const dataset = args.dataset || 'humanoid-everyday';
  const sequence = args.sequence || 'humanoid-everyday-10m';
  const limit = intArg(args.limit, 0);
  const startEpisode = intArg(args.startEpisode || args['start-episode'], 0);
  const flushEvery = intArg(args.flushEvery || args['flush-every'], 200);
  const episodeLimitPerTask = intArg(args.episodeLimitPerTask || args['episode-limit-per-task'], 0);
  const pointStride = Math.max(1, intArg(args.pointStride || args['point-stride'], 1));
  const pointFrameStride = Math.max(1, intArg(args.pointFrameStride || args['point-frame-stride'], 1));
  const catalogFile = resolveProjectPath(args.catalog, 'data/catalog/humanoid-category-tasks.json', ROOT);
  const catalog = readCatalog(catalogFile);
  const catalogOnly = !!(args.catalogOnly || args['catalog-only']);
  const targetMinutes = Number(args.minutes || args.targetMinutes || args['target-minutes'] || 10);
  const targetMs = Math.max(0, targetMinutes * 60 * 1000);

  const info = datasetInfo(dataRoot);
  if (!info.episodeCount) throw new Error(`no Humanoid Everyday episodes found under ${dataRoot}`);

  const db = new Client(dbConfig(args));
  let conn;
  let timelineAppender;
  let pointAppender;
  let frameCount = 0;
  let pointFrames = 0;
  let elapsedMs = 0;
  let globalFrameId = 0;

  try {
    conn = db.connect();
    ensureSchema(conn);
    timelineAppender = conn.append(TABLES.timeline);
    pointAppender = conn.append(TABLES.points);

    const baseTime = Date.parse(args.baseTime || args['base-time'] || '2026-01-01T00:00:00Z');
    let remaining = limit > 0 ? limit : 0;
    const loadedByTask = {};

    for (let e = startEpisode; e < info.episodes.length; e++) {
      if (limit > 0 && remaining <= 0) break;
      if (limit <= 0 && targetMs > 0 && elapsedMs >= targetMs) break;
      const episode = info.episodes[e];
      const sourceTask = taskName(episode.name);
      const meta = catalog[sourceTask] || null;
      const task = meta && meta.task || sourceTask;
      if (catalogOnly && !meta) continue;
      loadedByTask[task] = loadedByTask[task] || 0;
      if (episodeLimitPerTask > 0 && loadedByTask[task] >= episodeLimitPerTask) continue;
      loadedByTask[task]++;
      for (let i = 0; i < episode.steps.length; i++) {
        if (limit > 0 && remaining <= 0) break;
        if (limit <= 0 && targetMs > 0 && elapsedMs >= targetMs) break;
        const step = episode.steps[i] || {};
        const time = new Date(baseTime + elapsedMs);
        const media = stepMedia(episode.dir, step, i);
        const shouldLoadPoints = i % pointFrameStride === 0;
        const pointBytes = shouldLoadPoints ? pcdToPointBytes(media.lidar, pointStride) : Buffer.alloc(0);
        const pointCount = Math.floor(pointBytes.length / 16);
        const payload = framePayload(dataRoot, episode, step, i, globalFrameId, time, pointCount);
        payload.frame.task = task;
        payload.frame.category = meta && meta.category || '';
        payload.frame.taskDescription = meta && meta.description || '';
        payload.robot.type = meta && meta.robot || payload.robot.type;

        timelineAppender.append(
          `${dataset}.${sequence}.timeline`,
          time,
          JSON.stringify(payload),
          globalFrameId,
          dataset,
          sequence,
          'timeline',
          'ingest'
        );

        if (pointBytes.length > 0) {
          pointAppender.append(
            `${dataset}.${sequence}.lidar.raw`,
            time,
            pointBytes,
            globalFrameId,
            pointCount,
            pointBytes.length,
            dataset,
            sequence,
            episode.name,
            i
          );
          pointFrames++;
        }

        frameCount++;
        globalFrameId++;
        elapsedMs += 1000 / FRAME_RATE_HZ;
        if (limit > 0) remaining--;
        if (flushEvery > 0 && frameCount % flushEvery === 0) {
          timelineAppender.flush();
          pointAppender.flush();
          println('ingested frames', frameCount, 'pointFrames', pointFrames);
        }
      }
    }

    timelineAppender.flush();
    pointAppender.flush();
    println(JSON.stringify({
      ok: true,
      dataset: dataset,
      sequence: sequence,
      dataRoot: dataRoot,
      sourceEpisodes: info.episodeCount,
      frames: frameCount,
      pointFrames: pointFrames,
      tasks: Object.keys(loadedByTask).filter(name => loadedByTask[name] > 0).length,
      episodeLimitPerTask: episodeLimitPerTask,
      pointStride: pointStride,
      pointFrameStride: pointFrameStride,
      durationMs: Math.round(elapsedMs)
    }, null, 2));
  } finally {
    closeQuietly(timelineAppender);
    closeQuietly(pointAppender);
    closeQuietly(conn);
    closeQuietly(db);
  }
}

main();
