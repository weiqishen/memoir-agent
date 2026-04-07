const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

test('memoir init scaffolds entities registry under memoirs/entities.yaml', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-init-'));

  try {
    const result = spawnSync('node', ['cli.js', 'init', tempDir], {
      cwd: path.resolve(__dirname, '..'),
      encoding: 'utf8',
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(fs.existsSync(path.join(tempDir, 'memoirs', 'entities.yaml')), true);
    assert.equal(fs.existsSync(path.join(tempDir, 'entities.yaml')), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
