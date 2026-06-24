#!/usr/bin/env node
/**
 * install-hooks.mjs
 *
 * Copies hooks from tools/hooks/ into .git/hooks/ and makes them executable.
 * Run once after cloning: node tools/install-hooks.mjs
 *
 * Node built-ins only. Works on Windows (Git Bash) and Unix.
 */

import { copyFileSync, chmodSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT   = resolve(__dirname, '..');
const HOOKS_SRC   = join(__dirname, 'hooks');
const HOOKS_DEST  = join(REPO_ROOT, '.git', 'hooks');

if (!existsSync(HOOKS_SRC)) {
  console.error('No tools/hooks/ directory found.');
  process.exit(1);
}

if (!existsSync(HOOKS_DEST)) {
  mkdirSync(HOOKS_DEST, { recursive: true });
}

let installed = 0;
for (const hook of readdirSync(HOOKS_SRC)) {
  const src  = join(HOOKS_SRC, hook);
  const dest = join(HOOKS_DEST, hook);
  copyFileSync(src, dest);
  try { chmodSync(dest, 0o755); } catch { /* Windows — Git Bash handles exec bit via .gitconfig */ }
  console.log(`  installed: .git/hooks/${hook}`);
  installed++;
}

console.log(`\n✅ ${installed} hook(s) installed.`);
