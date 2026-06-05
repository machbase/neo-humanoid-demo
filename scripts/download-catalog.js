'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { parseArgs, resolveProjectPath } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function safeName(name) {
  return String(name || 'task').replace(/[^A-Za-z0-9_.-]+/g, '_');
}

function getBuffer(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      try {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location) {
          getBuffer(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`unexpected HTTP status ${res.statusCode}: ${url}`));
          return;
        }
        resolve(res.readBodyBuffer());
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const catalogFile = resolveProjectPath(args.catalog, 'data/catalog/humanoid-category-tasks.json', ROOT);
  const outDir = resolveProjectPath(args.out, 'data/raw/humanoid-everyday/archives', ROOT);
  const only = args.task ? String(args.task).split(',') : [];
  const catalog = readJson(catalogFile);
  ensureDir(outDir);
  const downloaded = [];
  for (let i = 0; i < catalog.length; i++) {
    const item = catalog[i];
    if (only.length && only.indexOf(item.task) < 0 && only.indexOf(item.category) < 0) continue;
    const file = path.join(outDir, `${safeName(item.task)}.zip`);
    if (fs.existsSync(file) && !args.overwrite) {
      const stat = fs.statSync(file);
      println('exists', file, stat.size);
      downloaded.push({ task: item.task, category: item.category, file: file, bytes: stat.size, skipped: true });
      continue;
    }
    println('downloading', item.category, item.task);
    println('target', file);
    const bytes = await getBuffer(item.url);
    fs.writeFileSync(file, bytes);
    downloaded.push({ task: item.task, category: item.category, file: file, bytes: bytes.length || bytes.byteLength || 0 });
  }
  println(JSON.stringify({ ok: true, count: downloaded.length, downloads: downloaded }, null, 2));
}

main().catch(err => {
  println(JSON.stringify({ ok: false, reason: err.message || String(err) }, null, 2));
  throw err;
});
