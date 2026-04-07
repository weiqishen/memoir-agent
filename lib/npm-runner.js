'use strict';

const { spawnSync } = require('child_process');

function quoteWindowsShellArg(arg) {
  const value = String(arg);
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

function runNpm(args, options = {}) {
  if (process.platform === 'win32') {
    const command = ['npm.cmd', ...args.map(quoteWindowsShellArg)].join(' ');
    return spawnSync(command, {
      ...options,
      shell: true,
    });
  }

  return spawnSync('npm', args, options);
}

module.exports = {
  runNpm,
};
