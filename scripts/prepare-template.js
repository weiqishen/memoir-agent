#!/usr/bin/env node
'use strict';

/**
 * prepare-template.js (dev-only, not published to npm)
 *
 * Populates memoir-agent/template/ from the parent memoir project.
 * Personal memoir data is stripped and replaced with an empty manifest.
 */

const path = require('path');
const { prepareTemplate } = require('../lib/template-preparer.js');

const B = '\x1b[1m';
const G = '\x1b[32m';
const RST = '\x1b[0m';

const sourceRoot = path.resolve(__dirname, '..', '..');
const templateRoot = path.resolve(__dirname, '..', 'template');

console.log(`\n${B}Preparing memoir-agent template...${RST}\n`);
prepareTemplate({ sourceRoot, templateRoot });
console.log(`\n${G}✓ Template ready.${RST} Run ${B}npm publish${RST} to release.\n`);
