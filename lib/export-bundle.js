'use strict';

const fs = require('fs');
const path = require('path');
const { copyDirOverwrite } = require('./tooling-sync');

const DIST_SKIPS = new Set(['memoirs.manifest.json', 'memoirs.json', 'chapters']);

function copyDistForExport(srcDir, dstDir, log) {
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (DIST_SKIPS.has(entry.name)) continue;
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyDirOverwrite(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
  log('app shell (index.html + assets)');
}

/**
 * Materialize a portable static bundle: app shell + manifest + /media files.
 * This is the ONLY place where personal data is allowed to be copied.
 */
function exportBundle({ projectRoot, outDir, log = () => {} }) {
  const memoirs = path.join(projectRoot, 'memoirs');
  const distDir = path.join(memoirs, 'webapp', 'dist');
  const manifestPath = path.join(memoirs, '.cache', 'memoirs.manifest.json');
  const periodsDir = path.join(memoirs, 'periods');

  if (!fs.existsSync(distDir)) {
    throw new Error('webapp/dist not found — run `memoir sync` first.');
  }
  if (!fs.existsSync(manifestPath)) {
    throw new Error('manifest not built — run `memoir build` first.');
  }
  if (fs.existsSync(outDir) && fs.readdirSync(outDir).length > 0) {
    throw new Error(`Export directory is not empty: ${outDir}`);
  }

  fs.mkdirSync(outDir, { recursive: true });
  copyDistForExport(distDir, outDir, log);

  fs.copyFileSync(manifestPath, path.join(outDir, 'memoirs.manifest.json'));
  log('memoirs.manifest.json');

  if (fs.existsSync(periodsDir)) {
    for (const entry of fs.readdirSync(periodsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const assetsSrc = path.join(periodsDir, entry.name, 'assets');
      if (!fs.existsSync(assetsSrc)) continue;
      copyDirOverwrite(assetsSrc, path.join(outDir, 'media', entry.name));
      log(`media/${entry.name}/`);
    }
  }

  return outDir;
}

module.exports = {
  exportBundle,
};
