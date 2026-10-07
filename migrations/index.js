'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { detectPython } = require('../lib/python-detector');

const TARGET_SCHEMA = 2;

function runTimelineIdMigration(ctx, mode) {
  const script = path.join(
    ctx.projectRoot,
    '.agents',
    'skills',
    'biographer-skill',
    'tools',
    'migrate_timeline_ids.py'
  );
  if (!fs.existsSync(script)) {
    throw new Error('migrate_timeline_ids.py not found — run `memoir sync` first');
  }
  const python = detectPython();
  if (!python) throw new Error('Python 3 not found. Install it from https://python.org');

  const result = spawnSync(python.command, [...python.preArgs, script, mode], {
    cwd: ctx.projectRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(
      `migrate_timeline_ids.py ${mode} failed:\n${result.stderr || result.stdout || 'unknown error'}`
    );
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    return null;
  }
}

/** Legacy duplicated data locations that schema v2 removes. */
function legacyDataPaths(projectRoot) {
  const memoirs = path.join(projectRoot, 'memoirs');
  const publicDir = path.join(memoirs, 'webapp', 'public');
  const distDir = path.join(memoirs, 'webapp', 'dist');
  const paths = [
    path.join(publicDir, 'memoirs.manifest.json'),
    path.join(publicDir, 'chapters'),
    path.join(publicDir, 'assets'),
    path.join(distDir, 'memoirs.manifest.json'),
    path.join(distDir, 'memoirs.json'),
    path.join(distDir, 'chapters'),
  ];

  const periodsDir = path.join(memoirs, 'periods');
  if (fs.existsSync(periodsDir)) {
    for (const entry of fs.readdirSync(periodsDir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        paths.push(path.join(distDir, 'assets', entry.name));
      }
    }
  }
  return paths;
}

function hasLegacyLayout(projectRoot) {
  return legacyDataPaths(projectRoot).some(target => fs.existsSync(target));
}

const migrations = [
  {
    id: '001_backfill_timeline_ids',
    from: 0,
    to: 1,
    describe: 'Backfill stable timeline ids from raw note filenames (idempotent)',
    dryRun(ctx) {
      return runTimelineIdMigration(ctx, '--dry-run');
    },
    run(ctx) {
      return runTimelineIdMigration(ctx, '--write');
    },
  },
  {
    id: '002_single_source_layout',
    from: 1,
    to: 2,
    describe: 'Remove duplicated public/dist data; switch to .cache manifest + /media routes',
    plan(ctx) {
      return legacyDataPaths(ctx.projectRoot).filter(target => fs.existsSync(target));
    },
    dryRun(ctx) {
      return this.plan(ctx).map(target => path.relative(ctx.projectRoot, target));
    },
    run(ctx) {
      const removed = [];
      for (const target of this.plan(ctx)) {
        fs.rmSync(target, { recursive: true, force: true });
        removed.push(path.relative(ctx.projectRoot, target));
      }
      return removed;
    },
  },
];

module.exports = {
  TARGET_SCHEMA,
  migrations,
  hasLegacyLayout,
  legacyDataPaths,
};
