'use strict';

const fs = require('fs');
const path = require('path');

function envGet(name, fallback) {
  try {
    if (typeof process !== 'undefined' && process.env) {
      if (typeof process.env.get === 'function') {
        const value = process.env.get(name);
        return value == null || value === '' ? fallback : value;
      }
      if (process.env[name] != null && process.env[name] !== '') return process.env[name];
    }
  } catch (_) {}
  return fallback;
}

function exists(file) {
  try { return fs.existsSync(file); } catch (_) { return false; }
}

function findProjectRoot(start, fallback) {
  let dir = start || '';
  while (dir) {
    if (exists(path.join(dir, 'lib', 'env.js')) && exists(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (!parent || parent === dir) break;
    dir = parent;
  }
  return fallback;
}

function resolveProjectPath(value, fallback, root) {
  const input = value || fallback;
  if (path.isAbsolute(input)) return input;
  const base = findProjectRoot(envGet('PWD', ''), root);
  return path.join(base, input);
}

function parseArgs(argv) {
  const args = {};
  const rest = [];
  const list = argv || [];
  for (let i = 2; i < list.length; i++) {
    const item = String(list[i]);
    if (item.indexOf('--') === 0) {
      const eq = item.indexOf('=');
      if (eq > 0) {
        args[item.slice(2, eq)] = item.slice(eq + 1);
      } else {
        const key = item.slice(2);
        const next = list[i + 1];
        if (next != null && String(next).indexOf('--') !== 0) {
          args[key] = String(next);
          i++;
        } else {
          args[key] = true;
        }
      }
    } else {
      rest.push(item);
    }
  }
  args._ = rest;
  return args;
}

function intArg(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function dbConfig(args) {
  return {
    host: args.dbHost || envGet('PHY_DB_HOST', '127.0.0.1'),
    port: intArg(args.dbPort || envGet('PHY_DB_PORT', '5656'), 5656),
    user: args.dbUser || envGet('PHY_DB_USER', 'sys'),
    password: args.dbPassword || envGet('PHY_DB_PASSWORD', 'manager')
  };
}

module.exports = {
  dbConfig,
  envGet,
  intArg,
  parseArgs,
  resolveProjectPath
};
