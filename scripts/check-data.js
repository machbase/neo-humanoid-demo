'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { parseArgs, resolveProjectPath } = require(path.join(ROOT, 'lib', 'env.js'));
const { datasetInfo, stepMedia } = require(path.join(ROOT, 'lib', 'humanoid.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function exists(file) {
  try { return fs.existsSync(file); } catch (_) { return false; }
}

function countMedia(episodes, root) {
  const out = { lidar: 0, rgb: 0, depth: 0 };
  for (let e = 0; e < episodes.length; e++) {
    const episode = episodes[e];
    for (let i = 0; i < episode.steps.length; i++) {
      const media = stepMedia(episode.dir, episode.steps[i] || {}, i);
      if (media.lidar && exists(media.lidar)) out.lidar++;
      if (media.rgb && exists(media.rgb)) out.rgb++;
      if (media.depth && exists(media.depth)) out.depth++;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const dataRoot = resolveProjectPath(args.dataRoot || args['data-root'], 'data/raw/humanoid-everyday', ROOT);
const info = datasetInfo(dataRoot);
const media = countMedia(info.episodes, dataRoot);
const durationMs = Math.round(info.durationMs);

println('cwd', process.cwd ? process.cwd() : '(unknown)');
println(JSON.stringify({
  ok: info.episodeCount > 0,
  dataRoot: dataRoot,
  exists: exists(dataRoot),
  episodes: info.episodeCount,
  steps: info.stepCount,
  durationMs: durationMs,
  durationMinutes: Math.round(durationMs / 60000 * 100) / 100,
  hasMinimum10Minutes: durationMs >= 10 * 60 * 1000,
  media: media,
  firstEpisodes: info.episodes.slice(0, 5).map(ep => ({
    name: ep.name,
    steps: ep.stepCount,
    durationMs: Math.round(ep.durationMs),
    robotType: ep.robotType || ''
  }))
}, null, 2));
