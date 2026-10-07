'use strict';

const { spawnSync } = require('child_process');
const os = require('os');

function probePythonCandidate(command, preArgs = []) {
  const result = spawnSync(command, [...preArgs, '--version'], { stdio: 'pipe' });
  return result.status === 0 ? { command, preArgs } : null;
}

function detectWindowsPythonFromWhere() {
  if (os.platform() !== 'win32') return null;

  // The WindowsApps shim may shadow real Python binaries.
  // Use `where` to probe concrete executable paths as a fallback.
  for (const lookup of ['python', 'python3']) {
    const whereResult = spawnSync('where', [lookup], { stdio: 'pipe', encoding: 'utf8' });
    if (whereResult.status !== 0) continue;

    const paths = String(whereResult.stdout || '')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    for (const resolvedPath of paths) {
      const resolved = probePythonCandidate(resolvedPath);
      if (resolved) return resolved;
    }
  }
  return null;
}

function detectPython() {
  const preferredCmd = process.env.MEMOIR_PYTHON_CMD;
  if (preferredCmd) {
    const preferred = probePythonCandidate(preferredCmd);
    if (preferred) return preferred;
  }

  const candidates = [
    { command: 'python', preArgs: [] },
    { command: 'python3', preArgs: [] },
    { command: 'py', preArgs: ['-3'] },
  ];
  for (const candidate of candidates) {
    const resolved = probePythonCandidate(candidate.command, candidate.preArgs);
    if (resolved) return resolved;
  }

  return detectWindowsPythonFromWhere();
}

function detectPythonw() {
  // On Windows, prefer pythonw (no console window).
  if (os.platform() === 'win32') {
    const pythonw = probePythonCandidate('pythonw');
    if (pythonw) return pythonw;
  }
  return detectPython();
}

module.exports = {
  probePythonCandidate,
  detectPython,
  detectPythonw,
};
