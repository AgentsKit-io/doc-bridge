#!/usr/bin/env node
// Guard (lint job of the CI standard): contract/e2e code never uses a fixed port, a host lock or a fixed date.
// Use freePort()/createTestDatabase()/testNow() from ci-standard/scripts/test-env.mjs instead.
// Scans the files matching `contractGlobs` of ci-standard/affected.config.json (default below). Exempt: files under
// a `fixtures/` directory, and a line with `// fixed-ok: <reason>` (e.g. a calendar edge case of a pure function).
//   node ci-standard/scripts/no-fixed-ports.mjs [--root <dir>]   (default: the git-tracked files of the repo)
// Files listed under "no-fixed-ports" in ci-standard/guard-baseline.json (the adoption baseline, guard-baseline.mjs) are
// tolerated and only shrink; `--write-baseline` regenerates the list.
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globToRegExp } from './affected.mjs';
import { applyBaseline, loadBaseline, writeBaseline } from './guard-baseline.mjs';

export const DEFAULT_GLOBS = [
  '**/test/contract/**',
  '**/e2e/**',
  'e2e-kit/**',
  'deploy/portability.ts',
  'ci-standard/scripts/test-env.mjs',
];
export const RULES = [
  { id: 'fixed-port', re: /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}\b/, fix: 'port from freePort()' },
  { id: 'fixed-port', re: /\bPORT=\d+/, fix: 'port from freePort()' },
  { id: 'flock', re: /\bflock\b/, fix: 'a database/port per job instead of a host lock' },
  {
    id: 'fixed-date',
    // Date constructors with a calendar literal, and ISO timestamp literals ('2026-11-16T10:00...') as expectations.
    re: /new Date\(\s*['"`]\d{4}-|Date\.(?:UTC|parse)\(\s*['"`]?\d{4}\b|['"`]\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/,
    fix: 'testNow()/fakeClock() and offsets',
  },
];
const CODE = /\.(?:[cm]?[jt]sx?|sh|ya?ml|json)$/;

/** Violations in one file's text: [{ line, rule, text }]. */
export function scanText(text) {
  const out = [];
  text.split('\n').forEach((line, i) => {
    if (/\/\/\s*fixed-ok:\s*\S/.test(line) || /#\s*fixed-ok:\s*\S/.test(line)) return;
    for (const rule of RULES)
      if (rule.re.test(line)) {
        out.push({ line: i + 1, rule: rule.id, fix: rule.fix, text: line.trim() });
        break;
      }
  });
  return out;
}

export function inScope(file, globs = DEFAULT_GLOBS) {
  if (!CODE.test(file) || /(^|\/)fixtures\//.test(file) || /(^|\/)node_modules\//.test(file)) return false;
  return globs.some((g) => globToRegExp(g).test(file));
}

function walk(root, dir = root) {
  return readdirSync(dir).flatMap((name) => {
    if (name === 'node_modules' || name === '.git') return [];
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(root, path) : [relative(root, path)];
  });
}

/** [{ file, line, rule, fix, text }] over `files` (paths relative to `root`). */
export function scanFiles(files, { root = '.', globs = DEFAULT_GLOBS } = {}) {
  return files
    .filter((f) => inScope(f, globs))
    .flatMap((file) => scanText(readFileSync(join(root, file), 'utf8')).map((v) => ({ file, ...v })));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const root = argv.includes('--root') ? argv[argv.indexOf('--root') + 1] : '.';
  let globs = DEFAULT_GLOBS;
  try {
    globs = JSON.parse(readFileSync(join(root, 'ci-standard/affected.config.json'), 'utf8')).contractGlobs ?? globs;
  } catch {}
  const files =
    root === '.' ? execFileSync('git', ['ls-files'], { encoding: 'utf8' }).split('\n').filter(Boolean) : walk(root);
  const found = scanFiles(files, { root, globs });
  if (argv.includes('--write-baseline')) {
    console.log(
      `no-fixed-ports: ${writeBaseline('no-fixed-ports', found)} file(s) written to ci-standard/guard-baseline.json`,
    );
    process.exit(0);
  }
  const { fresh: violations, stale } = applyBaseline(found, root === '.' ? loadBaseline('no-fixed-ports') : new Set());
  for (const f of stale)
    console.warn(`no-fixed-ports: ${f} no longer violates; remove it from ci-standard/guard-baseline.json`);
  for (const v of violations) console.error(`${v.file}:${v.line}: ${v.rule} (use ${v.fix}): ${v.text}`);
  if (violations.length) {
    console.error(
      `no-fixed-ports: ${violations.length} violation(s). Contract/e2e: port via freePort(), database via ` +
        'createTestDatabase(), date via testNow(); never flock or slots. Pure calendar edge cases: `// fixed-ok: <reason>`.',
    );
    process.exit(1);
  }
  console.log(`no-fixed-ports: ${files.filter((f) => inScope(f, globs)).length} contract/e2e file(s) clean`);
}
