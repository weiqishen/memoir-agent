const test = require('node:test');
const assert = require('node:assert/strict');

const { getGithubUpdateInstallSpec } = require('../lib/update-source.js');

test('getGithubUpdateInstallSpec uses GitHub tarball instead of git clone shorthand', () => {
  assert.equal(
    getGithubUpdateInstallSpec(),
    'https://codeload.github.com/weiqishen/memoir-agent/tar.gz/refs/heads/main'
  );
});
