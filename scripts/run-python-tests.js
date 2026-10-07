#!/usr/bin/env node
'use strict';

/**
 * run-python-tests.js (dev-only, not published to npm)
 *
 * Runs the Python unit test suite with the same interpreter detection used by
 * the CLI, so a broken `python` shim (e.g. WindowsApps) does not fail npm test.
 */

const { spawnSync } = require('child_process');
const { detectPython } = require('../lib/python-detector.js');

const runner = detectPython();
if (!runner) {
  console.error('Python 3 not found. Install it from https://python.org');
  process.exit(1);
}

const result = spawnSync(
  runner.command,
  [...runner.preArgs, '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'test_*.py'],
  { stdio: 'inherit' }
);
process.exit(result.status ?? 1);
