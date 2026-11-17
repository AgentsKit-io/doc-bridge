#!/usr/bin/env node
// Pre-push hook (mandatory, versioned via husky): lint (oxlint) and format check (Biome) of the changed files, and the
// typecheck (tsc, TS 7 native). The same tools as the CI's lint job.
// Budget: 10 s. Base = upstream of the current branch, else origin/<baseBranch>.
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync('ci-standard/affected.config.json', 'utf8'));
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
let base;
try {
  base = git('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}');
} catch {
  base = `origin/${config.baseBranch}`;
}
let files = [];
try {
  const mergeBase = git('merge-base', base, 'HEAD');
  files = git('diff', '--name-only', '--diff-filter=ACMR', mergeBase, 'HEAD').split('\n').filter(Boolean);
} catch {
  console.error(`pre-push: base ${base} not found; checking the whole project`);
}
const lintable = files.filter((f) => /\.(m?[jt]sx?|json|jsonc)$/.test(f));
const started = Date.now();
const run = (label, cmd, args) => {
  const t = Date.now();
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  console.log(`pre-push: ${label} ${((Date.now() - t) / 1000).toFixed(1)}s`);
  if (r.status !== 0) {
    console.error(`pre-push: ${label} failed, push aborted`);
    process.exit(1);
  }
};
if (files.length === 0 && base) console.log('pre-push: no changed files');
else {
  const code = lintable.filter((f) => /\.m?[jt]sx?$/.test(f));
  if (code.length || files.length === 0) run('oxlint', 'npx', ['oxlint', ...(code.length ? code : [])]);
  run('biome format', 'npx', ['biome', 'format', '--no-errors-on-unmatched', ...(lintable.length ? lintable : ['.'])]);
  if (files.some((f) => /\.(m?[jt]sx?)$/.test(f)) || files.length === 0)
    run('tsc (TS 7) typecheck', 'npx', ['tsc', '--noEmit']);
}
const total = (Date.now() - started) / 1000;
console.log(`pre-push: total ${total.toFixed(1)}s${total > 10 ? ' (over the 10 s budget!)' : ''}`);
