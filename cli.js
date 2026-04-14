#!/usr/bin/env node
'use strict';

/**
 * memoir-agent CLI
 * ──────────────────────────────────────────────────────────────────────────
 * memoir init [dir]   — scaffold memoir system into directory (default: cwd)
 * memoir build        — compile raw_notes → memoirs.manifest.json
 * memoir open         — launch pywebview desktop viewer
 * memoir --version    — print version
 * memoir --help       — print help
 */

const { spawnSync, spawn } = require('child_process');
const fs   = require('fs');
const path = require('path');
const os   = require('os');

const PKG = require('./package.json');
const { syncPublicAssetsToDist, syncPublicChaptersToDist } = require('./lib/build-asset-sync');
const { runNpm } = require('./lib/npm-runner');
const { getGithubUpdateInstallSpec } = require('./lib/update-source');

// ── ANSI ────────────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const C = '\x1b[36m', B = '\x1b[1m',  D = '\x1b[2m', RST = '\x1b[0m';
const ok   = (s) => console.log(`${G}✓${RST}  ${s}`);
const warn = (s) => console.log(`${Y}⚠${RST}  ${s}`);
const fail = (s) => { console.error(`${R}✗${RST}  ${s}`); process.exit(1); };
const info = (s) => console.log(`${C}→${RST}  ${s}`);

// ── Python detection ────────────────────────────────────────────────────────
function detectPython() {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (r.status === 0) return cmd;
  }
  return null;
}

function detectPythonw() {
  // On Windows, prefer pythonw (no console window)
  if (os.platform() === 'win32') {
    const r = spawnSync('pythonw', ['--version'], { stdio: 'pipe' });
    if (r.status === 0) return 'pythonw';
  }
  return detectPython();
}

function ensurePythonDeps(pyCmd) {
  const req = path.join(__dirname, 'requirements.txt');
  // Fast check: is pyyaml importable?
  const check = spawnSync(pyCmd, ['-c', 'import yaml, webview'], { stdio: 'pipe' });
  if (check.status !== 0) {
    info('Installing Python dependencies (one-time)...');
    const install = spawnSync(pyCmd, ['-m', 'pip', 'install', '-r', req, '--quiet'],
      { stdio: 'inherit' });
    if (install.status !== 0) {
      warn('pip install failed — build may not work correctly.');
      warn('Run: pip install pyyaml pywebview');
    }
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const TEMPLATE = path.join(__dirname, 'template');

/** Copy src → dst, skip files that already exist (idempotent, used by init). */
function copyDir(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d);
    } else {
      if (fs.existsSync(d)) {
        // Skip existing — init is idempotent
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
        ok(path.relative(dst, d));
      }
    }
  }
}

/** Copy src → dst, ALWAYS overwrite (used by sync/update for tooling files). */
function copyDirOverwrite(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirOverwrite(s, d);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      ok(path.relative(dst, d));
    }
  }
}

/**
 * Sync tooling files from a template dir into the user's project.
 * OVERWRITES: .agents/  memoirs/webapp/src/  memoirs/webapp/dist/
 * SKIPS:      memoirs/entities.yaml  memoirs/periods/  .gitignore
 */
function syncTooling(templateDir, target) {
  info('Syncing .agents/ (skills + workflows)...');
  copyDirOverwrite(path.join(templateDir, '.agents'),
                   path.join(target, '.agents'));

  info('Syncing webapp/src/...');
  copyDirOverwrite(path.join(templateDir, 'memoirs', 'webapp', 'src'),
                   path.join(target, 'memoirs', 'webapp', 'src'));

  info('Syncing webapp/dist/ (pre-built)...');
  // Keep user's compiled memoir data intact — only overwrite tooling files
  const distSrc = path.join(templateDir, 'memoirs', 'webapp', 'dist');
  const distDst = path.join(target,      'memoirs', 'webapp', 'dist');
  if (fs.existsSync(distSrc)) {
    for (const f of fs.readdirSync(distSrc)) {
      if (f === 'memoirs.manifest.json' || f === 'chapters') continue; // preserve user data
      const s = path.join(distSrc, f);
      const d = path.join(distDst, f);
      if (fs.statSync(s).isDirectory()) {
        copyDirOverwrite(s, d);
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
        ok(f);
      }
    }
  }
}

