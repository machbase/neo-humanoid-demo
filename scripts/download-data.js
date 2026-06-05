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

function basenameFromUrl(url) {
  const clean = String(url || '').split('?')[0].split('#')[0];
  const base = clean.slice(clean.lastIndexOf('/') + 1);
  return base || 'humanoid-everyday-task.zip';
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
  const url = args.url || args._[0];
  if (!url) {
    throw new Error('missing --url. Provide a Humanoid Everyday task ZIP URL from the task spreadsheet.');
  }
  const outDir = resolveProjectPath(args.out, 'data/raw/humanoid-everyday/archives', ROOT);
  const file = resolveProjectPath(args.file, path.join(outDir, basenameFromUrl(url)), ROOT);
  ensureDir(path.dirname(file));
  println('downloading', url);
  println('target', file);
  const bytes = await getBuffer(url);
  fs.writeFileSync(file, bytes);
  println(JSON.stringify({ ok: true, file: file, bytes: bytes.length || bytes.byteLength || 0 }, null, 2));
}

main().catch(err => {
  println(JSON.stringify({ ok: false, reason: err.message || String(err) }, null, 2));
  throw err;
});
