// Core of the repository validator. Pure of process/console side effects so it can
// be unit-tested against throw-away fixture repositories (see tests/).
//
// Rules enforced:
//   - skills/<dir>/SKILL.md exists, frontmatter `name` equals <dir>, `description` is 1..1024 chars
//   - skill names are lowercase kebab-case, <= 64 chars
//   - every `cloudops-*` mention under skills/ resolves to a real skill directory
//   - every `references/<file>.md` mention resolves relative to its skill (or `<skill>/references/..`)
//   - plugin manifests parse and agree on name/version
//   - no upstream branding in installable content (skills/ and manifests)

import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

export const MANIFESTS = [
  '.claude-plugin/plugin.json',
  '.claude-plugin/marketplace.json',
  '.codex-plugin/plugin.json',
  '.agents/plugins/marketplace.json',
];

const MAX_DESCRIPTION = 1024;
const MAX_NAME = 64;
// NOTE: scoped to installable content on purpose. Docs and scripts may credit the upstream project.
const FORBIDDEN_BRANDING = /zeabur/i;

const exists = (p) => stat(p).then(() => true, () => false);

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const kv = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) fields[kv[1]] = kv[2];
  }
  return fields;
}

async function checkSkills(root, skillNames, fail) {
  const skillsDir = path.join(root, 'skills');
  for (const name of skillNames) {
    const file = path.join(skillsDir, name, 'SKILL.md');
    if (!(await exists(file))) { fail(`${name}: missing SKILL.md`); continue; }
    const fm = parseFrontmatter(await readFile(file, 'utf8'));
    if (!fm) { fail(`${name}: missing or malformed frontmatter`); continue; }
    if (fm.name !== name) fail(`${name}: frontmatter name "${fm.name}" does not match directory`);
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > MAX_NAME) fail(`${name}: invalid skill name`);
    if (!fm.description) fail(`${name}: missing description`);
    else if (fm.description.length > MAX_DESCRIPTION) {
      fail(`${name}: description is ${fm.description.length} chars (max ${MAX_DESCRIPTION})`);
    }
  }
}

async function checkCrossReferences(root, skillNames, fail) {
  const skillsDir = path.join(root, 'skills');
  const files = (await walk(skillsDir)).filter((f) => f.endsWith('.md'));
  for (const file of files) {
    const rel = path.relative(root, file);
    const text = await readFile(file, 'utf8');
    const ownSkillDir = path.join(skillsDir, path.relative(skillsDir, file).split(path.sep)[0]);

    for (const m of text.matchAll(/\bcloudops-[a-z][a-z-]*[a-z]\b/g)) {
      if (!skillNames.includes(m[0])) fail(`${rel}: reference to unknown skill "${m[0]}"`);
    }
    for (const m of text.matchAll(/(?:cloudops-[a-z-]+\/)?references\/[A-Za-z0-9._-]+\.md/g)) {
      const target = m[0].startsWith('cloudops-') ? path.join(skillsDir, m[0]) : path.join(ownSkillDir, m[0]);
      if (!(await exists(target))) fail(`${rel}: referenced file "${m[0]}" does not exist`);
    }
  }
}

async function checkManifests(root, fail) {
  const parsed = {};
  for (const m of MANIFESTS) {
    try { parsed[m] = JSON.parse(await readFile(path.join(root, m), 'utf8')); }
    catch (e) { fail(`${m}: ${e.message}`); }
  }
  const claude = parsed['.claude-plugin/plugin.json'];
  const codex = parsed['.codex-plugin/plugin.json'];
  if (claude && codex) {
    if (claude.version !== codex.version) fail(`plugin versions differ: claude ${claude.version} vs codex ${codex.version}`);
    if (claude.name !== codex.name) fail(`plugin names differ: ${claude.name} vs ${codex.name}`);
  }
  return claude?.version;
}

async function checkBranding(root, fail) {
  const targets = [...MANIFESTS.map((m) => path.join(root, m))];
  const skillsDir = path.join(root, 'skills');
  if (await exists(skillsDir)) targets.push(...(await walk(skillsDir)));
  for (const file of targets) {
    if (!(await exists(file))) continue;
    if (FORBIDDEN_BRANDING.test(await readFile(file, 'utf8'))) {
      fail(`${path.relative(root, file)}: contains upstream branding`);
    }
  }
}

/** @returns {Promise<{problems: string[], skillCount: number, version: string | undefined}>} */
export async function validateRepo(root) {
  const problems = [];
  const fail = (msg) => problems.push(msg);

  const skillsDir = path.join(root, 'skills');
  const hasSkills = await exists(skillsDir);
  const skillNames = hasSkills
    ? (await readdir(skillsDir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()
    : [];

  if (hasSkills) {
    await checkSkills(root, skillNames, fail);
    await checkCrossReferences(root, skillNames, fail);
  } else {
    fail('skills/: directory not found');
  }
  const version = await checkManifests(root, fail);
  await checkBranding(root, fail);

  return { problems, skillCount: skillNames.length, version };
}
