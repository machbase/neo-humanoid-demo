'use strict';

const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig } = require(path.join(ROOT, 'lib', 'env.js'));
const { LEGACY_TABLES, TABLES, ensureSchema } = require(path.join(ROOT, 'lib', 'schema.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function closeQuietly(obj) {
  try { obj && obj.close && obj.close(); } catch (_) {}
}

const db = new Client(dbConfig({}));
let conn;

try {
  conn = db.connect();
  const names = [TABLES.lidar, TABLES.timeline].concat(LEGACY_TABLES);
  for (const name of names) {
    try {
      conn.exec(`DROP TABLE ${name}`);
      println('dropped', name);
    } catch (_) {
      println('skip', name);
    }
  }
  ensureSchema(conn);
  println(JSON.stringify({ ok: true, tables: names }, null, 2));
} finally {
  closeQuietly(conn);
  closeQuietly(db);
}
