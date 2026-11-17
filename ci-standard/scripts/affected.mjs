#!/usr/bin/env node
// Decides what a PR must run. Fail-closed: a change that no rule explains (a file outside every workspace, not
// global and not ignorable) makes the run FAIL, never pass green. Also fails when the changed-file list or the
// affected tool cannot be computed.
//   node ci-standard/scripts/affected.mjs --base origin/main [--tool paths|turbo|nx] [--files a,b] [--full]
// Output (stdout + $GITHUB_OUTPUT): scope=full|affected|none and packages=<comma list>.
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function globToRegExp(glob) {
  const re = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§')
    .replace(/\*/g, '[^/]*')
    .replace(/§§/g, '.*');
  return new RegExp(`^${re}$`);
}
const matches = (file, globs) => globs.some((g) => globToRegExp(g).test(file));

/** Pure classification of a changed-file list. */
export function classify(files, config) {
  if (files.length === 0) return { scope: 'none', packages: [], unknown: [] };
  const packages = new Set();
  const unknown = [];
  let full = false;
  for (const file of files) {
    if (matches(file, config.global)) full = true;
    else if (matches(file, config.ignore)) continue;
    else {
      const ws = config.workspaces.find((w) => file === w || file.startsWith(`${w}/`));
      if (ws) packages.add(ws);
      else unknown.push(file);
    }
  }
  if (unknown.length) return { scope: 'unknown', packages: [], unknown };
  if (full) return { scope: 'full', packages: [], unknown };
  return { scope: packages.size ? 'affected' : 'none', packages: [...packages], unknown };
}

/** `turbo run build --filter=...[base] --dry=json` -> package names the tool considers affected. */
export function parseTurbo(json) {
  return (JSON.parse(json).packages ?? []).filter((p) => p !== '//');
}
/** `nx show projects --affected --base=<base>` -> one project per line. */
export function parseNx(text) {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Cross-check with the monorepo tool: when the path rules say a workspace changed, the tool must also see something.
 * If it sees nothing, the change is hidden from the tool (cache/filter/config mismatch): fail, do not skip.
 */
export function crossCheck(result, toolPackages) {
  if (result.scope === 'affected' && toolPackages !== undefined && toolPackages.length === 0)
    return {
      ...result,
      scope: 'unknown',
      unknown: [`tool reports nothing affected but paths changed in ${result.packages.join(', ')}`],
    };
  return result;
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' });
}

export function changedFiles(base) {
  const mergeBase = git(['merge-base', base, 'HEAD']).trim();
  return git(['diff', '--name-only', '--no-renames', `${mergeBase}`, 'HEAD'])
    .split('\n')
    .filter(Boolean);
}

function toolPackages(tool, base) {
  if (tool === 'turbo') {
    const out = execFileSync('npx', ['turbo', 'run', 'build', `--filter=...[${base}]`, '--dry=json'], {
      encoding: 'utf8',
    });
    return parseTurbo(out);
  }
  if (tool === 'nx')
    return parseNx(
      execFileSync('npx', ['nx', 'show', 'projects', '--affected', `--base=${base}`], { encoding: 'utf8' }),
    );
  return undefined;
}

function main(argv) {
  const arg = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? fallback : argv[i + 1];
  };
  const config = JSON.parse(readFileSync(arg('config', 'ci-standard/affected.config.json'), 'utf8'));
  const base = arg('base', `origin/${config.baseBranch}`);
  const tool = arg('tool', 'paths');
  let result;
  try {
    if (argv.includes('--full')) result = { scope: 'full', packages: [], unknown: [] };
    else {
      const files = arg('files') !== undefined ? arg('files').split(',').filter(Boolean) : changedFiles(base);
      result = crossCheck(classify(files, config), toolPackages(tool, base));
    }
  } catch (error) {
    console.error(`::error::affected: cannot compute the affected set (${error.message}); failing instead of skipping`);
    process.exit(1);
  }
  if (result.scope === 'unknown') {
    console.error(
      `::error::affected: change not covered by any rule (hidden from the tool): ${result.unknown.join(', ')}`,
    );
    console.error('Add the path to "global" (runs everything) or "ignore" in ci-standard/affected.config.json.');
    process.exit(1);
  }
  const lines = `scope=${result.scope}\npackages=${result.packages.join(',')}\n`;
  console.log(lines.trim());
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