// ── Commands ─────────────────────────────────────────────────────────────────

function cmdInit(args) {
  const target = path.resolve(args[0] || '.');
  console.log(`\n${B}memoir-agent${RST}  v${PKG.version}\n`);
  info(`Initializing in  ${target}\n`);

  if (!fs.existsSync(TEMPLATE)) {
    fail('Template directory missing. Reinstall the package: npm install -g memoir-agent');
  }

  // Copy skeleton
  copyDir(TEMPLATE, target);

  // Rename memoirs/entities.template.yaml → memoirs/entities.yaml if not yet present
  const tmplEntity = path.join(target, 'memoirs', 'entities.template.yaml');
  const dstEntity  = path.join(target, 'memoirs', 'entities.yaml');
  if (fs.existsSync(tmplEntity) && !fs.existsSync(dstEntity)) {
    fs.mkdirSync(path.dirname(dstEntity), { recursive: true });
    fs.renameSync(tmplEntity, dstEntity);
    ok('memoirs/entities.yaml  (created from template)');
  }

  // Ensure periods dir
  const periods = path.join(target, 'memoirs', 'periods');
  if (!fs.existsSync(periods)) {
    fs.mkdirSync(periods, { recursive: true });
    fs.writeFileSync(path.join(periods, '.gitkeep'), '');
    ok('memoirs/periods/  (created)');
  }

  console.log(`
${G}${B}✓ Done!${RST}

${B}Next steps:${RST}
  1. Edit  ${B}memoirs/entities.yaml${RST}  — add your people & places
  2. Open Claude Code in this directory
  3. Use the ${B}/recall${RST} slash command to archive your first memory
  4. Run  ${B}memoir build${RST}  to compile
  5. Run  ${B}memoir open${RST}   to launch the viewer
`);
}

function cmdBuild() {
  const pyCmd = detectPython();
  if (!pyCmd) fail('Python 3 not found. Install it from https://python.org');

  ensurePythonDeps(pyCmd);

  const script = path.join(
    process.cwd(),
    '.agents', 'skills', 'biographer-skill', 'tools', 'build_memoir_api.py'
  );
  if (!fs.existsSync(script)) {
    fail('build_memoir_api.py not found.\nAre you in your memoir root directory?');
  }

  info('Building memoir data...');
  const result = spawnSync(pyCmd, [script], {
    stdio: 'inherit',
    cwd: process.cwd(),
  });
  if (result.status !== 0) fail('Build failed.');

  // Sync public → dist
  const src = path.join(process.cwd(), 'memoirs', 'webapp', 'public', 'memoirs.manifest.json');
  const dst = path.join(process.cwd(), 'memoirs', 'webapp', 'dist',   'memoirs.manifest.json');
  if (fs.existsSync(src) && fs.existsSync(path.dirname(dst))) {
    fs.copyFileSync(src, dst);
    ok('Synced memoirs.manifest.json → dist/');
  }
  syncPublicAssetsToDist(process.cwd());
  ok('Synced public/assets → dist/assets/');
  syncPublicChaptersToDist(process.cwd());
  ok('Synced public/chapters → dist/chapters/');
  ok('Build complete.');
}

function cmdOpen() {
  const pyCmd = detectPythonw();
  if (!pyCmd) fail('Python not found. Install from https://python.org');

  const script = path.join(process.cwd(), 'open_memoirs.pyw');
  if (!fs.existsSync(script)) {
    fail('open_memoirs.pyw not found.\nAre you in your memoir root directory?');
  }

  info('Launching memoir viewer...');
  const child = spawn(pyCmd, [script], {
    detached: true,
    stdio:    'ignore',
    cwd:      process.cwd(),
  });
  child.unref();
  ok('Viewer launched.');
}

