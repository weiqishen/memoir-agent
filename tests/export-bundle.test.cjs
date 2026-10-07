const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { exportBundle } = require('../lib/export-bundle.js');

function writeFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createProject(root) {
  writeFile(path.join(root, 'memoirs', '.cache', 'memoirs.manifest.json'), '{"schema_version":2}');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'index.html'), '<html></html>');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'assets', 'index.js'), 'js');
  writeFile(path.join(root, 'memoirs', 'periods', 'US_PhD', 'assets', 'img.jpg'), 'img');
  writeFile(path.join(root, 'memoirs', 'periods', 'US_PhD', 'timeline.yaml'), 'period: US_PhD\nentries:\n');
}

test('exportBundle copies app shell, manifest and media exactly once', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-export-'));
  try {
    createProject(root);
    const outDir = path.join(root, 'export');

    exportBundle({ projectRoot: root, outDir, log: () => {} });

    assert.equal(fs.existsSync(path.join(outDir, 'index.html')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'assets', 'index.js')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'memoirs.manifest.json')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'media', 'US_PhD', 'img.jpg')), true);
    assert.equal(fs.existsSync(path.join(outDir, 'chapters')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('exportBundle refuses a non-empty destination and missing data', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-export-guard-'));
  try {
    createProject(root);

    const outDir = path.join(root, 'export');
    writeFile(path.join(outDir, 'existing.txt'), 'x');
    assert.throws(
      () => exportBundle({ projectRoot: root, outDir, log: () => {} }),
      /not empty/
    );

    const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-export-missing-'));
    try {
      assert.throws(
        () => exportBundle({ projectRoot: emptyRoot, outDir: path.join(emptyRoot, 'out'), log: () => {} }),
        /not found/
      );
    } finally {
      fs.rmSync(emptyRoot, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
