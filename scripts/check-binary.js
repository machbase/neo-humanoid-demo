'use strict';

const fs = require('fs');
const path = require('path');
const process = require('process');
const ROOT = path.dirname(path.dirname(path.resolve(process.argv[1])));
const { parseArgs, resolveProjectPath } = require(path.join(ROOT, 'lib', 'env.js'));

function println() {
  if (console.println) console.println.apply(console, arguments);
  else console.log.apply(console, arguments);
}

function describe(label, value) {
  const type = Object.prototype.toString.call(value);
  const length = value && value.length != null ? value.length : value && value.byteLength != null ? value.byteLength : null;
  println(label, type, typeof value, length);
}

const args = parseArgs(process.argv);
const file = resolveProjectPath(args.file || args._[0], 'data/raw/humanoid-everyday/sample.pcd', ROOT);
const options = [
  undefined,
  { encoding: null }
];

println('file', file);
for (let i = 0; i < options.length; i++) {
  try {
    describe(String(i) + ' ' + JSON.stringify(options[i]), options[i] === undefined ? fs.readFileSync(file) : fs.readFileSync(file, options[i]));
  } catch (e) {
    println(String(i), 'error', e.message || String(e));
  }
}
