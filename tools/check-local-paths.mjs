#!/usr/bin/env node
/**
 * check-local-paths.mjs
 *
 * Scans tracked source files for hardcoded absolute filesystem paths.
 * Catches patterns like C:\\Users\\... or /home/<user>/... that indicate // check-local-paths-ok
 * a developer's local environment has been baked into committed code.
 *
 * Usage:
 *   node tools/check-local-paths.mjs            # scan default dirs
 *   node tools/check-local-paths.mjs scripts/   # scan specific dir
 *
 * Exits 1 if violations are found.
 * Node built-ins only.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'fs';
import { join, extname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// ── Scan targets ──────────────────────────────────────────────────────────────

// Directories to scan (relative to repo root). Pass CLI arg to override.
const SCAN_DIRS = process.argv[2]
  ? [process.argv[2]]
  : ['scripts', 'tools', 'templates', 'styles'];

// File extensions to inspect.
const EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.py', '.ps1', '.sh', '.hbs', '.json', '.md']);

// ── Path patterns ─────────────────────────────────────────────────────────────

const PATTERNS = [
  // Windows: drive-letter colon backslash then at least one path component.
  // Requires actual backslash-separated path, not a regex literal like /[A-Z]:\/.
  { re: /[A-Za-z]:\\(?:Users|home|\w+)\\\w/, label: 'Windows absolute path' }, // check-local-paths-ok
  // Unix home dirs — must have a non-empty username segment.
  { re: /\/home\/[^/\s'"]{2,}\//,             label: 'Unix home path' },        // check-local-paths-ok
  { re: /\/Users\/[^/\s'"]{2,}\//,            label: 'macOS home path' },       // check-local-paths-ok
  { re: /\/root\/\w/,                          label: 'Root home path' },        // check-local-paths-ok
];

// ── Allowlist ─────────────────────────────────────────────────────────────────

// Lines containing this suppression token are skipped.
const SUPPRESS_TOKEN = 'check-local-paths-ok';

// Files exempt from scanning entirely (relative to repo root).
// Use sparingly — prefer inline suppression tokens on specific lines.
const EXEMPT_FILES = new Set([
  // nothing exempt by default
]);

// ── Scanner ───────────────────────────────────────────────────────────────────

function collectFiles(dir, exts) {
  const results = [];
  if (!existsSync(dir)) return results;

  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry === '.git' || entry === 'dist') continue;
      results.push(...collectFiles(full, exts));
    } else if (exts.has(extname(entry))) {
      results.push(full);
    }
  }
  return results;
}

const violations = [];

for (const dir of SCAN_DIRS) {
  const absDir = resolve(REPO_ROOT, dir);
  const files = collectFiles(absDir, EXTENSIONS);

  for (const file of files) {
    const rel = file.slice(REPO_ROOT.length + 1).replace(/\\/g, '/');
    if (EXEMPT_FILES.has(rel)) continue;

    const lines = readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes(SUPPRESS_TOKEN)) continue;

      for (const { re, label } of PATTERNS) {
        if (re.test(line)) {
          violations.push({ file: rel, line: i + 1, label, content: line.trim().slice(0, 100) });
          break; // one violation per line is enough
        }
      }
    }
  }
}

// ── Report ────────────────────────────────────────────────────────────────────

if (violations.length === 0) {
  console.log('✅ Path hygiene check passed — no hardcoded local paths found.');
  process.exit(0);
} else {
  console.error(`\n Path hygiene check FAILED — ${violations.length} hardcoded path(s) found:\n`);
  for (const v of violations) {
    console.error(`  [${v.label}]`);
    console.error(`    ${v.file}:${v.line}`);
    console.error(`    > ${v.content}\n`);
  }
  console.error('Fix: use path resolution relative to __file__ / import.meta.url / __dirname.');
  console.error('     To suppress a false positive, append  // check-local-paths-ok  to that line.\n');
  process.exit(1);
}
