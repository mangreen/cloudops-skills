// Builds a throw-away, minimal-but-valid repository on disk so each test can
// break exactly one rule. Real filesystem on purpose: the validator is I/O code.
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const VERSION = '1.2.3';

export const skillMd = (name, { description = `Use when testing ${name}.`, body = '' } = {}) =>
  `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${body}\n`;

export async function write(root, rel, content) {
  const file = path.join(root, rel);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content);
}

export async function createRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cloudops-fixture-'));
  const manifest = JSON.stringify({ name: 'demo', version: VERSION });
  await write(root, '.claude-plugin/plugin.json', manifest);
  await write(root, '.claude-plugin/marketplace.json', JSON.stringify({ name: 'demo', plugins: [] }));
  await write(root, '.codex-plugin/plugin.json', JSON.stringify({ name: 'demo', version: VERSION, skills: './skills/' }));
  await write(root, '.agents/plugins/marketplace.json', JSON.stringify({ name: 'demo', plugins: [] }));
  await write(root, 'skills/cloudops-alpha/SKILL.md', skillMd('cloudops-alpha', { body: 'See `cloudops-beta`.' }));
  await write(root, 'skills/cloudops-beta/SKILL.md', skillMd('cloudops-beta', { body: 'See `cloudops-alpha`.' }));
  return root;
}

export const cleanup = (root) => rm(root, { recursive: true, force: true });
