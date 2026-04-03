#!/usr/bin/env node
'use strict';

/**
 * prepare-template.js  (dev-only — not published to npm)
 *
 * Populates memoir-agent/template/ from the parent memoir project.
 * Run before `npm publish`:
 *   node scripts/prepare-template.js
 * Or automatically via:
 *   npm run prepare-template
 *   npm publish  (triggers prepublishOnly → this script)
 *
 * What it copies:
 *   ../.agents/          → template/.agents/
 *   ../memoirs/webapp/   → template/memoirs/webapp/  (src + dist + config)
 *   ../open_memoirs.pyw  → template/open_memoirs.pyw
 *   ../create_shortcut.py  (if present)
 *
 * What it does NOT copy:
 *   ../memoirs/periods/  (personal data)
 *   ../entities.yaml     (personal data — replaced with blank template)
 *   ../memoirs/webapp/node_modules/
 */

const fs   = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..'); // the memoir project root
const TMPL = path.resolve(__dirname, '..', 'template');

const G = '\x1b[32m', Y = '\x1b[33m', RST = '\x1b[0m', B = '\x1b[1m';
const ok   = (s) => console.log(`  ${G}✓${RST}  ${s}`);
const skip = (s) => console.log(`  ${Y}–${RST}  skip: ${s}`);

// ── Recursive copy (skips node_modules) ──────────────────────────────────────
function copyDir(src, dst, excludes = []) {
  if (!fs.existsSync(src)) { skip(src); return; }
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.includes(entry.name)) { skip(entry.name); continue; }
    const s = path.join(src, entry.name);
    const d = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(s, d, excludes);
    } else {
      fs.mkdirSync(path.dirname(d), { recursive: true });
      fs.copyFileSync(s, d);
      ok(path.relative(TMPL, d));
    }
  }
}

function copyFile(rel, dstRel) {
  const src = path.join(ROOT, rel);
  const dst = path.join(TMPL, dstRel || rel);
  if (!fs.existsSync(src)) { skip(rel); return; }
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
  ok(dstRel || rel);
}

// ── Main ────────────────────────────────────────────────────────────────────
console.log(`\n${B}Preparing memoir-agent template...${RST}\n`);

// 1. Skill + workflows
copyDir(
  path.join(ROOT, '.agents'),
  path.join(TMPL, '.agents'),
  ['__pycache__', '.pytest_cache']
);

// 2. Webapp — src, dist, config (no node_modules)
const webappFiles = [
  'package.json', 'vite.config.ts', 'index.html',
  'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
];
for (const f of webappFiles) {
  copyFile(path.join('memoirs', 'webapp', f),
           path.join('memoirs', 'webapp', f));
}
copyDir(
  path.join(ROOT, 'memoirs', 'webapp', 'src'),
  path.join(TMPL, 'memoirs', 'webapp', 'src')
);
copyDir(
  path.join(ROOT, 'memoirs', 'webapp', 'dist'),
  path.join(TMPL, 'memoirs', 'webapp', 'dist'),
  [] // include everything — memoirs.json will be skeleton
);
// Overwrite the memoirs.json in dist with a skeleton (no personal data)
const skeletonJson = JSON.stringify({
  memoirs:      {},
  graph:        { nodes: [], links: [] },
  people_index: {},
  places_index: {},
  places_meta:  {}
}, null, 2);
const distJson = path.join(TMPL, 'memoirs', 'webapp', 'dist', 'memoirs.json');
fs.writeFileSync(distJson, skeletonJson);
ok('memoirs/webapp/dist/memoirs.json (skeleton)');

// 3. Root scripts
copyFile('open_memoirs.pyw');
if (fs.existsSync(path.join(ROOT, 'create_shortcut.py'))) {
  copyFile('create_shortcut.py');
}

// 4. entities.template.yaml — blank template, NOT personal entities.yaml
const entityTemplate = `# memoir-agent: Entity Registry
# ────────────────────────────────────────────────────────────────────────────
# Define all named people and places here.
# The compiler uses this to build the knowledge graph and hierarchical views.
#
# FQN (Fully Qualified Name) rules for places:
#   Top-level:   "虹桥火车站"
#   Sub-level:   "虹桥火车站·二楼候车厅"  (use middle dot · as separator)
#
# ── People ───────────────────────────────────────────────────────────────────
people:
  # "人名":
  #   display: "显示名"

# ── Places ───────────────────────────────────────────────────────────────────
places:
  # "地点FQN":
  #   display: "显示名"
  # "父地点·子地点":
  #   display: "子地点显示名"
  #   parent: "父地点"
`;
fs.writeFileSync(path.join(TMPL, 'entities.template.yaml'), entityTemplate);
ok('entities.template.yaml');

// 5. .gitignore for user projects
const gitignore = `# memoir-agent — personal data (never commit these)
memoirs/periods/
memoirs/.draft_buffer.md
memoirs/webapp/public/memoirs.json
memoirs/webapp/dist/memoirs.json
entities.yaml
`;
fs.writeFileSync(path.join(TMPL, '.gitignore'), gitignore);
ok('.gitignore');

// 6. memoirs/periods/.gitkeep (empty data dir placeholder)
const periodsPlaceholder = path.join(TMPL, 'memoirs', 'periods', '.gitkeep');
fs.mkdirSync(path.dirname(periodsPlaceholder), { recursive: true });
fs.writeFileSync(periodsPlaceholder, '');
ok('memoirs/periods/.gitkeep');

// 7. memoirs/webapp/public/memoirs.json skeleton
const publicJson = path.join(TMPL, 'memoirs', 'webapp', 'public', 'memoirs.json');
fs.mkdirSync(path.dirname(publicJson), { recursive: true });
fs.writeFileSync(publicJson, skeletonJson);
ok('memoirs/webapp/public/memoirs.json (skeleton)');

console.log(`\n${G}✓ Template ready.${RST} Run ${B}npm publish${RST} to release.\n`);
