'use strict';

const process = require('process');
const path = require('path');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function closeQuietly(obj) {
  try { obj && obj.close && obj.close(); } catch (_) {}
}

const args = parseArgs(process.argv);
const db = new Client(dbConfig(args));
let conn;
let rows;
try {
  conn = db.connect();
  rows = conn.query(`
    SELECT i.name index_name, i.type index_type, c.name column_name, i.table_id
    FROM M$SYS_INDEXES i, M$SYS_INDEX_COLUMNS c
    WHERE i.id = c.index_id
      AND i.name LIKE '%PHY%'
    ORDER BY i.name, c.col_id
  `);
  const out = [];
  for (const row of rows) out.push(row);
  println(JSON.stringify(out, null, 2));
} finally {
  closeQuietly(rows);
  closeQuietly(conn);
  closeQuietly(db);
}
