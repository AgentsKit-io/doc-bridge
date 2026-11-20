#!/usr/bin/env node
// CI standard v3 (owner's decision of 10/11: no slow tests on the PR path). Zero dependencies; synced by the manifest
// (copy): never edit it in a product repo.
//
// Lists the slowest tests from test reports or logs, so the job summary shows them and the factory can open tickets:
//   node ci-standard/scripts/slow-tests.mjs <file|dir>...            reports (vitest JSON, JUnit XML) or text logs
//   node ci-standard/scripts/slow-tests.mjs --summary <dir>          CI: top 10 in the job summary + a `slow-tests` notice
//   node ci-standard/scripts/slow-tests.mjs --repo <owner/name>      latest CI runs: their `slow-tests` notices, else logs
//   node ci-standard/scripts/slow-tests.mjs --run "<test command>"   a local timing run (vitest JSON via CI_TEST_REPORT_DIR)
// Options: --top <n> (10), --over <seconds> (only tests above it), --json; with --repo: --runs <n> (3), --workflow
// <file or id> (default ci.yml), --jobs <regex> (the jobs read, default test|verify|spec|e2e).
// Text logs it reads: vitest (`✓ name 1234ms`, `✓ file (3 tests) 2.1s`), node:test spec (`✔ name (12.3ms)`), jest
// (`✓ name (123 ms)`), with or without the GitHub log prefixes (`job\tstep\t`, timestamps).

import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const BUDGET_FAIL_MS = 10_000;
export const BUDGET_WARN_MS = 2_000;

const ms = (value, unit) => (unit === 's' ? Number(value) * 1000 : Number(value));

/** Tests of a vitest (or jest) JSON report. */
export function fromVitestJson(text) {
  const report = JSON.parse(text);
  const out = [];
  for (const file of report.testResults ?? []) {
    for (const t of file.assertionResults ?? []) {
      if (typeof t.duration !== 'number') continue;
      out.push({ file: file.name ?? '', name: t.fullName || t.title || '', ms: t.duration, status: t.status ?? '' });
    }
  }
  return out;
}

const attr = (tag, name) => {
  const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
  return m
    ? m[1]
        .replace(/&quot;/g, '"')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
    : '';
};

/** Tests of a JUnit XML report (`<testcase name classname file time>`, time in seconds). */
export function fromJunit(text) {
  const out = [];
  for (const m of text.matchAll(/<testcase\b[^>]*>/g)) {
    const time = attr(m[0], 'time');
    if (time === '') continue;
    out.push({
      file: attr(m[0], 'file') || attr(m[0], 'classname'),
      name: attr(m[0], 'name'),
      ms: Number(time) * 1000,
      status: '',
    });
  }
  return out;
}

const PASS = '[✓✔√]';
const FAIL = '[×✗✖]';
const LINE = new RegExp(`^\\s*(${PASS}|${FAIL})\\s+(.+?)\\s+\\(?(\\d+(?:\\.\\d+)?)\\s?(ms|s)\\)?\\s*$`);
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g'); // colour codes in a log
const FILE_TOTAL = /^(.+?)\s+\((\d+) tests?(?:\s*\|[^)]*)?\)$/;

const TAP_RESULT = /^\s*(not ok|ok) \d+ - (.+?)(?:\s+#\s*(?:SKIP|TODO)\b.*)?$/;
const TAP_FILE = /\.(?:[cm]?[jt]s|tsx?)$/;

/** Tests (and per-file totals) printed in a text log, including node:test's TAP (`ok 1 - name` + `duration_ms:`). */
export function fromLog(text) {
  const out = [];
  let tap = null; // the last TAP result, until its YAML block gives its duration and type
  const flush = () => {
    if (tap?.ms !== undefined && tap.type !== 'suite') {
      const file = tap.depth === 0 && TAP_FILE.test(tap.name);
      out.push({
        file: file ? tap.name : '',
        name: file ? '' : tap.name,
        ms: tap.ms,
        status: tap.status,
        ...(file ? { kind: 'file' } : {}),
      });
    }
    tap = null;
  };
  for (let raw of text.split(/\r?\n/)) {
    if (raw.includes('\t')) raw = raw.slice(raw.lastIndexOf('\t') + 1); // gh run view --log: job \t step \t line
    raw = raw.replace(/^\uFEFF?\d{4}-\d\d-\d\dT[\d:.]+Z ?/, '').replace(ANSI, '');
    const t = TAP_RESULT.exec(raw);
    if (t) {
      flush();
      if (!/#\s*(SKIP|TODO)\b/.test(raw)) {
        tap = { name: t[2], status: t[1] === 'ok' ? 'passed' : 'failed', depth: raw.length - raw.trimStart().length };
      }
      continue;
    }
    if (tap) {
      const d = /^\s*duration_ms: (\d+(?:\.\d+)?)\s*$/.exec(raw);
      if (d) tap.ms = Number(d[1]);
      else if (/^\s*type: 'suite'/.test(raw)) tap.type = 'suite';
      else if (/^\s*\.\.\.\s*$/.test(raw)) flush();
      continue;
    }
    const m = LINE.exec(raw);
    if (!m) continue;
    if (m[2] === 'built in') continue; // Vite: `✓ built in 16.31s` is a build, not a test
    const status = new RegExp(PASS).test(m[1]) ? 'passed' : 'failed';
    const file = FILE_TOTAL.exec(m[2]);
    if (file) out.push({ file: file[1], name: '', ms: ms(m[3], m[4]), status, kind: 'file' });
    else out.push({ file: '', name: m[2], ms: ms(m[3], m[4]), status });
  }
  flush();
  return out;
}

/** Reads one report or log, by its content. */
export function parse(text) {
  const head = text.trimStart();
  if (head.startsWith('{')) {
    try {
      return fromVitestJson(text);
    } catch {
      // not a JSON report: a log that starts with a brace
    }
  }
  if (head.startsWith('<')) return fromJunit(text);
  return fromLog(text);
}

const filesOf = (path) => {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true })
    .map((f) => join(path, String(f)))
    .filter((f) => statSync(f).isFile());
};

