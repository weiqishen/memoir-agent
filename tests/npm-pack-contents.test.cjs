const test = require('node:test');
const assert = require('node:assert/strict');
const { runNpm } = require('../lib/npm-runner.js');

function getDryRunFileList() {
  const result = runNpm(['pack', '--dry-run', '--json'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const packEntries = JSON.parse(result.stdout);
  return packEntries[0].files.map(file => file.path).sort();
}

test('npm package includes empty manifest files and excludes Python caches', () => {
  const files = getDryRunFileList();

  assert.ok(files.includes('template/memoirs/webapp/dist/memoirs.manifest.json'));
  assert.ok(files.includes('template/memoirs/webapp/public/memoirs.manifest.json'));
  assert.ok(files.includes('template/gitignore.template'));
  assert.ok(files.includes('template/.agents/skills/biographer-skill/tools/entity_resolver.py'));
  assert.ok(files.includes('template/.agents/skills/biographer-skill/tools/migrate_timeline_ids.py'));
  assert.ok(files.includes('template/.agents/skills/biographer-skill/tools/time_spec.py'));
  assert.ok(files.includes('template/memoirs/webapp/src/graphModel.ts'));
  assert.ok(files.includes('template/memoirs/webapp/src/graphModel.test.ts'));
  assert.ok(files.includes('template/memoirs/webapp/src/timeModel.ts'));
  assert.ok(files.includes('template/memoirs/webapp/src/timeModel.test.ts'));
  assert.equal(files.some(file => file.includes('__pycache__')), false);
  assert.equal(files.some(file => file.endsWith('.pyc')), false);
  assert.equal(files.some(file => file.includes('/node_modules/')), false);
  assert.equal(files.some(file => file.includes('/chapters/')), false);
});
