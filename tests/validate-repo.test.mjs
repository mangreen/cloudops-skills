import { test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { validateRepo } from '../scripts/lib/validate-repo.mjs';
import { createRepo, cleanup, write, skillMd } from './helpers/fixture.mjs';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../scripts/validate-skills.mjs');

let root;
beforeEach(async () => { root = await createRepo(); });
afterEach(async () => { await cleanup(root); });

const problemsOf = async () => (await validateRepo(root)).problems;

// ---------- happy path ----------

test('should_report_no_problems_when_repository_is_valid', async () => {
  // Arrange: fixture is valid by construction
  // Act
  const result = await validateRepo(root);
  // Assert
  assert.deepEqual(result.problems, []);
  assert.equal(result.skillCount, 2);
  assert.equal(result.version, '1.2.3');
});

// ---------- repository shape ----------

test('should_report_missing_skills_directory_when_repository_has_no_skills_folder', async () => {
  // Arrange: a repository that has manifests but no skills/ at all
  await rm(path.join(root, 'skills'), { recursive: true });
  // Act: must report, not throw (it used to crash with ENOENT)
  const result = await validateRepo(root);
  // Assert
  assert.ok(result.problems.some((p) => p.includes('skills/') && p.includes('directory not found')), result.problems.join('\n'));
  assert.equal(result.skillCount, 0);
});

// ---------- skill structure ----------

test('should_report_missing_skill_file_when_directory_has_no_SKILL_md', async () => {
  await write(root, 'skills/cloudops-gamma/README.md', 'no skill here');
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('cloudops-gamma') && p.includes('missing SKILL.md')), problems.join('\n'));
});

test('should_report_malformed_frontmatter_when_file_has_no_frontmatter_block', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', '# no frontmatter\n');
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('cloudops-alpha') && p.includes('frontmatter')));
});

test('should_report_name_mismatch_when_frontmatter_name_differs_from_directory', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alphaa'));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('does not match directory')));
});

test('should_report_invalid_name_when_directory_is_not_kebab_case', async () => {
  await write(root, 'skills/Bad_Name/SKILL.md', skillMd('Bad_Name'));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('Bad_Name') && p.includes('invalid skill name')));
});

test('should_report_missing_description_when_description_is_empty', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { description: '' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('missing description')));
});

test('should_accept_description_when_exactly_1024_chars', async () => {
  // Boundary: guards against changing `>` to `>=` in the length check.
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { description: 'x'.repeat(1024) }));
  assert.deepEqual(await problemsOf(), []);
});

test('should_report_description_too_long_when_1025_chars', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { description: 'x'.repeat(1025) }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('1025 chars')));
});

// ---------- cross references ----------

test('should_report_unknown_skill_when_text_mentions_a_skill_that_does_not_exist', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'Use `cloudops-missing`.' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('unknown skill "cloudops-missing"')));
});

test('should_not_report_unknown_skill_when_underscore_identifiers_appear', async () => {
  // `cloudops_agent` is a resource-tag value, not a skill reference.
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'Tag: managed_by=cloudops_agent' }));
  assert.deepEqual(await problemsOf(), []);
});

test('should_report_missing_reference_file_when_local_references_path_does_not_exist', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'See references/nope.md' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('references/nope.md') && p.includes('does not exist')));
});

test('should_accept_local_reference_when_file_exists', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'See references/aws.md' }));
  await write(root, 'skills/cloudops-alpha/references/aws.md', '# aws');
  assert.deepEqual(await problemsOf(), []);
});

test('should_resolve_cross_skill_reference_path_when_prefixed_with_skill_name', async () => {
  await write(root, 'skills/cloudops-beta/SKILL.md', skillMd('cloudops-beta', { body: 'See cloudops-alpha/references/aws.md' }));
  await write(root, 'skills/cloudops-alpha/references/aws.md', '# aws');
  assert.deepEqual(await problemsOf(), []);
});

test('should_report_missing_cross_skill_reference_when_target_file_absent', async () => {
  await write(root, 'skills/cloudops-beta/SKILL.md', skillMd('cloudops-beta', { body: 'See cloudops-alpha/references/gone.md' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('cloudops-alpha/references/gone.md')));
});

// ---------- manifests ----------

test('should_report_version_mismatch_when_claude_and_codex_versions_differ', async () => {
  await write(root, '.codex-plugin/plugin.json', JSON.stringify({ name: 'demo', version: '9.9.9' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('versions differ') && p.includes('1.2.3') && p.includes('9.9.9')));
});

test('should_report_name_mismatch_when_claude_and_codex_names_differ', async () => {
  await write(root, '.codex-plugin/plugin.json', JSON.stringify({ name: 'other', version: '1.2.3' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('names differ')));
});

test('should_report_json_error_when_manifest_is_malformed', async () => {
  await write(root, '.claude-plugin/marketplace.json', '{ not json');
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.startsWith('.claude-plugin/marketplace.json')));
});

test('should_report_missing_manifest_when_file_is_absent', async () => {
  await rm(path.join(root, '.agents/plugins/marketplace.json'));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.startsWith('.agents/plugins/marketplace.json') && p.includes('ENOENT')));
});

// ---------- upstream branding (scope: installable content only) ----------

test('should_report_branding_when_forbidden_term_appears_in_a_skill', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'run npx zeabur deploy' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('upstream branding') && p.includes('skills/cloudops-alpha/SKILL.md')));
});

test('should_report_branding_when_forbidden_term_appears_in_a_reference_file', async () => {
  await write(root, 'skills/cloudops-alpha/references/aws.md', 'zeabur');
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('upstream branding')));
});

test('should_report_branding_when_forbidden_term_appears_in_a_manifest', async () => {
  await write(root, '.claude-plugin/marketplace.json', JSON.stringify({ name: 'demo', plugins: [], note: 'Zeabur' }));
  const problems = await problemsOf();
  assert.ok(problems.some((p) => p.includes('upstream branding') && p.includes('.claude-plugin/marketplace.json')));
});

test('should_allow_branding_when_mention_is_in_docs_or_attribution_files', async () => {
  // Attribution in README / NOTICE / docs is legitimate and must not fail the build.
  await write(root, 'README.md', 'Adapted from zeabur/agent-skills.');
  await write(root, 'NOTICE.md', 'Derived from Zeabur.');
  await write(root, 'docs/adr/ADR-0001.md', 'Baseline: Zeabur plugin.');
  assert.deepEqual(await problemsOf(), []);
});

test('should_ignore_generated_mirror_when_scanning_for_branding', async () => {
  await write(root, 'plugins/cloudops/skills/x/SKILL.md', 'zeabur');
  assert.deepEqual(await problemsOf(), []);
});

// ---------- CLI contract ----------

test('should_exit_0_and_print_summary_when_repository_is_valid', () => {
  const r = spawnSync('node', [CLI, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /2 skills valid/);
});

test('should_exit_1_and_list_problems_when_repository_is_invalid', async () => {
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'Use `cloudops-missing`.' }));
  const r = spawnSync('node', [CLI, '--root', root], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /unknown skill "cloudops-missing"/);
});
