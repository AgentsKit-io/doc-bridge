#!/usr/bin/env node
// Cache policy guard (docs/ci-standard.md, "Política de cache"): no pull_request run may WRITE the Actions cache.
// Fails (exit 1, file:line) when a workflow or composite action has:
//   - `cache:` (or `cache-dependency-path:`) on actions/setup-node in a job not restricted to the base branch (same
//     rule as below): it saves a cache per PR ref;
//   - oven-sh/setup-bun without `no-cache: true`: it caches its own binary, one entry per PR ref (48 MB each);
//   - `actions/cache@` (restore + save on job end) or `actions/cache/save@` in a job not restricted to the base
//     branch (job `if:` with `github.event_name != 'pull_request'` or a `github.ref` / `github.ref_name ==` check).
//     In a composite action both are always violations: the action cannot know the branch.
// Restoring (`actions/cache/restore@`) is always allowed. A workflow whose `on:` has neither pull_request nor
// workflow_call is skipped: no PR runs it. So is a local composite action that only such workflows use (e.g. a release
// setup that runs on tags), when the workflows are scanned too. Line-based scan: no YAML dependency.
// Files listed under "cache-guard" in ci-standard/guard-baseline.json (the adoption baseline, guard-baseline.mjs) are
// tolerated and only shrink; `--write-baseline` regenerates the list.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyBaseline, loadBaseline, writeBaseline } from './guard-baseline.mjs';

