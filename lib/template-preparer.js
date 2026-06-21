'use strict';

const fs = require('fs');
const path = require('path');

function createSkeletonManifest() {
  return {
    memoirs: {},
    graph: { nodes: [], links: [] },
    people_index: {},
    places_index: {},
    places_meta: {},
  };
}

function defaultLogger(type, message) {
  const G = '\x1b[32m';
  const Y = '\x1b[33m';
  const RST = '\x1b[0m';
  if (type === 'skip') {
    console.log(`  ${Y}-${RST}  skip: ${message}`);
    return;
  }
  console.log(`  ${G}✓${RST}  ${message}`);
}

function copyDir(src, dst, options = {}) {
  const { excludes = [], templateRoot = dst, log = defaultLogger } = options;
  if (!fs.existsSync(src)) {
    log('skip', src);
    return;
  }

  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (excludes.includes(entry.name)) {
      log('skip', entry.name);
      continue;
    }

    const sourcePath = path.join(src, entry.name);
    const targetPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDir(sourcePath, targetPath, options);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    log('ok', path.relative(templateRoot, targetPath));
  }
}

function replaceDirWithCopy(src, dst, options = {}) {
  if (fs.existsSync(dst)) {
    fs.rmSync(dst, { recursive: true, force: true });
  }
  copyDir(src, dst, options);
}

function copyFile(sourceRoot, templateRoot, rel, dstRel = rel, log = defaultLogger) {
  const sourcePath = path.join(sourceRoot, rel);
  const targetPath = path.join(templateRoot, dstRel);
  if (!fs.existsSync(sourcePath)) {
    log('skip', rel);
    return;
  }

  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
  log('ok', dstRel);
}

function writeText(templateRoot, rel, content, log = defaultLogger) {
  const targetPath = path.join(templateRoot, rel);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, content, 'utf8');
  log('ok', rel);
}

function writeSkeletonManifest(templateRoot, rel, log = defaultLogger) {
  writeText(templateRoot, rel, JSON.stringify(createSkeletonManifest(), null, 2), log);
}

function removeTemplatePath(templateRoot, rel) {
  const targetPath = path.join(templateRoot, rel);
  if (fs.existsSync(targetPath)) {
    fs.rmSync(targetPath, { recursive: true, force: true });
  }
}

function sanitizeMemoirData(templateRoot) {
  const personalDataPaths = [
    path.join('memoirs', 'webapp', 'dist', 'memoirs.json'),
    path.join('memoirs', 'webapp', 'dist', 'chapters'),
    path.join('memoirs', 'webapp', 'public', 'memoirs.json'),
    path.join('memoirs', 'webapp', 'public', 'chapters'),
    path.join('memoirs', 'webapp', 'public', 'assets'),
  ];

  for (const rel of personalDataPaths) {
    removeTemplatePath(templateRoot, rel);
  }
}

function buildEntityTemplate() {
  return `# memoir-agent: Entity Registry
# ---------------------------------------------------------------------------
# Define all named people and places here.
# The compiler uses this to build the knowledge graph and hierarchical views.
#
# FQN (Fully Qualified Name) rules for places:
#   Top-level:   "虹桥火车站"
#   Sub-level:   "虹桥火车站·二楼候车厅"  (use middle dot · as separator)
#
# People
people:
  # "人名":
  #   display: "显示名"
  #   aliases: ["别名", "English name", "initials"]

# Places
places:
  # "地点FQN":
  #   display: "显示名"
  #   aliases: ["别名", "English name", "abbreviation"]
  # "父地点·子地点":
  #   display: "子地点显示名"
  #   parent: "父地点"
  #   aliases: ["local child name"]
`;
}

function buildTemplateGitignore() {
  return `# memoir-agent - personal data (never commit these)
memoirs/periods/
memoirs/.draft_buffer.md
memoirs/.workflow_guard.log
memoirs/.entity_resolution_report.json
memoirs/webapp/public/memoirs.manifest.json
memoirs/webapp/public/chapters/
memoirs/webapp/public/assets/
memoirs/webapp/dist/memoirs.manifest.json
memoirs/webapp/dist/chapters/
memoirs/entities.yaml
`;
}

function buildTemplateNpmignore() {
  return `# npm-only package filters for files under template/.
# memoir init must not copy this file into user projects.
**/__pycache__/
**/*.pyc
memoirs/periods/
memoirs/.draft_buffer.md
memoirs/.workflow_guard.log
memoirs/webapp/public/chapters/
memoirs/webapp/public/assets/
memoirs/webapp/dist/chapters/
memoirs/entities.yaml
!memoirs/webapp/public/memoirs.manifest.json
!memoirs/webapp/dist/memoirs.manifest.json
`;
}

function prepareTemplate({ sourceRoot, templateRoot, log = defaultLogger }) {
  const copyOptions = { excludes: ['__pycache__', '.pytest_cache'], templateRoot, log };

  replaceDirWithCopy(
    path.join(sourceRoot, '.agents'),
    path.join(templateRoot, '.agents'),
    copyOptions
  );

  const webappFiles = [
    'package.json',
    'vite.config.ts',
    'index.html',
    'tsconfig.json',
    'tsconfig.app.json',
    'tsconfig.node.json',
  ];
  for (const file of webappFiles) {
    copyFile(
      sourceRoot,
      templateRoot,
      path.join('memoirs', 'webapp', file),
      path.join('memoirs', 'webapp', file),
      log
    );
  }

  replaceDirWithCopy(
    path.join(sourceRoot, 'memoirs', 'webapp', 'src'),
    path.join(templateRoot, 'memoirs', 'webapp', 'src'),
    { templateRoot, log }
  );
  replaceDirWithCopy(
    path.join(sourceRoot, 'memoirs', 'webapp', 'dist'),
    path.join(templateRoot, 'memoirs', 'webapp', 'dist'),
    { excludes: ['chapters', 'memoirs.json', 'memoirs.manifest.json'], templateRoot, log }
  );

  sanitizeMemoirData(templateRoot);
  writeSkeletonManifest(templateRoot, path.join('memoirs', 'webapp', 'dist', 'memoirs.manifest.json'), log);
  writeSkeletonManifest(templateRoot, path.join('memoirs', 'webapp', 'public', 'memoirs.manifest.json'), log);

  copyFile(sourceRoot, templateRoot, 'open_memoirs.pyw', 'open_memoirs.pyw', log);
  if (fs.existsSync(path.join(sourceRoot, 'create_shortcut.py'))) {
    copyFile(sourceRoot, templateRoot, 'create_shortcut.py', 'create_shortcut.py', log);
  }

  writeText(templateRoot, path.join('memoirs', 'entities.template.yaml'), buildEntityTemplate(), log);
  writeText(templateRoot, 'gitignore.template', buildTemplateGitignore(), log);
  writeText(templateRoot, '.npmignore', buildTemplateNpmignore(), log);
  writeText(templateRoot, path.join('memoirs', 'periods', '.gitkeep'), '', log);
}

module.exports = {
  createSkeletonManifest,
  prepareTemplate,
};
