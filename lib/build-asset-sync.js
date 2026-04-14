'use strict';

const fs = require('fs');
const path = require('path');

function copyDirOverwrite(src, dst) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirOverwrite(srcPath, dstPath);
    } else {
      fs.mkdirSync(path.dirname(dstPath), { recursive: true });
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

function replaceDirWithCopy(src, dst) {
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  copyDirOverwrite(src, dst);
}

function syncPublicAssetsToDist(workspaceDir) {
  const publicAssetsDir = path.join(workspaceDir, 'memoirs', 'webapp', 'public', 'assets');
  const distAssetsDir = path.join(workspaceDir, 'memoirs', 'webapp', 'dist', 'assets');
  copyDirOverwrite(publicAssetsDir, distAssetsDir);
}

function syncPublicChaptersToDist(workspaceDir) {
  const publicChaptersDir = path.join(workspaceDir, 'memoirs', 'webapp', 'public', 'chapters');
  const distChaptersDir = path.join(workspaceDir, 'memoirs', 'webapp', 'dist', 'chapters');
  replaceDirWithCopy(publicChaptersDir, distChaptersDir);
}

module.exports = {
  syncPublicAssetsToDist,
  syncPublicChaptersToDist,
};