const indentOf = (line) => line.length - line.trimStart().length;
const BASE_ONLY = /github\.event_name\s*!=\s*['"]pull_request['"]|github\.ref(_name)?\s*==/;
const ON = /^(?:on|"on"|'on'):(.*)\n((?:[ \t]+.*\n?|[ \t]*\n)*)/m;
const COMPOSITE = /^\s*using:\s*['"]?composite/m;
// A pull_request can run it: its `on:` has pull_request, or workflow_call (a PR workflow may call it), or no `on:` at all.
const prReachable = (text) => {
  const on = ON.exec(text);
  return !on || /pull_request|workflow_call/.test(on[1] + on[2]);
};

/** @returns {{ line: number, message: string }[]} */
export function checkText(text) {
  const lines = text.split('\n');
  const composite = COMPOSITE.test(text);
  // A workflow that no pull_request reaches (deploys on push, manual runs, schedules) never writes a PR cache.
  // A reusable one (workflow_call) can be called by a PR workflow, so it stays checked; so does a composite action.
  if (!composite && !prReachable(text)) return [];
  const out = [];
  let inJobs = false;
  let jobIf = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^jobs:\s*$/.test(line)) inJobs = true;
    else if (/^\S/.test(line)) inJobs = false;
    if (inJobs && /^ {2}[^\s#][^:]*:\s*$/.test(line)) jobIf = '';
    const jobIfMatch = inJobs && /^ {4}if:\s*(.*)$/.exec(line);
    if (jobIfMatch) jobIf = jobIfMatch[1];

    const uses = /^\s*(?:-\s+)?uses:\s*['"]?([^'"\s#]+)/.exec(line);
    if (!uses) continue;
    const action = uses[1];
    // The step block: from the `- ` line that opens the step to the next line at or above its indent.
    let start = i;
    while (start > 0 && !/^\s*-\s/.test(lines[start])) start--;
    const stepIndent = indentOf(lines[start]);
    let end = i + 1;
    while (end < lines.length && (lines[end].trim() === '' || indentOf(lines[end]) > stepIndent)) end++;
    const block = lines.slice(start, end);

    if (action.startsWith('actions/setup-node@')) {
      const k = block.findIndex((l) => /(^|[\s{,])cache(-dependency-path)?\s*:/.test(l.replace(/#.*$/, '')));
      // Its post step saves like actions/cache: allowed in a base-branch-only job (e.g. a deploy on push to main).
      if (k !== -1 && (composite || !BASE_ONLY.test(jobIf)))
        out.push({
          line: start + k + 1,
          message:
            'setup-node with `cache:` saves a cache on every PR; use actions/cache/restore (seeded by the base branch)',
        });
    }
    if (
      action.startsWith('oven-sh/setup-bun@') &&
      !block.some((l) => /^\s*no-cache:\s*['"]?true['"]?\s*(#.*)?$/.test(l))
    )
      out.push({
        line: i + 1,
        message:
          'setup-bun caches its binary on every PR ref; set `no-cache: true` (the dependency cache is seeded by the base branch)',
      });
    const saves = action.startsWith('actions/cache@') || action.startsWith('actions/cache/save@');
    if (saves && (composite || !BASE_ONLY.test(jobIf)))
      out.push({
        line: i + 1,
        message: composite
          ? `${action} in a composite action: only the base branch may save (ci-standard seed-cache)`
          : `${action} in a job that also runs on PRs: save only in a base-branch job (if: github.event_name != 'pull_request' && github.ref_name == <base>)`,
      });
  }
  return out;
}

function yamlFiles(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return yamlFiles(path);
    return /\.ya?ml$/.test(name) ? [path] : [];
  });
}

/** @returns {{ file: string, line: number, message: string }[]} */
export function checkDirs(dirs) {
  const files = dirs.flatMap((dir) => yamlFiles(dir)).map((file) => ({ file, text: readFileSync(file, 'utf8') }));
  const workflows = files.filter(({ text }) => !COMPOSITE.test(text) && ON.test(text));
  const composites = files.filter(({ text }) => COMPOSITE.test(text));
  // Local `uses: ./<path>/<name>` of a file, by name (the workflow's file name, the action's directory name).
  const localUses = (text) => [...text.matchAll(/uses:\s*['"]?\.\/([^'"\s#@]+)/g)].map((m) => basename(m[1]));
  // Workflows a PR can run: pull_request ones, and the reusable ones (workflow_call) that one of those calls or that no
  // workflow here calls (callers unknown). A reusable one called only by tag/manual workflows (a release gate) is not.
  const called = new Set(workflows.flatMap(({ text }) => localUses(text)));
  const onOf = (text) => {
    const on = ON.exec(text);
    return on ? on[1] + on[2] : '';
  };
  const reachable = new Set(
    workflows
      .filter(
        ({ file, text }) =>
          /pull_request/.test(onOf(text)) || (/workflow_call/.test(onOf(text)) && !called.has(basename(file))),
      )
      .map(({ file }) => basename(file)),
  );
  // Local actions those workflows use, and the actions those actions use (to a fixpoint).
  const reached = new Set();
  const add = (text) => {
    let grew = false;
    for (const name of localUses(text)) {
      if (reachable.has(name) || reached.has(name)) continue;
      if (workflows.some(({ file }) => basename(file) === name)) reachable.add(name);
      else reached.add(name);
      grew = true;
    }
    return grew;
  };
  for (let grew = true; grew; ) {
    grew = false;
    for (const { file, text } of workflows) if (reachable.has(basename(file)) && add(text)) grew = true;
    for (const { file, text } of composites) if (reached.has(basename(dirname(file))) && add(text)) grew = true;
  }
  return files.flatMap(({ file, text }) => {
    // A composite action that only workflows no PR reaches use (a release-only setup on tags) never writes a PR cache,
    // like those workflows. Known only when the workflows are scanned too; without them every action is checked.
    if (workflows.length && COMPOSITE.test(text) && !reached.has(basename(dirname(file)))) return [];
    return checkText(text).map((v) => ({ file, ...v }));
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const dirs = args.filter((a) => !a.startsWith('--'));
  const all = checkDirs(dirs.length ? dirs : ['.github/workflows', '.github/actions']);
  if (args.includes('--write-baseline')) {
    console.log(`cache-guard: ${writeBaseline('cache-guard', all)} file(s) written to ci-standard/guard-baseline.json`);
    process.exit(0);
  }
  const { fresh: violations, stale } = applyBaseline(all, loadBaseline('cache-guard'));
  for (const f of stale)
    console.warn(`cache-guard: ${f} no longer violates; remove it from ci-standard/guard-baseline.json`);
  for (const v of violations) console.error(`${v.file}:${v.line}: ${v.message}`);
  if (violations.length) {
    console.error(`cache-guard: ${violations.length} violation(s) of the cache policy (docs/ci-standard.md)`);
    process.exit(1);
  }
  console.log('cache-guard: no workflow writes the Actions cache outside the base branch (baseline files aside)');
}
