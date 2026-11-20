#!/usr/bin/env node
// oxlint adoption baseline (per FILE): `.oxlintrc.json` lists in `ignorePatterns` (between the `baseline:start` and
// `baseline:end` markers) every file that failed oxlint when the CI standard v3 moved the lint from Biome to oxlint. Every
// other file, new ones included, is linted strict. No rule is off or downgraded for them; each maintenance ticket fixes the
// files of one directory and removes them from the list, never adds one by hand.
//   node ci-standard/scripts/oxlint-baseline.mjs            regenerate the list (oxlint over the whole repo, no baseline)
//   node ci-standard/scripts/oxlint-baseline.mjs --check    fail if a listed file passes now (shrink the list) or is gone
// The oxlint version is the CI's (OXLINT_VERSION in .github/workflows/ci-standard.yml), run through npx.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';

const CONFIG = '.oxlintrc.json';
// At the root on purpose: oxlint resolves ignorePatterns relative to the config file.
const TMP = '.oxlintrc.baseline.tmp.json';
const START = '// baseline:start';
const END = '// baseline:end';

const version = () => {
  const m = /OXLINT_VERSION:\s*["']?([\d.]+)/.exec(readFileSync('.github/workflows/ci-standard.yml', 'utf8'));
  if (!m) throw new Error('OXLINT_VERSION not found in .github/workflows/ci-standard.yml');
  return m[1];
};
const lines = () => readFileSync(CONFIG, 'utf8').split('\n');
const region = (all) => {
  const s = all.findIndex((l) => l.trim() === START);
  const e = all.findIndex((l) => l.trim() === END);
  if (s < 0 || e < s) throw new Error(`${CONFIG}: ${START} / ${END} markers not found`);
  return [s, e];
};
// ignorePatterns are globs: a Next.js route segment (`[id]`, `[...slug]`) or a `*`, `?`, `{`, `}` in a path would match
// other files (or none), so the listed path is escaped and read back unescaped.
export const toPattern = (file) => file.replace(/[\\[\]*?{}]/g, '\\$&');
export const fromPattern = (pattern) => pattern.replace(/\\(.)/g, '$1');
export const listed = () => {
  const all = lines();
  const [s, e] = region(all);
  return all
    .slice(s + 1, e)
    .map((l) => l.trim().replace(/,$/, ''))
    .filter((l) => l.startsWith('"'))
    .map((l) => fromPattern(JSON.parse(l)));
};

/** oxlint with an empty baseline: the files with at least one finding. */
export function failingFiles() {
  const all = lines();
  const [s, e] = region(all);
  writeFileSync(TMP, [...all.slice(0, s + 1), ...all.slice(e)].join('\n'));
  try {
    const r = spawnSync('npx', ['--yes', `oxlint@${version()}`, '-c', TMP, '-f', 'json'], {
      encoding: 'utf8',
      maxBuffer: 1 << 30,
    });
    const { diagnostics } = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    return new Set(diagnostics.map((d) => d.filename));
  } finally {
    if (existsSync(TMP)) unlinkSync(TMP);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--check') {
    const failing = failingFiles();
    const stale = listed().filter((f) => !failing.has(f));
    if (stale.length) {
      console.error(`oxlint baseline lists ${stale.length} file(s) that pass now (or are gone); regenerate:`);
      for (const f of stale.slice(0, 20)) console.error(`  ${f}`);
      process.exit(1);
    }
    console.log(`oxlint baseline ok: ${listed().length} file(s) still fail`);
  } else {
    const failing = [...failingFiles()].sort();
    const all = lines();
    const [s, e] = region(all);
    const indent = all[s].slice(0, all[s].indexOf('//'));
    const body = failing.map((f, i) => `${indent}${JSON.stringify(toPattern(f))}${i < failing.length - 1 ? ',' : ''}`);
    const before = all.slice(0, s + 1);
    // The entry before the markers needs its comma once the list is not empty.
    const last = before.findLastIndex((l, i) => i < s && l.trim() !== '' && !l.trim().startsWith('//'));
    if (last >= 0) before[last] = before[last].replace(/,?$/, body.length ? ',' : '');
    writeFileSync(CONFIG, [...before, ...body, ...all.slice(e)].join('\n'));
    console.log(`oxlint baseline: ${failing.length} file(s) written to ${CONFIG}`);
  }
}
