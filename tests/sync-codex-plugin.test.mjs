import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { syncCodexPlugin } from '../scripts/lib/sync-codex-plugin.mjs';
import { createRepo, cleanup, write } from './helpers/fixture.mjs';

let root;
beforeEach(async () => { root = await createRepo(); });
afterEach(async () => { await cleanup(root); });

async function treeHash(dir) {
  const h = createHash('sha256');
  async function walk(d) {
    for (const e of (await readdir(d, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) await walk(p);
      else h.update(path.relative(dir, p)).update(await readFile(p));
    }
  }
  await walk(dir);
  return h.digest('hex');
}

const exists = (p) => stat(p).then(() => true, () => false);

test('should_mirror_every_skill_file_when_synced', async () => {
  await write(root, 'skills/cloudops-alpha/references/aws.md', '# aws');
  await syncCodexPlugin(root);
  const out = path.join(root, 'plugins/cloudops/skills');
  assert.equal(await readFile(path.join(out, 'cloudops-beta/SKILL.md'), 'utf8'),
               await readFile(path.join(root, 'skills/cloudops-beta/SKILL.md'), 'utf8'));
  assert.equal(await readFile(path.join(out, 'cloudops-alpha/references/aws.md'), 'utf8'), '# aws');
});

test('should_write_codex_manifest_with_relative_skills_path_when_synced', async () => {
  await write(root, '.codex-plugin/plugin.json', JSON.stringify({ name: 'demo', version: '1.2.3', skills: '../wrong/' }));
  await syncCodexPlugin(root);
  const manifest = JSON.parse(await readFile(path.join(root, 'plugins/cloudops/.codex-plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.version, '1.2.3');
});

test('should_produce_identical_output_when_run_twice', async () => {
  await syncCodexPlugin(root);
  const first = await treeHash(path.join(root, 'plugins/cloudops'));
  await syncCodexPlugin(root);
  const second = await treeHash(path.join(root, 'plugins/cloudops'));
  assert.equal(second, first);
});

test('should_remove_stale_mirror_files_when_a_source_skill_is_deleted', async () => {
  await syncCodexPlugin(root);
  const { rm } = await import('node:fs/promises');
  await rm(path.join(root, 'skills/cloudops-beta'), { recursive: true });
  await syncCodexPlugin(root);
  assert.equal(await exists(path.join(root, 'plugins/cloudops/skills/cloudops-beta')), false);
  assert.equal(await exists(path.join(root, 'plugins/cloudops/skills/cloudops-alpha')), true);
});

test('should_reject_when_codex_manifest_is_missing', async () => {
  const { rm } = await import('node:fs/promises');
  await rm(path.join(root, '.codex-plugin/plugin.json'));
  await assert.rejects(() => syncCodexPlugin(root), /plugin\.json/);
});
