'use strict';

const fs = require('fs');
const path = require('path');

const { syncTooling } = require('./tooling-sync');
const migrationsModule = require('../migrations');

const PROJECT_META_REL = path.join('memoirs', '.project.json');
const { TARGET_SCHEMA, migrations } = migrationsModule;

function readProjectMeta(projectRoot) {
  const metaPath = path.join(projectRoot, PROJECT_META_REL);
  if (!fs.existsSync(metaPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeProjectMeta(projectRoot, meta) {
  const metaPath = path.join(projectRoot, PROJECT_META_REL);
  fs.mkdirSync(path.dirname(metaPath), { recursive: true });
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
}

/**
 * Detect the project's data schema.
 *   0 → legacy layout and/or timeline ids may be missing (conservative)
 *   1 → legacy duplicated layout, ids possibly present
 *   2 → single-source layout
 */
function detectSchema(projectRoot) {
  const meta = readProjectMeta(projectRoot);
  if (meta && Number.isInteger(meta.project_schema)) {
    return meta.project_schema;
  }
  if (migrationsModule.hasLegacyLayout(projectRoot)) {
    return 0;
  }
  return TARGET_SCHEMA;
}

function pendingMigrations(schema) {
  return migrations.filter(migration => migration.to > schema).sort((a, b) => a.to - b.to);
}

function previewMigration(migration, ctx) {
  try {
    if (migration.dryRun) return migration.dryRun(ctx);
    if (migration.plan) return migration.plan(ctx);
    return null;
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * One-click project upgrade: sync tooling, run ordered data migrations, rebuild.
 *
 * @param {object} options
 * @param {string} options.projectRoot   Absolute path of the user project
 * @param {string} options.templateDir   Package template directory (tooling source)
 * @param {string} options.toolVersion   Version to stamp into .project.json
 * @param {boolean} [options.dryRun]     Plan only; guarantees zero side effects
 * @param {Function} [options.rebuild]   Callback that recompiles the manifest
 * @param {Function} [options.log]
 */
function upgradeProject({
  projectRoot,
  templateDir,
  toolVersion,
  dryRun = false,
  rebuild = null,
  log = () => {},
}) {
  const from = detectSchema(projectRoot);
  if (from > TARGET_SCHEMA) {
    throw new Error(
      `Project schema ${from} is newer than this tool supports (${TARGET_SCHEMA}). ` +
      'Update memoir-agent to a matching version before upgrading.'
    );
  }
  const pending = pendingMigrations(from);
  const ctx = { projectRoot, log };

  if (dryRun) {
    const plan = pending.map(migration => ({
      id: migration.id,
      describe: migration.describe,
      preview: previewMigration(migration, ctx),
    }));
    return { dryRun: true, projectRoot, from, to: TARGET_SCHEMA, plan, applied: [] };
  }

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  // Tooling first: migrations may rely on the freshly synced project scripts.
  syncTooling(templateDir, projectRoot, { log });

  const applied = [];
  for (const migration of pending) {
    log(`Applying ${migration.id}: ${migration.describe}`);
    migration.run(ctx);
    applied.push(migration.id);
  }

  if (rebuild) {
    rebuild();
  }

  writeProjectMeta(projectRoot, {
    project_schema: TARGET_SCHEMA,
    tool_version: toolVersion,
    last_upgraded_at: new Date().toISOString(),
  });

  return { dryRun: false, projectRoot, from, to: TARGET_SCHEMA, plan: [], applied };
}

module.exports = {
  TARGET_SCHEMA,
  PROJECT_META_REL,
  readProjectMeta,
  writeProjectMeta,
  detectSchema,
  pendingMigrations,
  upgradeProject,
};
