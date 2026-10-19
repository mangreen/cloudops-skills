#!/usr/bin/env node
// CLI wrapper around scripts/lib/validate-repo.mjs.
//
//   node scripts/validate-skills.mjs [--root <dir>]
//
// Exit code 1 when any problem is found.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepo } from './lib/validate-repo.mjs';

const rootFlag = process.argv.indexOf('--root');
const root = rootFlag > -1
  ? path.resolve(process.argv[rootFlag + 1])
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const { problems, skillCount, version } = await validateRepo(root);

if (problems.length) {
  console.error(`✗ ${problems.length} problem(s):\n` + problems.map((p) => `  - ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${skillCount} skills valid; manifests consistent (v${version}).`);
