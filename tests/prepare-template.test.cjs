const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { prepareTemplate, createSkeletonManifest } = require('../lib/template-preparer.js');

function writeFile(filePath, content = '') {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

test('createSkeletonManifest returns the empty manifest contract used by the viewer', () => {
  assert.deepEqual(createSkeletonManifest(), {
    memoirs: {},
    graph: { nodes: [], links: [] },
    people_index: {},
    places_index: {},
    places_meta: {},
  });
});

test('prepareTemplate publishes only empty manifest memoir data into the template', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'memoir-template-'));
  const sourceRoot = path.join(tempDir, 'source');
  const templateRoot = path.join(tempDir, 'template');

  try {
    writeFile(path.join(sourceRoot, '.agents', 'workflows', 'recall.md'), '# recall');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'package.json'), '{}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'vite.config.ts'), 'export default {};');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'index.html'), '<div></div>');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'tsconfig.json'), '{}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'tsconfig.app.json'), '{}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'tsconfig.node.json'), '{}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'src', 'App.tsx'), 'export default function App() { return null; }');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'dist', 'index.html'), '<html></html>');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'dist', 'assets', 'index.js'), 'console.log("app");');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'dist', 'chapters', 'Private', 'secret.md'), '# private');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'dist', 'memoirs.manifest.json'), '{"memoirs":{"Private":{}}}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'dist', 'memoirs.json'), '{"Private":true}');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'public', 'chapters', 'Private', 'secret.md'), '# private');
    writeFile(path.join(sourceRoot, 'memoirs', 'webapp', 'public', 'assets', 'Private', 'photo.jpg'), 'image');
    writeFile(path.join(sourceRoot, 'open_memoirs.pyw'), 'print("open")');

    prepareTemplate({ sourceRoot, templateRoot, log: () => {} });

    const expectedManifest = JSON.stringify(createSkeletonManifest(), null, 2);
    assert.equal(
      fs.readFileSync(path.join(templateRoot, 'memoirs', 'webapp', 'dist', 'memoirs.manifest.json'), 'utf8'),
      expectedManifest
    );
    assert.equal(
      fs.readFileSync(path.join(templateRoot, 'memoirs', 'webapp', 'public', 'memoirs.manifest.json'), 'utf8'),
      expectedManifest
    );
    assert.equal(fs.existsSync(path.join(templateRoot, 'memoirs', 'webapp', 'dist', 'memoirs.json')), false);
    assert.equal(fs.existsSync(path.join(templateRoot, 'memoirs', 'webapp', 'public', 'memoirs.json')), false);
    assert.equal(fs.existsSync(path.join(templateRoot, 'memoirs', 'webapp', 'dist', 'chapters')), false);
    assert.equal(fs.existsSync(path.join(templateRoot, 'memoirs', 'webapp', 'public', 'chapters')), false);
    assert.equal(fs.existsSync(path.join(templateRoot, 'memoirs', 'webapp', 'public', 'assets')), false);

    const generatedGitignore = fs.readFileSync(path.join(templateRoot, 'gitignore.template'), 'utf8');
    assert.match(generatedGitignore, /memoirs\/webapp\/public\/memoirs\.manifest\.json/);
    assert.match(generatedGitignore, /memoirs\/webapp\/dist\/memoirs\.manifest\.json/);
    assert.match(generatedGitignore, /memoirs\/\.entity_resolution_report\.json/);
    assert.doesNotMatch(generatedGitignore, /memoirs\.json/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
