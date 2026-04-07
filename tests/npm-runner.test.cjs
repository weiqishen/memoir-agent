const test = require('node:test');
const assert = require('node:assert/strict');

const { runNpm } = require('../lib/npm-runner.js');

test('runNpm can invoke npm from node on Windows-compatible paths', () => {
  const result = runNpm(['--version'], { stdio: 'pipe' });

  assert.equal(result.status, 0);
  assert.equal(result.error, undefined);
  assert.match(result.stdout.toString().trim(), /^\d+\.\d+\.\d+/);
});
