#!/usr/bin/env node
'use strict';

/**
 * install-python-deps.js
 * Runs automatically after `npm install memoir-agent` (postinstall hook).
 * Detects Python, then pip-installs the bundled requirements.txt.
 * Never fails the npm install (always exit 0).
 */

const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const REQ = path.join(__dirname, '..', 'requirements.txt');

// ── Detect Python ────────────────────────────────────────────────────────────
function detectPython() {
  for (const cmd of ['python', 'python3']) {
    const r = spawnSync(cmd, ['--version'], { stdio: 'pipe' });
    if (r.status === 0) return cmd;
  }
  return null;
}

const Y = '\x1b[33m', G = '\x1b[32m', R = '\x1b[31m', RST = '\x1b[0m';

console.log(`\n${Y}memoir-agent${RST}: Checking Python dependencies...`);

const pyCmd = detectPython();

if (!pyCmd) {
  console.log(`${Y}⚠${RST}  Python 3 not found — skipping auto-install.`);
  console.log(`   After installing Python, run manually:\n`);
  console.log(`   pip install pyyaml pywebview\n`);
  process.exit(0); // never block npm install
}

const result = spawnSync(
  pyCmd, ['-m', 'pip', 'install', '-r', REQ, '--quiet'],
  { stdio: 'inherit' }
);

if (result.status !== 0) {
  console.log(`${Y}⚠${RST}  pip install encountered issues. Run manually:`);
  console.log(`   pip install pyyaml pywebview\n`);
} else {
  console.log(`${G}✓${RST}  Python dependencies ready.\n`);
}

process.exit(0);