/** Same test seen in several reports or runs: keep the slowest time and count the sightings. */
export function merge(tests) {
  const byKey = new Map();
  for (const t of tests) {
    const key = `${t.kind ?? 'test'}\0${t.file}\0${t.name}`;
    const seen = byKey.get(key);
    if (!seen) byKey.set(key, { ...t, runs: 1 });
    else byKey.set(key, { ...(t.ms > seen.ms ? t : seen), runs: seen.runs + 1 });
  }
  return [...byKey.values()];
}

/** Slowest first; per-test lines when there are any, else the per-file totals. */
export function slowest(tests, { top = 10, overMs = 0 } = {}) {
  const perTest = tests.filter((t) => t.kind !== 'file');
  const pool = perTest.length > 0 ? perTest : tests;
  return merge(pool)
    .filter((t) => t.ms > overMs)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, top);
}

const label = (t) => [t.file, t.name].filter(Boolean).join(' › ') || '(unnamed)';
const seconds = (t) => `${(t.ms / 1000).toFixed(2)}s`;
const flag = (t) => (t.ms > BUDGET_FAIL_MS ? 'over 10 s' : t.ms > BUDGET_WARN_MS ? 'over 2 s' : '');

/** The `slow-tests` notice: one `<seconds>s  <file> › <name>` line per test (the factory reads it back). */
export function notice(list) {
  const body = list.map((t) => `${seconds(t)}  ${label(t)}`).join('\n');
  const escape = (s) => s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::notice title=slow-tests::${escape(body || 'no timed tests in the reports')}`;
}

/** Parses a `slow-tests` notice back into tests. */
export function fromNotice(message) {
  const out = [];
  for (const line of message.split('\n')) {
    const m = /^(\d+(?:\.\d+)?)s\s{2}(.+)$/.exec(line.trim());
    if (!m) continue;
    const [file, ...rest] = m[2].split(' › ');
    out.push({
      file: rest.length ? file : '',
      name: rest.length ? rest.join(' › ') : file,
      ms: Number(m[1]) * 1000,
      status: '',
    });
  }
  return out;
}

export function markdown(list, { top = 10 } = {}) {
  if (list.length === 0) return '### Slowest tests\n\nNo timed tests in the reports.\n';
  const rows = list.map((t, i) => `| ${i + 1} | ${seconds(t)} | ${flag(t)} | \`${label(t).replace(/\|/g, '\\|')}\` |`);
  return [
    `### Slowest tests (top ${top})`,
    '',
    'PR-path budget: warn above 2 s, fail above 10 s per test. A test that needs more moves to the nightly as `*.slow.test.*`.',
    '',
    '| # | Time | Budget | Test |',
    '| --- | --- | --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

const gh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(`gh ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout;
};
// A job log has colour codes: gh >= 2.100 prints them only with --allow-escape-sequences (older gh has no such flag).
const ghLog = (path) => {
  try {
    return gh(['api', '--allow-escape-sequences', path]);
  } catch {
    return gh(['api', path]);
  }
};

/**
 * The API path of a repo's latest completed runs of one workflow (file name or id; default the standard's caller,
 * ci.yml). The repo-wide runs list cannot filter by workflow (`workflow_id` is ignored there), and in a busy repo its
 * last 50 runs can all be other workflows (an agent workflow on every issue comment): no test job, no slow test.
 */
export function runsPath(repo, workflow = '') {
  return `repos/${repo}/actions/workflows/${encodeURIComponent(workflow || 'ci.yml')}/runs?status=completed&per_page=50`;
}

/** The latest completed CI runs of a repo that ran tests: their `slow-tests` notices, else the test jobs' logs. */
export function fromRepo(repo, { runs = 3, workflow = '', jobs: jobPattern = /test|verify|spec|e2e/i } = {}) {
  let list;
  try {
    list = JSON.parse(gh(['api', runsPath(repo, workflow)])).workflow_runs ?? [];
  } catch (error) {
    // No ci.yml (and no --workflow): every workflow's runs, as before.
    if (workflow) throw error;
    list = JSON.parse(gh(['api', `repos/${repo}/actions/runs?status=completed&per_page=50`])).workflow_runs ?? [];
  }
  const tests = [];
  const used = [];
  for (const run of list) {
    if (used.length >= runs) break;
    if (!['pull_request', 'schedule', 'workflow_dispatch', 'push'].includes(run.event)) continue;
    const jobs =
      JSON.parse(gh(['api', `repos/${repo}/actions/runs/${run.id}/jobs?filter=latest&per_page=100`])).jobs ?? [];
    const testJobs = jobs.filter((j) => jobPattern.test(j.name) && j.conclusion !== 'skipped' && j.conclusion !== null);
    if (testJobs.length === 0) continue;
    let found = 0;
    for (const job of testJobs) {
      const notes = JSON.parse(gh(['api', `repos/${repo}/check-runs/${job.id}/annotations?per_page=50`]));
      const slow = notes.filter((n) => n.title === 'slow-tests').flatMap((n) => fromNotice(n.message ?? ''));
      if (slow.length === 0) {
        try {
          const log = fromLog(ghLog(`repos/${repo}/actions/jobs/${job.id}/logs`));
          tests.push(...log.map((t) => ({ ...t, run: run.id })));
          found += log.length;
        } catch {
          // logs expired or not readable: skip the job
        }
      } else {
        tests.push(...slow.map((t) => ({ ...t, run: run.id })));
        found += slow.length;
      }
    }
    if (found > 0) used.push(run.id);
  }
  return { tests, runs: used };
}

/** A local timing run: the command with CI_TEST_REPORT_DIR set (vitest JSON) and its output read as a log. */
export function fromLocalRun(command) {
  const dir = mkdtempSync(join(tmpdir(), 'slow-tests-'));
  try {
    const r = spawnSync(command, {
      shell: true,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      env: { ...process.env, CI_TEST_REPORT_DIR: dir, TEST_SLOW: process.env.TEST_SLOW ?? '1', TEST_BAIL: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const reports = filesOf(dir).flatMap((f) => parse(readFileSync(f, 'utf8')));
    return { tests: reports.length > 0 ? reports : fromLog(`${r.stdout}\n${r.stderr}`), status: r.status };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main(argv) {
  const opts = {
    top: 10,
    overMs: 0,
    json: false,
    summary: false,
    repo: '',
    run: '',
    runs: 3,
    workflow: '',
    jobs: undefined,
    paths: [],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--top') opts.top = Number(argv[++i]);
    else if (a === '--over') opts.overMs = Number(argv[++i]) * 1000;
    else if (a === '--json') opts.json = true;
    else if (a === '--summary') opts.summary = true;
    else if (a === '--repo') opts.repo = argv[++i];
    else if (a === '--run') opts.run = argv[++i];
    else if (a === '--runs') opts.runs = Number(argv[++i]);
    else if (a === '--workflow') opts.workflow = argv[++i];
    else if (a === '--jobs') opts.jobs = new RegExp(argv[++i], 'i');
    else opts.paths.push(a);
  }
  let tests = [];
  let runs = [];
  if (opts.repo) ({ tests, runs } = fromRepo(opts.repo, opts));
  else if (opts.run) ({ tests } = fromLocalRun(opts.run));
  // A structured report (vitest JSON, JUnit) wins over the text log of the same run (the log repeats its slow tests).
  const reports = [];
  const logs = [];
  for (const p of opts.paths) {
    try {
      for (const f of filesOf(p)) {
        const text = readFileSync(f, 'utf8');
        const structured = /^\s*[{<]/.test(text);
        (structured ? reports : logs).push(...parse(text));
      }
    } catch (error) {
      if (!opts.summary) throw error;
      // CI: a job with no report (the tests never started) still gets its summary line.
    }
  }
  // Paths relative to the checkout (vitest reports absolute ones).
  const root = `${(process.env.GITHUB_WORKSPACE || process.cwd()).replace(/\/$/, '')}/`;
  tests.push(
    ...(reports.length > 0 ? reports : logs).map((t) =>
      t.file.startsWith(root) ? { ...t, file: t.file.slice(root.length) } : t,
    ),
  );
  const list = slowest(tests, opts);
  if (opts.summary) {
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, markdown(list, opts));
    console.log(notice(list));
    for (const t of list.filter((x) => x.ms > BUDGET_FAIL_MS))
      console.log(
        `::warning title=slow test::${seconds(t)} ${label(t)} (PR-path budget 10 s: fix it or move it to *.slow.test.*)`,
      );
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify({ runs, tests: list }, null, 2));
    return;
  }
  if (runs.length) console.log(`runs: ${runs.join(', ')}`);
  for (const t of list) console.log(`${seconds(t).padStart(9)}  ${label(t)}${t.runs > 1 ? `  (${t.runs}x)` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main(process.argv.slice(2));
