'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { episodes, episodeExportZip, frame, frames, manifest, points, pointsBinary, poses, timelineQueryLink } = require(path.join(ROOT, 'lib', 'api.js'));
const { intArg, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function sendIndex(ctx, file) {
  ctx.setHeader('content-type', 'text/html; charset=utf-8');
  ctx.text(http.status.OK, fs.readFileSync(file, 'utf8'));
}

function setApiHeaders(ctx) {
  // The Machbase package page is served from 5654, while this live API usually runs on 56802.
  ctx.setHeader('access-control-allow-origin', '*');
  ctx.setHeader('access-control-allow-methods', 'GET, OPTIONS');
  ctx.setHeader('access-control-allow-headers', 'content-type');
  ctx.setHeader('access-control-expose-headers', 'content-disposition, x-neo-source, x-neo-lod, x-neo-frame-id, x-neo-point-count, x-neo-byte-count');
}

function json(ctx, data) {
  setApiHeaders(ctx);
  return ctx.json(http.status.OK, data);
}

function setPointHeaders(ctx, payload) {
  const frame = payload && payload.frame || {};
  ctx.setHeader('x-neo-source', String(payload && payload.source || ''));
  ctx.setHeader('x-neo-lod', String(payload && payload.lod != null ? payload.lod : ''));
  ctx.setHeader('x-neo-frame-id', String(frame.frameId != null ? frame.frameId : ''));
  ctx.setHeader('x-neo-point-count', String(payload && payload.pointCount != null ? payload.pointCount : 0));
  ctx.setHeader('x-neo-byte-count', String(payload && payload.byteCount != null ? payload.byteCount : 0));
}

function binary(ctx, payload) {
  setApiHeaders(ctx);
  if (!payload || !payload.ok || !payload.bytes) return json(ctx, payload || { ok: false, reason: 'empty point payload' });
  setPointHeaders(ctx, payload);

  // RouterContext embeds gin.Context in JSH v8.5, which exposes Data/data for byte responses.
  for (const name of ['data', 'Data']) {
    try {
      if (typeof ctx[name] === 'function') return ctx[name](http.status.OK, 'application/octet-stream', payload.bytes);
    } catch (_) {}
  }
  return json(ctx, {
    ok: false,
    source: payload.source,
    reason: 'binary response is not supported by this JSH runtime'
  });
}

function zipBinary(ctx, payload) {
  setApiHeaders(ctx);
  if (!payload || !payload.ok || !payload.bytes) return json(ctx, payload || { ok: false, reason: 'empty export payload' });
  const filename = String(payload.filename || 'humanoid-sensors.zip').replace(/"/g, '');
  ctx.setHeader('content-disposition', `attachment; filename="${filename}"`);
  ctx.setHeader('x-neo-source', String(payload.source || ''));
  ctx.setHeader('x-neo-byte-count', String(payload.byteCount != null ? payload.byteCount : payload.bytes.length || 0));

  for (const name of ['data', 'Data']) {
    try {
      if (typeof ctx[name] === 'function') return ctx[name](http.status.OK, 'application/zip', payload.bytes);
    } catch (_) {}
  }
  return json(ctx, {
    ok: false,
    source: payload.source,
    reason: 'zip response is not supported by this JSH runtime'
  });
}

function queryFromCtx(ctx, names) {
  const out = {};
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    let value = '';
    try {
      value = ctx.query ? ctx.query(name) : '';
    } catch (_) {}
    if ((value == null || value === '') && ctx.request && ctx.request.query && ctx.request.query[name] != null) {
      value = ctx.request.query[name];
    }
    if (value != null && value !== '') out[name] = value;
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  const host = args.host || '127.0.0.1';
  const port = intArg(args.port, 56802);
  const root = ROOT;
  const publicDir = path.join(root, 'public');
  const indexFile = path.join(publicDir, 'index.html');
  const server = new http.Server({
    network: 'tcp',
    address: `${host}:${port}`,
    env: process.env
  });

  server.static('/vendor', path.join(publicDir, 'vendor'));
  server.static('/assets', path.join(publicDir, 'assets'));
  server.staticFile('/app.js', path.join(publicDir, 'app.js'));
  server.staticFile('/unitree-g1.js', path.join(publicDir, 'unitree-g1.js'));
  server.staticFile('/styles.css', path.join(publicDir, 'styles.css'));
  server.staticFile('/index.html', indexFile);

  server.get('/', (ctx) => sendIndex(ctx, indexFile));
  server.get('/api/health', (ctx) => json(ctx, { ok: true, app: 'neo-humanoid-demo' }));
  server.get('/api/manifest', (ctx) => json(ctx, manifest(args)));
  server.get('/api/episodes', (ctx) => json(ctx, episodes(args, queryFromCtx(ctx, ['dataset', 'sequence', 'limit']))));
  server.get('/api/poses', (ctx) => json(ctx, poses(args, queryFromCtx(ctx, ['dataset', 'sequence', 'limit']))));
  server.get('/api/frame', (ctx) => json(ctx, frame(args, queryFromCtx(ctx, ['time', 'frameId', 'frameid', 'dataset', 'sequence']))));
  server.get('/api/frames', (ctx) => json(ctx, frames(args, queryFromCtx(ctx, ['startFrameId', 'endFrameId', 'frameId', 'frameid', 'frameIds', 'frameids', 'count', 'limit', 'dataset', 'sequence']))));
  server.get('/api/points', (ctx) => json(ctx, points(args, queryFromCtx(ctx, ['time', 'frameId', 'frameid', 'lod', 'dataset', 'sequence']))));
  server.get('/api/points.bin', (ctx) => binary(ctx, pointsBinary(args, queryFromCtx(ctx, ['time', 'frameId', 'frameid', 'lod', 'dataset', 'sequence']))));
  server.get('/api/export/timeline-query', (ctx) => json(ctx, timelineQueryLink(args, queryFromCtx(ctx, ['episode', 'dataset', 'sequence', 'machbaseBase', 'machbaseHttpBase', 'machbase-base', 'machbase-http-base']))));
  server.get('/api/export/episode.zip', (ctx) => zipBinary(ctx, episodeExportZip(args, queryFromCtx(ctx, ['episode', 'dataset', 'sequence', 'machbaseBase', 'machbaseHttpBase', 'machbase-base', 'machbase-http-base']))));

  server.serve((result) => {
    println('neo-humanoid-demo server started', result.network, result.address);
  });
}

main();
