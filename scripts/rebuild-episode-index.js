'use strict';

const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig, intArg, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));
const { TABLES, ensureSchema } = require(path.join(ROOT, 'lib', 'schema.js'));
const { episodeIndexFromRows } = require(path.join(ROOT, 'lib', 'api.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function closeQuietly(obj) {
  try { obj && obj.close && obj.close(); } catch (_) {}
}

function clip(value, max) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
}

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function queryAll(conn, sql) {
  let rows;
  const out = [];
  try {
    rows = conn.query(sql);
    for (const row of rows) out.push(row);
  } finally {
    closeQuietly(rows);
  }
  return out;
}

function dateFrom(value) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : new Date(0);
}

function main() {
  const args = parseArgs(process.argv);
  const dataset = args.dataset || 'humanoid-everyday';
  const sequence = args.sequence || 'humanoid-everyday-10m';
  const limit = Math.max(1, intArg(args.limit, 100000));
  const tagName = `${dataset}.${sequence}.timeline`;

  const db = new Client(dbConfig(args));
  let conn;
  let appender;
  try {
    conn = db.connect();
    try {
      conn.exec(`DROP TABLE ${TABLES.episodeIndex}`);
      println('dropped', TABLES.episodeIndex);
    } catch (_) {
      println('create', TABLES.episodeIndex);
    }
    ensureSchema(conn);

    const rows = queryAll(
      conn,
      `SELECT time, value, frame_id FROM ${TABLES.timeline} WHERE name = ${sqlString(tagName)} ORDER BY frame_id LIMIT ${limit}`
    );
    const episodes = episodeIndexFromRows(rows);
    appender = conn.append(TABLES.episodeIndex);
    for (let i = 0; i < episodes.length; i++) {
      const ep = episodes[i];
      appender.append(
        dataset,
        sequence,
        i,
        clip(ep.name, 160),
        clip(ep.task, 160),
        clip(ep.category, 64),
        clip(ep.description, 512),
        clip(ep.robotType, 16),
        ep.frameStart,
        ep.frameEnd,
        ep.frameCount,
        ep.stepStart,
        ep.stepEnd,
        dateFrom(ep.minTime),
        dateFrom(ep.maxTime),
        Math.round(Number(ep.durationMs || 0)),
        Math.round(Number(ep.pointFrames || 0))
      );
    }
    appender.flush();
    println(JSON.stringify({
      ok: true,
      dataset: dataset,
      sequence: sequence,
      sourceRows: rows.length,
      episodes: episodes.length,
      frameCount: episodes.reduce((sum, ep) => sum + Number(ep.frameCount || 0), 0),
      table: TABLES.episodeIndex
    }, null, 2));
  } finally {
    closeQuietly(appender);
    closeQuietly(conn);
    closeQuietly(db);
  }
}

main();
