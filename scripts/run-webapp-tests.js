#!/usr/bin/env node
'use strict';

/**
 * run-webapp-tests.js (dev-only, not published to npm)
 *
 * Runs the React/Vite frontend test suite from the repository root. Skips
 * gracefully when template/memoirs/webapp/node_modules is not installed yet.
 */

const fs = require('fs');
const path = require('path');
const { runNpm } = require('../lib/npm-runner.js');

const webappDir = path.resolve(__dirname, '..', 'template', 'memoirs', 'webapp');

if (!fs.existsSync(path.join(webappDir, 'node_modules'))) {
  console.log('webapp node_modules not found — skipping frontend tests (run npm install in template/memoirs/webapp).');
  process.exit(0);
}

const result = runNpm(['test'], { cwd: webappDir, stdio: 'inherit' });
process.exit(result.status ?? 1);
