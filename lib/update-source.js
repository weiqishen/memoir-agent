'use strict';

// Use the GitHub tarball URL so npm installs a real package directory
// instead of a junction to a temporary git clone path on Windows.
const GITHUB_TARBALL_INSTALL_SPEC =
  'https://codeload.github.com/weiqishen/memoir-agent/tar.gz/refs/heads/main';

function getGithubUpdateInstallSpec() {
  return GITHUB_TARBALL_INSTALL_SPEC;
}

module.exports = {
  GITHUB_TARBALL_INSTALL_SPEC,
  getGithubUpdateInstallSpec,
};
