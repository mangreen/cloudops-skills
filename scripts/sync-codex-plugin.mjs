#!/usr/bin/env node
// CLI wrapper around scripts/lib/sync-codex-plugin.mjs.
//
//   node scripts/sync-codex-plugin.mjs
//
// CI verifies the committed plugins/cloudops/ matches this output.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncCodexPlugin } from './lib/sync-codex-plugin.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
await syncCodexPlugin(root);
console.log('Synced plugins/cloudops/ from root skills/ and .codex-plugin/plugin.json');
