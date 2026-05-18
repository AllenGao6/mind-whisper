#!/usr/bin/env node
// Single-command version bump for the monorepo.
//
// `npm version` only bumps the package.json in the cwd, which previously caused
// the root and apps/desktop to drift — electron-builder reads from apps/desktop,
// so the published artifacts were named after the wrong version and the upload
// to GitHub Releases failed.
//
// This script bumps every workspace package + root in lockstep, runs
// `pnpm install` to update the lockfile, creates one commit, creates the tag.
// You then push with `git push --follow-tags`.
//
// Usage:  pnpm version:patch   (or :minor / :major / pass an exact version)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

const arg = process.argv[2];
if (!arg) {
  console.error('Usage: bump-version.mjs <patch|minor|major|x.y.z>');
  process.exit(1);
}

// Files to bump in lockstep. Add new workspace packages here as they appear.
const targets = ['package.json', 'apps/desktop/package.json'];

function bumpSemver(current, kind) {
  if (/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(kind)) return kind;        // exact version
  const [maj, min, pat] = current.split('.').map(Number);
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'major') return `${maj + 1}.0.0`;
  throw new Error(`Unknown bump: ${kind}`);
}

// Read current version from the root and verify all targets agree.
function readVer(path) {
  return JSON.parse(readFileSync(join(repoRoot, path), 'utf8')).version;
}
const currentVersions = targets.map((p) => [p, readVer(p)]);
const distinct = new Set(currentVersions.map(([, v]) => v));
if (distinct.size > 1) {
  console.warn('⚠ Version drift detected across workspace files:');
  for (const [p, v] of currentVersions) console.warn(`    ${v}  ${p}`);
  console.warn('  Bumping all of them to the next version above the HIGHEST one.');
}
// Use the highest current version as the base so we always go up.
const base = [...distinct].sort((a, b) => {
  const ax = a.split('.').map(Number), bx = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (ax[i] !== bx[i]) return ax[i] - bx[i];
  return 0;
}).pop();

const next = bumpSemver(base, arg);
console.log(`Bumping ${base} → ${next} across ${targets.length} package.json file(s)…`);

for (const path of targets) {
  const full = join(repoRoot, path);
  const json = JSON.parse(readFileSync(full, 'utf8'));
  json.version = next;
  // Preserve trailing newline if present (matches `npm version` behavior).
  writeFileSync(full, JSON.stringify(json, null, 2) + '\n');
  console.log(`  ✓ ${path}`);
}

console.log('Updating lockfile (pnpm install)…');
execSync('pnpm install --lockfile-only', { cwd: repoRoot, stdio: 'inherit' });

console.log('Staging + committing…');
execSync(`git add ${targets.join(' ')} pnpm-lock.yaml`, { cwd: repoRoot, stdio: 'inherit' });
execSync(`git commit -m "${next}"`, { cwd: repoRoot, stdio: 'inherit' });
execSync(`git tag v${next}`, { cwd: repoRoot, stdio: 'inherit' });

console.log('');
console.log(`✓ Bumped to v${next}, committed, tagged. Push with:`);
console.log('');
console.log('    git push --follow-tags');
console.log('');
