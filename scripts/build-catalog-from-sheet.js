'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { intArg, parseArgs, resolveProjectPath } = require(path.join(ROOT, 'lib', 'env.js'));

const DEFAULT_SHEET_CSV = 'https://docs.google.com/spreadsheets/d/158Wzf8Xywky3aHJSCfp3OZxf4bkhzAJdcG94eHf8gVc/export?format=csv&gid=1307250382';

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function readBodyText(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      try {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers && res.headers.location) {
          readBodyText(res.headers.location).then(resolve, reject);
          return;
        }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`unexpected HTTP status ${res.statusCode}: ${url}`));
          return;
        }
        const body = res.readBody();
        resolve(String(body || ''));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const input = String(text || '');
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell.replace(/\r$/, ''));
    rows.push(row);
  }
  return rows;
}

function directDownloadUrl(url) {
  if (!url) return '';
  if (url.indexOf('dl=') >= 0) return url.replace(/([?&])dl=\d/g, '$1dl=1');
  return url + (url.indexOf('?') >= 0 ? '&dl=1' : '?dl=1');
}

function taskRows(rows) {
  return rows.filter(row => /^\d+$/.test(String(row[0] || '').trim()) && row[1] && row[2]);
}

function buildCatalog(rows, perCategory) {
  const pickedByCategory = {};
  const out = [];
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const missing = String(row[7] || '').trim();
    if (missing) continue;
    const category = String(row[1] || '').trim();
    pickedByCategory[category] = pickedByCategory[category] || 0;
    if (pickedByCategory[category] >= perCategory) continue;
    pickedByCategory[category]++;
    out.push({
      category: category,
      task: String(row[2] || '').trim(),
      robot: String(row[3] || '').trim().toLowerCase(),
      description: String(row[4] || '').trim(),
      url: directDownloadUrl(String(row[5] || '').trim())
    });
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || args.sheet || DEFAULT_SHEET_CSV;
  const perCategory = Math.max(1, intArg(args.perCategory || args['per-category'], 5));
  const outFile = resolveProjectPath(args.out, 'data/catalog/humanoid-category-tasks.json', ROOT);
  const text = await readBodyText(url);
  const rows = taskRows(parseCsv(text));
  const catalog = buildCatalog(rows, perCategory);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(catalog, null, 2) + '\n');
  const categories = {};
  for (let i = 0; i < catalog.length; i++) {
    categories[catalog[i].category] = (categories[catalog[i].category] || 0) + 1;
  }
  println(JSON.stringify({
    ok: true,
    sourceRows: rows.length,
    output: outFile,
    tasks: catalog.length,
    perCategory: perCategory,
    categories: categories
  }, null, 2));
}

main().catch(err => {
  println(JSON.stringify({ ok: false, reason: err.message || String(err) }, null, 2));
  throw err;
});
