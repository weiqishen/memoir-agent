const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const cliPath = path.join(repoRoot, 'cli.js');
const guardSourcePath = path.join(
  repoRoot,
  'template',
  '.agents',
  'skills',
  'biographer-skill',
  'tools',
  'workflow_guard.py'
);

function detectPythonCommand() {
  const candidates = ['python', 'python3', 'D:\\conda\\python.exe'];
  for (const cmd of candidates) {
    const result = spawnSync(cmd, ['--version'], { encoding: 'utf8' });
    if (result.status === 0) return cmd;
  }
  return null;
}

function writeMinimalBuildScript(targetPath) {
  fs.writeFileSync(
    targetPath,
    [
      'import json',
      'import os',
      '',
      'public_dir = os.path.join(os.getcwd(), "memoirs", "webapp", "public")',
      'os.makedirs(public_dir, exist_ok=True)',
      'payload = {"memoirs": {}, "graph": {"nodes": [], "links": []}, "people_index": {}, "places_index": {}, "places_meta": {}}',
      'with open(os.path.join(public_dir, "memoirs.manifest.json"), "w", encoding="utf-8") as f:',
      '    json.dump(payload, f, ensure_ascii=False, indent=2)',
      'print("compiled")',
      '',
    ].join('\n'),
    'utf8'
  );
}

test('memoir build is blocked by workflow guard and memoir build --force bypasses with audit log', (t) => {
  const pyCmd = detectPythonCommand();
  if (!pyCmd) {
    t.skip('Python runtime is required for CLI build guard integration test.');
    return;
  }

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-cli-guard-'));

  try {
    const toolsDir = path.join(tempDir, '.agents', 'skills', 'biographer-skill', 'tools');
    fs.mkdirSync(toolsDir, { recursive: true });
    fs.copyFileSync(guardSourcePath, path.join(toolsDir, 'workflow_guard.py'));
    writeMinimalBuildScript(path.join(toolsDir, 'build_memoir_api.py'));

    fs.mkdirSync(path.join(tempDir, 'memoirs', 'webapp', 'dist'), { recursive: true });
    fs.mkdirSync(path.join(tempDir, 'memoirs', 'periods'), { recursive: true });
    fs.writeFileSync(path.join(tempDir, 'memoirs', '.draft_buffer.md'), 'pending draft', 'utf8');

    const blocked = spawnSync('node', [cliPath, 'build'], {
      cwd: tempDir,
      encoding: 'utf8',
      env: { ...process.env, MEMOIR_SKIP_PY_DEPS: '1', MEMOIR_PYTHON_CMD: pyCmd },
    });
    assert.notEqual(blocked.status, 0);
    assert.match(`${blocked.stdout}\n${blocked.stderr}`, /Workflow guard blocked build/i);

    const forced = spawnSync('node', [cliPath, 'build', '--force'], {
      cwd: tempDir,
      encoding: 'utf8',
      env: { ...process.env, MEMOIR_SKIP_PY_DEPS: '1', MEMOIR_PYTHON_CMD: pyCmd },
    });
    assert.equal(forced.status, 0, forced.stderr || forced.stdout);

    const auditLogPath = path.join(tempDir, 'memoirs', '.workflow_guard.log');
    assert.equal(fs.existsSync(auditLogPath), true);
    assert.match(fs.readFileSync(auditLogPath, 'utf8'), /"action":\s*"build"/);

    const distManifestPath = path.join(tempDir, 'memoirs', 'webapp', 'dist', 'memoirs.manifest.json');
    assert.equal(fs.existsSync(distManifestPath), true);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
