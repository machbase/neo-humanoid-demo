'use strict';

const path = require('path');
const process = require('process');
const { Client } = require('machcli');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { dbConfig, parseArgs } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

const args = parseArgs(process.argv);
const db = new Client(dbConfig(args));
let conn;
try {
  conn = db.connect();
  const rows = conn.query("SELECT NAME, TYPE, USER_ID FROM M$SYS_TABLES WHERE NAME LIKE 'PHY_%' ORDER BY NAME");
  const out = [];
  for (const row of rows) out.push(row);
  rows.close && rows.close();
  println(JSON.stringify(out, null, 2));
} finally {
  try { conn && conn.close(); } catch (_) {}
  try { db && db.close(); } catch (_) {}
}
