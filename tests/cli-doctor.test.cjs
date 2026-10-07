const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'cli.js');
const { detectPython } = require('../lib/python-detector.js');

function createProject(root) {
  const periodDir = path.join(root, 'memoirs', 'periods', 'US_PhD');
  fs.mkdirSync(path.join(periodDir, 'raw_notes'), { recursive: true });
  fs.mkdirSync(path.join(root, 'memoirs', 'webapp', 'dist'), { recursive: true });
  fs.writeFileSync(
    path.join(periodDir, 'timeline.yaml'),
    [
      'period: US_PhD',
      'entries:',
      '  - id: arrival',
      '    date: "2024-09"',
      '    event: "Arrival"',
      '    summary: "s"',
      '    related_files: ["raw_notes/arrival.md"]',
      '',
    ].join('\n'),
    'utf8'
  );
  fs.writeFileSync(
    path.join(periodDir, 'raw_notes', 'arrival.md'),
    '---\npeople: []\nplaces: []\n---\nbody\n',
    'utf8'
  );
  fs.writeFileSync(path.join(root, 'memoirs', 'entities.yaml'), 'people: {}\nplaces: {}\n', 'utf8');
}

test('memoir sync + doctor works on a fresh project layout', (t) => {
  const python = detectPython();
  if (!python) {
    t.skip('Python runtime is required for the doctor integration test.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-doctor-'));
  const env = {
    ...process.env,
    MEMOIR_SKIP_PY_DEPS: '1',
    MEMOIR_PYTHON_CMD: python.command,
  };

  try {
    createProject(tempDir);

    const sync = spawnSync('node', [cliPath, 'sync'], { cwd: tempDir, encoding: 'utf8', env });
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);
    assert.equal(fs.existsSync(path.join(tempDir, '.agents', 'skills', 'biographer-skill', 'tools', 'doctor.py')), true);

    const doctor = spawnSync('node', [cliPath, 'doctor'], { cwd: tempDir, encoding: 'utf8', env });
    assert.equal(doctor.status, 0, doctor.stderr || doctor.stdout);
    assert.match(`${doctor.stdout}`, /error\(s\)/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('memoir doctor --json exits 2 and reports errors on broken data', (t) => {
  const python = detectPython();
  if (!python) {
    t.skip('Python runtime is required for the doctor integration test.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-doctor-broken-'));
  const env = {
    ...process.env,
    MEMOIR_SKIP_PY_DEPS: '1',
    MEMOIR_PYTHON_CMD: python.command,
  };

  try {
    createProject(tempDir);
    fs.writeFileSync(
      path.join(tempDir, 'memoirs', 'periods', 'US_PhD', 'timeline.yaml'),
      'period: US_PhD\nentries:\n  - id: "broken\n',
      'utf8'
    );

    const sync = spawnSync('node', [cliPath, 'sync'], { cwd: tempDir, encoding: 'utf8', env });
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const doctor = spawnSync('node', [cliPath, 'doctor', '--json'], { cwd: tempDir, encoding: 'utf8', env });
    assert.equal(doctor.status, 2, doctor.stderr || doctor.stdout);

    const payload = JSON.parse(doctor.stdout);
    assert.ok(payload.summary.errors >= 1);
    assert.ok(payload.checks.some(check => check.code === 'timeline_parse'));
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('memoir update --dry-run lists migrations with zero side effects', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-update-dry-'));
  const env = { ...process.env, MEMOIR_SKIP_PY_DEPS: '1' };

  try {
    createProject(tempDir);
    // Legacy duplicated data marks the project as schema 0/1.
    const legacyChapter = path.join(tempDir, 'memoirs', 'webapp', 'public', 'chapters', 'US_PhD', 'a.md');
    fs.mkdirSync(path.dirname(legacyChapter), { recursive: true });
    fs.writeFileSync(legacyChapter, '# legacy', 'utf8');

    const result = spawnSync('node', [cliPath, 'update', '--dry-run'], {
      cwd: tempDir,
      encoding: 'utf8',
      env,
    });

    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /001_backfill_timeline_ids/);
    assert.match(result.stdout, /002_single_source_layout/);

    // Zero side effects: legacy data, tooling and project metadata untouched.
    assert.equal(fs.existsSync(legacyChapter), true);
    assert.equal(fs.existsSync(path.join(tempDir, '.agents')), false);
    assert.equal(fs.existsSync(path.join(tempDir, 'memoirs', '.project.json')), false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('memoir build works from a subdirectory of the project', (t) => {
  const python = detectPython();
  if (!python) {
    t.skip('Python runtime is required for the build integration test.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-subdir-build-'));
  const env = {
    ...process.env,
    MEMOIR_SKIP_PY_DEPS: '1',
    MEMOIR_PYTHON_CMD: python.command,
  };

  try {
    createProject(tempDir);
    const sync = spawnSync('node', [cliPath, 'sync'], { cwd: tempDir, encoding: 'utf8', env });
    assert.equal(sync.status, 0, sync.stderr || sync.stdout);

    const build = spawnSync('node', [cliPath, 'build', '--force'], {
      cwd: path.join(tempDir, 'memoirs', 'periods'),
      encoding: 'utf8',
      env,
    });
    assert.equal(build.status, 0, build.stderr || build.stdout);
    assert.equal(
      fs.existsSync(path.join(tempDir, 'memoirs', '.cache', 'memoirs.manifest.json')),
      true
    );
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
