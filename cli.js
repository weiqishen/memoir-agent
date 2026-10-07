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

const PKG = require('./package.json');
const { syncTooling } = require('./lib/tooling-sync');
const { runNpm } = require('./lib/npm-runner');
const { getGithubUpdateInstallSpec } = require('./lib/update-source');
const { detectPython, detectPythonw } = require('./lib/python-detector');
const { upgradeProject, detectSchema, pendingMigrations, TARGET_SCHEMA } = require('./lib/upgrader');

// ── ANSI ────────────────────────────────────────────────────────────────────
const G = '\x1b[32m', Y = '\x1b[33m', R = '\x1b[31m';
const C = '\x1b[36m', B = '\x1b[1m',  D = '\x1b[2m', RST = '\x1b[0m';
const ok   = (s) => console.log(`${G}✓${RST}  ${s}`);
const warn = (s) => console.log(`${Y}⚠${RST}  ${s}`);
const fail = (s) => { console.error(`${R}✗${RST}  ${s}`); process.exit(1); };
const info = (s) => console.log(`${C}→${RST}  ${s}`);

// ── Python detection ────────────────────────────────────────────────────────
// Shared with the upgrader/doctor via lib/python-detector.js.

function ensurePythonDeps(pyRunner) {
  if (process.env.MEMOIR_SKIP_PY_DEPS === '1') return;
  const req = path.join(__dirname, 'requirements.txt');
  // Fast check: are required runtime modules importable?
  const check = spawnSync(pyRunner.command, [...pyRunner.preArgs, '-c', 'import yaml, webview'], { stdio: 'pipe' });
  if (check.status !== 0) {
    info('Installing Python dependencies (one-time)...');
    const install = spawnSync(pyRunner.command, [...pyRunner.preArgs, '-m', 'pip', 'install', '-r', req, '--quiet'],
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
    if (entry.name === '.npmignore') {
      // Template package filters are for npm only; user projects should not inherit them.
      continue;
    }
    if (entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.pytest_cache') {
      // Dev-machine artifacts never belong in a scaffolded project.
      continue;
    }
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

  // npm does not reliably publish .gitignore files inside package templates,
  // so the template ships a regular file and init materializes it for users.
  const tmplGitignore = path.join(target, 'gitignore.template');
  const dstGitignore = path.join(target, '.gitignore');
  if (fs.existsSync(tmplGitignore)) {
    if (!fs.existsSync(dstGitignore)) {
      fs.renameSync(tmplGitignore, dstGitignore);
      ok('.gitignore  (created from template)');
    } else {
      fs.unlinkSync(tmplGitignore);
    }
  }

  // Ensure periods dir
  const periods = path.join(target, 'memoirs', 'periods');
  if (!fs.existsSync(periods)) {
    fs.mkdirSync(periods, { recursive: true });
    fs.writeFileSync(path.join(periods, '.gitkeep'), '');
    ok('memoirs/periods/  (created)');
  }

  // Project metadata lets `memoir update` know which migrations to run.
  const projectMeta = path.join(target, 'memoirs', '.project.json');
  if (!fs.existsSync(projectMeta)) {
    fs.writeFileSync(projectMeta, `${JSON.stringify({
      project_schema: 2,
      tool_version: PKG.version,
      last_upgraded_at: new Date().toISOString(),
    }, null, 2)}\n`, 'utf8');
    ok('memoirs/.project.json  (project metadata)');
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

function cmdBuild(args = []) {
  const pyRunner = detectPython();
  if (!pyRunner) fail('Python 3 not found. Install it from https://python.org');

  const forceBuild = args.includes('--force');
  ensurePythonDeps(pyRunner);

  const projectRoot = findProjectRoot(process.cwd()) || process.cwd();
  const guardScript = path.join(
    projectRoot,
    '.agents', 'skills', 'biographer-skill', 'tools', 'workflow_guard.py'
  );
  const script = path.join(
    projectRoot,
    '.agents', 'skills', 'biographer-skill', 'tools', 'build_memoir_api.py'
  );
  if (!fs.existsSync(guardScript)) {
    fail('workflow_guard.py not found.\nRun memoir sync to update tooling files.');
  }
  if (!fs.existsSync(script)) {
    fail('build_memoir_api.py not found.\nAre you in your memoir root directory?');
  }

  info('Running workflow guard for build...');
  const guardArgs = [guardScript, '--action', 'build'];
  if (forceBuild) guardArgs.push('--force');
  const guardResult = spawnSync(pyRunner.command, [...pyRunner.preArgs, ...guardArgs], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  if (guardResult.status !== 0) fail('Workflow guard blocked build.');

  info('Building memoir data...');
  const result = spawnSync(pyRunner.command, [...pyRunner.preArgs, script], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  if (result.status !== 0) fail('Build failed.');

  ok('Build complete.');
  info('Manifest: memoirs/.cache/memoirs.manifest.json');
}

function cmdOpen(args = []) {
  const pyRunner = detectPythonw();
  if (!pyRunner) fail('Python not found. Install from https://python.org');

  const projectRoot = findProjectRoot(process.cwd()) || process.cwd();
  const script = path.join(projectRoot, 'open_memoirs.pyw');
  if (!fs.existsSync(script)) {
    fail('open_memoirs.pyw not found.\nAre you in your memoir root directory?');
  }

  const noBuild = args.includes('--no-build');
  info(noBuild
    ? 'Launching memoir viewer (auto-rebuild disabled)...'
    : 'Launching memoir viewer (auto-rebuilds stale data)...');
  const child = spawn(pyRunner.command, [...pyRunner.preArgs, script], {
    detached: true,
    stdio:    'ignore',
    cwd:      projectRoot,
    env:      noBuild ? { ...process.env, MEMOIR_NO_AUTO_BUILD: '1' } : process.env,
  });
  child.unref();
  ok('Viewer launched.');
}

/** Walk upwards from startDir until a memoir project root is found. */
function findProjectRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'memoirs'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/** Minimal synchronous Y/n prompt (used only when stdin is a TTY). */
function promptLine(question) {
  process.stdout.write(question);
  const buffer = Buffer.alloc(256);
  try {
    const bytes = fs.readSync(0, buffer, 0, buffer.length, null);
    return buffer.toString('utf8', 0, bytes).trim();
  } catch {
    return '';
  }
}

function printUpgradePlan(result) {
  console.log(`\n${B}Upgrade plan${RST}  (schema ${result.from} → ${result.to}, dry-run)\n`);
  if (!result.plan.length) {
    info('Project is already up to date; no data migrations needed.');
    return;
  }
  for (const item of result.plan) {
    info(`${item.id}: ${item.describe}`);
    if (item.preview === null || item.preview === undefined) continue;
    const lines = Array.isArray(item.preview) ? item.preview : [JSON.stringify(item.preview)];
    for (const line of lines.slice(0, 20)) {
      console.log(`      ${typeof line === 'string' ? line : JSON.stringify(line)}`);
    }
  }
  info('Run  memoir update --yes  to apply.');
}

/**
 * memoir update — one-click upgrade:
 * install → sync tooling → ordered data migrations → rebuild → stamp .project.json
 *
 * Flags: --dry-run, --yes, --tooling-only
 */
function cmdUpdate(args = []) {
  const dryRun = args.includes('--dry-run');
  const assumeYes = args.includes('--yes');
  const toolingOnly = args.includes('--tooling-only');

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) fail('Not inside a memoir project (no memoirs/ directory found).');
  if (projectRoot !== process.cwd()) info(`Project root: ${projectRoot}`);

  if (toolingOnly) {
    info('Syncing tooling files only (no migrations)...');
    syncTooling(TEMPLATE, projectRoot, { log: ok });
    ok('Sync complete.');
    return;
  }

  if (dryRun) {
    const result = upgradeProject({
      projectRoot,
      templateDir: TEMPLATE,
      toolVersion: PKG.version,
      dryRun: true,
      log: info,
    });
    printUpgradePlan(result);
    return;
  }

  const schema = detectSchema(projectRoot);
  const pending = pendingMigrations(schema);
  info(`Project schema: ${schema} → ${TARGET_SCHEMA}`);
  if (pending.length === 0) {
    info('No data migrations needed; refreshing tooling and manifest.');
  }
  for (const migration of pending) {
    info(`  - ${migration.id}: ${migration.describe}`);
  }

  if (!assumeYes && process.stdin.isTTY) {
    const answer = promptLine('Proceed with upgrade? [Y/n] ');
    if (answer.toLowerCase() === 'n') {
      info('Aborted. Nothing was changed.');
      return;
    }
  }

  const installSpec = getGithubUpdateInstallSpec();
  info(`Installing ${installSpec} globally...`);
  const install = runNpm(['install', '-g', installSpec], { stdio: 'inherit' });
  if (install.status !== 0) fail(`npm install failed for ${installSpec}.`);
  ok('Package updated from GitHub.');

  // After npm updates globally, sync from the new package when it can be found.
  let templateDir = TEMPLATE;
  const globalRoot = runNpm(['root', '-g'], { stdio: 'pipe' });
  if (globalRoot.status === 0) {
    const candidate = path.join(globalRoot.stdout.toString().trim(), 'memoir-agent', 'template');
    if (fs.existsSync(candidate)) {
      templateDir = candidate;
    } else {
      warn('Could not locate the new global template — syncing from the current package instead.');
    }
  } else {
    warn('Could not locate global npm root — syncing from the current package instead.');
  }

  const rebuild = () => {
    const pyRunner = detectPython();
    if (!pyRunner) {
      warn('Python 3 not found — skipping rebuild. Run memoir build later.');
      return;
    }
    const script = path.join(
      projectRoot,
      '.agents', 'skills', 'biographer-skill', 'tools', 'build_memoir_api.py'
    );
    if (!fs.existsSync(script)) {
      warn('build_memoir_api.py not found — skipping rebuild. Run memoir build later.');
      return;
    }
    info('Rebuilding memoir data...');
    const result = spawnSync(pyRunner.command, [...pyRunner.preArgs, script], {
      stdio: 'inherit',
      cwd: projectRoot,
    });
    if (result.status !== 0) {
      throw new Error(
        'Rebuild failed after migration. Your data is migrated; fix the reported errors and run memoir build.'
      );
    }
  };

  try {
    const report = upgradeProject({
      projectRoot,
      templateDir,
      toolVersion: PKG.version,
      rebuild,
      log: info,
    });
    ok(`Upgrade complete (schema ${report.from} → ${report.to}).`);
    if (report.applied.length > 0) {
      info(`Applied migrations: ${report.applied.join(', ')}`);
    }
    info('Run  memoir doctor  to verify the project.');
  } catch (error) {
    fail(error.message);
  }
}

/**
 * memoir sync — tooling only, from the CURRENT installed package.
 */
function cmdSync() {
  if (!fs.existsSync(TEMPLATE)) {
    fail('Template directory not found. Reinstall: npm install -g memoir-agent');
  }
  const projectRoot = findProjectRoot(process.cwd()) || process.cwd();
  info(`Syncing tooling from memoir-agent v${PKG.version}...`);
  syncTooling(TEMPLATE, projectRoot, { log: ok });
  ok('Sync complete.');
  info('Run  memoir build  to rebuild with the updated compiler.');
}

/** memoir doctor — read-only project health checks. */
function cmdDoctor(args = []) {
  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) fail('Not inside a memoir project (no memoirs/ directory found).');

  const script = path.join(
    projectRoot,
    '.agents', 'skills', 'biographer-skill', 'tools', 'doctor.py'
  );
  if (!fs.existsSync(script)) {
    fail('doctor.py not found.\nRun memoir sync to update tooling files.');
  }
  const pyRunner = detectPython();
  if (!pyRunner) fail('Python 3 not found. Install it from https://python.org');

  const passthrough = args.filter(arg => arg === '--json');
  const result = spawnSync(pyRunner.command, [...pyRunner.preArgs, script, ...passthrough], {
    stdio: 'inherit',
    cwd: projectRoot,
  });
  process.exit(result.status ?? 1);
}

/** memoir export <dir> — materialize a portable static bundle (the only copy path). */
function cmdExport(args = []) {
  const outArg = args.find(arg => !arg.startsWith('-'));
  if (!outArg) fail('Usage: memoir export <dir>');

  const projectRoot = findProjectRoot(process.cwd());
  if (!projectRoot) fail('Not inside a memoir project (no memoirs/ directory found).');

  const { exportBundle } = require('./lib/export-bundle');
  try {
    const outDir = path.resolve(projectRoot, outArg);
    exportBundle({ projectRoot, outDir, log: ok });
    ok(`Exported static bundle to ${outDir}`);
  } catch (error) {
    fail(error.message);
  }
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
  ${G}build${RST} [--force]  Compile periods/ → memoirs/.cache/memoirs.manifest.json
  ${G}open${RST} [--no-build]  Launch pywebview viewer (auto-rebuilds stale data by default)
  ${G}doctor${RST} [--json]  Check project health (layout / YAML / ids / duplicates)
  ${G}export${RST} <dir>  Materialize a portable static bundle (app + data + media)
  ${G}update${RST} [--dry-run] [--yes] [--tooling-only]
                        One-click upgrade: install → migrate → sync → rebuild
  ${G}sync${RST}         Sync tooling files from current package (no npm upgrade)

${B}Options:${RST}
  -v, --version   Print version
  -h, --help      Print this help

${B}Examples:${RST}
  memoir init                 # initialize in current directory
  memoir init ~/my-memoirs    # initialize in a specific path
  memoir build
  memoir build --force         # keep first entry on duplicate ids + audit record
  memoir open
  memoir doctor                # check project health
  memoir update --dry-run      # preview the one-click upgrade
  memoir update                # install + migrate + sync + rebuild
  memoir export ./dist-site    # portable static bundle (app + data + media)
  memoir sync                  # sync tooling files only

${D}Python dependencies (auto-installed on npm install):${RST}
  pyyaml>=6.0  |  pywebview>=5.0
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'init':              cmdInit(args);   break;
  case 'build':             cmdBuild(args);  break;
  case 'open':              cmdOpen(args);   break;
  case 'doctor':            cmdDoctor(args); break;
  case 'export':            cmdExport(args); break;
  case 'update':
  case 'upgrade':           cmdUpdate(args); break;
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