/**
 * memoir update
 * 1. Installs latest code from the GitHub default branch globally
 * 2. Syncs tooling files from the new installation into the current project
 *    (safe: never touches memoirs/entities.yaml or periods/)
 */
function cmdUpdate() {
  const installSpec = getGithubUpdateInstallSpec();
  info('Updating memoir-agent from GitHub default branch...');
  info(`Installing ${installSpec} globally...`);
  const install = runNpm(['install', '-g', installSpec],
    { stdio: 'inherit' });
  if (install.status !== 0) fail(`npm install failed for ${installSpec}.`);
  ok('Package updated from GitHub.');

  // After npm updates globally, locate the new package's template dir.
  const globalRoot = runNpm(['root', '-g'], { stdio: 'pipe' });
  if (globalRoot.status !== 0) {
    warn('Could not locate global npm root — skipping file sync.');
    warn('Run manually: memoir sync');
    return;
  }
  const newTemplate = path.join(globalRoot.stdout.toString().trim(), 'memoir-agent', 'template');

  if (!fs.existsSync(newTemplate)) {
    warn('Could not locate new template dir — skipping file sync.');
    warn(`Run manually: memoir sync`);
    return;
  }

  syncTooling(newTemplate, process.cwd());
  ok('Tooling files synced from latest GitHub package.');
  info('Run  memoir build  to rebuild with the new compiler.');
}

/**
 * memoir sync
 * Syncs tooling files from the CURRENT installed package into the project.
 * Useful when the user manually ran `npm install -g memoir-agent@latest`
 * or when they want to reset .agents/ and dist/ to the package defaults.
 */
function cmdSync() {
  if (!fs.existsSync(TEMPLATE)) {
    fail('Template directory not found. Reinstall: npm install -g memoir-agent');
  }
  info(`Syncing tooling from memoir-agent v${PKG.version}...`);
  syncTooling(TEMPLATE, process.cwd());
  ok('Sync complete.');
  info('Run  memoir build  to rebuild with the updated compiler.');
}

// ── Help / version ───────────────────────────────────────────────────────────
function printHelp() {
  console.log(`
${B}memoir-agent${RST}  v${PKG.version}
AI-powered personal memoir archival system

${B}Usage:${RST}
  memoir <command> [options]

${B}Commands:${RST}
  ${G}init${RST} [dir]   Scaffold memoir system in current or specified directory
  ${G}build${RST}        Compile raw_notes → memoirs.manifest.json  (run after /recall)
  ${G}open${RST}         Launch pywebview desktop viewer
  ${G}update${RST}       Upgrade from GitHub repo + sync tooling files
  ${G}sync${RST}         Sync tooling files from current package (no npm upgrade)

${B}Options:${RST}
  -v, --version   Print version
  -h, --help      Print this help

${B}Examples:${RST}
  memoir init                 # initialize in current directory
  memoir init ~/my-memoirs    # initialize in a specific path
  memoir build
  memoir open
  memoir update               # pull from GitHub default branch + sync tooling
  memoir sync                 # sync tooling files only

${D}Python dependencies (auto-installed on npm install):${RST}
  pyyaml>=6.0  |  pywebview>=5.0
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'init':              cmdInit(args);   break;
  case 'build':             cmdBuild();      break;
  case 'open':              cmdOpen();       break;
  case 'update':            cmdUpdate();     break;
  case 'sync':              cmdSync();       break;
  case '-v':
  case '--version':         console.log(PKG.version); break;
  case '-h':
  case '--help':
  case undefined:           printHelp();     break;
  default:
    console.error(`${R}Unknown command: ${cmd}${RST}`);
    printHelp();
    process.exit(1);
}
