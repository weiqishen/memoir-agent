const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { syncPublicAssetsToDist } = require('../lib/build-asset-sync.js');

test('syncPublicAssetsToDist copies public assets into dist assets', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-assets-'));

  try {
    const publicAssetsDir = path.join(tempDir, 'memoirs', 'webapp', 'public', 'assets', 'US_PhD');
    const distDir = path.join(tempDir, 'memoirs', 'webapp', 'dist');
    fs.mkdirSync(publicAssetsDir, { recursive: true });
    fs.mkdirSync(distDir, { recursive: true });

    fs.writeFileSync(path.join(publicAssetsDir, 'banner.jpg'), 'chapter-image');

    syncPublicAssetsToDist(tempDir);

    assert.equal(
      fs.readFileSync(path.join(distDir, 'assets', 'US_PhD', 'banner.jpg'), 'utf8'),
      'chapter-image'
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
