const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const templateDir = path.join(repoRoot, 'template');
const { upgradeProject, detectSchema } = require('../lib/upgrader.js');

function writeFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createLegacyProject(root) {
  writeFile(
    path.join(root, 'memoirs', 'periods', 'US_PhD', 'timeline.yaml'),
    [
      'period: US_PhD',
      'entries:',
      '  - id: arrival',
      '    date: "2024-09"',
      '    event: "Arrival"',
      '    summary: "s"',
      '    related_files: ["raw_notes/arrival.md"]',
      '',
    ].join('\n')
  );
  writeFile(
    path.join(root, 'memoirs', 'periods', 'US_PhD', 'raw_notes', 'arrival.md'),
    '---\npeople: []\nplaces: []\n---\nbody\n'
  );
  writeFile(path.join(root, 'memoirs', 'entities.yaml'), 'people: {}\nplaces: {}\n');

  // Legacy duplicated data that schema v2 removes.
  writeFile(path.join(root, 'memoirs', 'webapp', 'public', 'chapters', 'US_PhD', 'a.md'), '# a');
  writeFile(path.join(root, 'memoirs', 'webapp', 'public', 'assets', 'US_PhD', 'img.jpg'), 'img');
  writeFile(path.join(root, 'memoirs', 'webapp', 'public', 'memoirs.manifest.json'), '{}');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'chapters', 'US_PhD', 'a.md'), '# a');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'assets', 'US_PhD', 'img.jpg'), 'img');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'assets', 'index-abc.js'), 'console.log(1)');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'memoirs.manifest.json'), '{}');
  writeFile(path.join(root, 'memoirs', 'webapp', 'dist', 'index.html'), '<html></html>');
}

test('upgrade dry-run lists migrations without touching the project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-upgrade-dry-'));
  try {
    createLegacyProject(root);
    assert.equal(detectSchema(root), 0);

    const result = upgradeProject({
      projectRoot: root,
      templateDir,
      toolVersion: '0.2.0',
      dryRun: true,
      log: () => {},
    });

    assert.equal(result.dryRun, true);
    assert.deepEqual(result.plan.map(item => item.id), [
      '001_backfill_timeline_ids',
      '002_single_source_layout',
    ]);
    // Zero side effects.
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'public', 'chapters')), true);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', '.project.json')), false);
    assert.equal(fs.existsSync(path.join(root, '.agents')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade applies migrations, syncs tooling, rebuilds and stamps schema 2', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-upgrade-'));
  let rebuildCalls = 0;
  try {
    createLegacyProject(root);

    const report = upgradeProject({
      projectRoot: root,
      templateDir,
      toolVersion: '0.2.0',
      rebuild: () => { rebuildCalls += 1; },
      log: () => {},
    });

    assert.equal(report.from, 0);
    assert.equal(report.to, 2);
    assert.deepEqual(report.applied, ['001_backfill_timeline_ids', '002_single_source_layout']);
    assert.equal(rebuildCalls, 1);

    // Duplicated data removed.
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'public', 'chapters')), false);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'public', 'assets')), false);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'public', 'memoirs.manifest.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'dist', 'chapters')), false);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'dist', 'memoirs.manifest.json')), false);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'dist', 'assets', 'US_PhD')), false);
    // App shell survives.
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'dist', 'assets', 'index-abc.js')), true);
    assert.equal(fs.existsSync(path.join(root, 'memoirs', 'webapp', 'dist', 'index.html')), true);
    // Tooling synced.
    assert.equal(
      fs.existsSync(path.join(root, '.agents', 'skills', 'biographer-skill', 'tools', 'doctor.py')),
      true
    );
    // Stamped.
    const meta = JSON.parse(fs.readFileSync(path.join(root, 'memoirs', '.project.json'), 'utf8'));
    assert.equal(meta.project_schema, 2);
    assert.equal(meta.tool_version, '0.2.0');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade is idempotent on an already migrated project', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-upgrade-rerun-'));
  try {
    createLegacyProject(root);

    upgradeProject({
      projectRoot: root,
      templateDir,
      toolVersion: '0.2.0',
      rebuild: () => {},
      log: () => {},
    });

    assert.equal(detectSchema(root), 2);
    const second = upgradeProject({
      projectRoot: root,
      templateDir,
      toolVersion: '0.2.0',
      rebuild: () => {},
      log: () => {},
    });
    assert.deepEqual(second.applied, []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('upgrade refuses a project schema newer than this tool', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-upgrade-newer-'));
  try {
    createLegacyProject(root);
    fs.writeFileSync(
      path.join(root, 'memoirs', '.project.json'),
      JSON.stringify({ project_schema: 99, tool_version: '9.9.9' }),
      'utf8'
    );

    assert.throws(
      () => upgradeProject({
        projectRoot: root,
        templateDir,
        toolVersion: '0.2.0',
        rebuild: () => {},
        log: () => {},
      }),
      /newer than this tool/
    );

    // Even dry-run must refuse instead of printing a downgrade plan.
    assert.throws(
      () => upgradeProject({
        projectRoot: root,
        templateDir,
        toolVersion: '0.2.0',
        dryRun: true,
        log: () => {},
      }),
      /newer than this tool/
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
