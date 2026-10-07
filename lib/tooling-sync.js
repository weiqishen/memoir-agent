'use strict';

const fs = require('fs');
const path = require('path');

/** Copy src → dst, ALWAYS overwriting existing files. */
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
    }
  }
}

/**
 * Sync tooling files from a template dir into the user's project.
 * OVERWRITES: .agents/  memoirs/webapp/src/  memoirs/webapp/dist/ (app shell)
 *             memoirs/webapp/public/ (icons only)
 * SKIPS:      memoirs/entities.yaml  memoirs/periods/  .gitignore  data manifests
 */
function syncTooling(templateDir, target, options = {}) {
  const log = options.log || (() => {});
  const webappTemplate = path.join(templateDir, 'memoirs', 'webapp');
  const webappTarget = path.join(target, 'memoirs', 'webapp');

  copyDirOverwrite(path.join(templateDir, '.agents'), path.join(target, '.agents'));

  copyDirOverwrite(
    path.join(webappTemplate, 'src'),
    path.join(webappTarget, 'src')
  );

  // Pre-built app shell. Never touch manifest/chapters/assets data if a legacy
  // project still keeps them next to the bundles.
  const distSrc = path.join(webappTemplate, 'dist');
  const distDst = path.join(webappTarget, 'dist');
  const distSkips = new Set([
    'memoirs.manifest.json',
    'memoirs.json',
    'chapters',
  ]);
  if (fs.existsSync(distSrc)) {
    for (const name of fs.readdirSync(distSrc)) {
      if (distSkips.has(name)) continue;
      const s = path.join(distSrc, name);
      const d = path.join(distDst, name);
      if (fs.statSync(s).isDirectory()) {
        copyDirOverwrite(s, d);
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
      }
      log(name);
    }
  }

  // Static icons only; personal data (chapters/assets/manifest) is never synced.
  const publicSrc = path.join(webappTemplate, 'public');
  const publicDst = path.join(webappTarget, 'public');
  const publicSkips = new Set(['chapters', 'assets', 'memoirs.manifest.json', 'memoirs.json']);
  if (fs.existsSync(publicSrc)) {
    for (const name of fs.readdirSync(publicSrc)) {
      if (publicSkips.has(name)) continue;
      const s = path.join(publicSrc, name);
      const d = path.join(publicDst, name);
      if (fs.statSync(s).isDirectory()) {
        copyDirOverwrite(s, d);
      } else {
        fs.mkdirSync(path.dirname(d), { recursive: true });
        fs.copyFileSync(s, d);
      }
      log(name);
    }
  }
}

module.exports = {
  copyDirOverwrite,
  syncTooling,
};
