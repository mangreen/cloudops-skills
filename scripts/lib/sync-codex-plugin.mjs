// Generates plugins/cloudops/ (the Codex plugin) from the canonical root skills/.
//
// Why this exists: Codex's plugin marketplace requires the plugin to live in a
// SUBDIRECTORY with its skills physically inside it — it cannot point at the repo
// root, and it does not follow symlinks or "../" paths when copying to its cache.
// The root skills/ must stay put because Claude's plugin is the repo root.
// So plugins/cloudops/ is a GENERATED mirror — edit skills in root only.
//
// Adapted from https://github.com/zeabur/agent-skills (MIT).

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function syncCodexPlugin(root) {
  const out = path.join(root, 'plugins', 'cloudops');

  // NOTE: read the manifest first so a missing file fails before we delete the old mirror.
  const manifest = JSON.parse(await readFile(path.join(root, '.codex-plugin', 'plugin.json'), 'utf8'));
  manifest.skills = './skills/';

  await rm(out, { recursive: true, force: true });
  await mkdir(path.join(out, '.codex-plugin'), { recursive: true });
  await cp(path.join(root, 'skills'), path.join(out, 'skills'), { recursive: true });
  await writeFile(path.join(out, '.codex-plugin', 'plugin.json'), JSON.stringify(manifest, null, 2) + '\n');
  return out;
}
