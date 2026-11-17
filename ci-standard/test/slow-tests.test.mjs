import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  fromJunit,
  fromLog,
  fromNotice,
  fromVitestJson,
  markdown,
  notice,
  parse,
  runsPath,
  slowest,
} from '../scripts/slow-tests.mjs';
import { PR_TEST_TIMEOUT_MS, SLOW_TEST_GLOB, testProfile, vitestBudget } from '../scripts/test-budget.mjs';

const vitestReport = JSON.stringify({
  testResults: [
    {
      name: '/repo/apps/api/test/unit/a.test.ts',
      assertionResults: [
        { fullName: 'a boots', duration: 12_400, status: 'passed' },
        { fullName: 'a is quick', duration: 3, status: 'passed' },
        { fullName: 'a skipped', status: 'skipped' },
      ],
    },
    {
      name: '/repo/packages/b/test/b.test.ts',
      assertionResults: [{ fullName: 'b renders', duration: 2_500, status: 'failed' }],
    },
  ],
});

test('vitest JSON: every timed test, with its file', () => {
  const tests = fromVitestJson(vitestReport);
  assert.equal(tests.length, 3);
  assert.deepEqual(tests[0], {
    file: '/repo/apps/api/test/unit/a.test.ts',
    name: 'a boots',
    ms: 12_400,
    status: 'passed',
  });
});

test('JUnit XML: time is in seconds, entities decoded', () => {
  const xml =
    '<testsuites><testsuite><testcase classname="test/x.test.mjs" name="x &amp; y" time="11.5"/><testcase name="z" time="0.01"></testcase></testsuite></testsuites>';
  assert.deepEqual(fromJunit(xml), [
    { file: 'test/x.test.mjs', name: 'x & y', ms: 11_500, status: '' },
    { file: '', name: 'z', ms: 10, status: '' },
  ]);
  assert.equal(parse(xml).length, 2);
});

test('logs: vitest, node:test and jest lines, through the GitHub log prefixes', () => {
  const log = [
    'test\tTests of what changed\t2026-11-10T20:01:02.1234567Z  ✓ apps/api/test/unit/a.test.ts (12 tests) 13450ms',
    'test\tTests of what changed\t2026-11-10T20:01:02.1234567Z    ✓ a boots  12400ms',
    '2026-11-10T20:01:03.0000000Z ✔ numbered point cover (120034.5ms)',
    '\u001b[32m  ✓ jest thing (2300 ms)\u001b[39m',
    '  × broken one 10.2s',
    'unrelated line 123ms',
  ].join('\n');
  const tests = fromLog(log);
  assert.deepEqual(
    tests.map((t) => [t.kind ?? 'test', t.file || t.name, t.ms, t.status]),
    [
      ['file', 'apps/api/test/unit/a.test.ts', 13_450, 'passed'],
      ['test', 'a boots', 12_400, 'passed'],
      ['test', 'numbered point cover', 120_034.5, 'passed'],
      ['test', 'jest thing', 2_300, 'passed'],
      ['test', 'broken one', 10_200, 'failed'],
    ],
  );
});

test('logs: node:test TAP (not a TTY): duration_ms of each test, suites and skips left out, a file is a file', () => {
  const log = [
    '2026-11-10T18:16:37.3084465Z # Subtest: C-09: frozen source',
    '2026-11-10T18:16:37.3085522Z ok 1 - C-09: frozen source',
    '  ---',
    '  duration_ms: 13479.665649',
    "  type: 'test'",
    '  ...',
    '    ok 1 - inner quick one',
    '      ---',
    '      duration_ms: 3.5',
    '      ...',
    'not ok 2 - a group',
    '  ---',
    '  duration_ms: 900',
    "  type: 'suite'",
    '  ...',
    'ok 3 - skipped one # SKIP no db',
    '  ---',
    '  duration_ms: 0.1',
    '  ...',
    'ok 4 - /repo/test/x.test.mjs',
    '  ---',
    '  duration_ms: 2000',
    '  ...',
    '# duration_ms 13764.4593',
  ].join('\n');
  assert.deepEqual(
    fromLog(log).map((t) => [t.kind ?? 'test', t.file || t.name, t.ms, t.status]),
    [
      ['test', 'C-09: frozen source', 13479.665649, 'passed'],
      ['test', 'inner quick one', 3.5, 'passed'],
      ['file', '/repo/test/x.test.mjs', 2000, 'passed'],
    ],
  );
  assert.deepEqual(fromLog('  ✓ built in 16.31s\n'), [], 'a Vite build line is not a test');
});

test('slowest: per-test over per-file, merged across runs (max), filtered and capped', () => {
  const run1 = fromLog('  ✓ a 3000ms\n  ✓ b 12000ms\n  ✓ f.test.ts (2 tests) 15000ms');
  const run2 = fromLog('  ✓ a 4000ms\n  ✓ c 100ms');
  const list = slowest([...run1, ...run2], { top: 2 });
  assert.deepEqual(
    list.map((t) => [t.name, t.ms, t.runs]),
    [
      ['b', 12_000, 1],
      ['a', 4_000, 2],
    ],
  );
  assert.deepEqual(
    slowest(fromLog('  ✓ f.test.ts (2 tests) 15000ms'), { overMs: 10_000 }).map((t) => t.file),
    ['f.test.ts'],
  );
});

test('the slow-tests notice round-trips (the factory reads it back) and escapes newlines', () => {
  const list = slowest(fromVitestJson(vitestReport));
  const line = notice(list);
  assert.match(line, /^::notice title=slow-tests::12\.40s {2}\/repo\/apps\/api\/test\/unit\/a\.test\.ts › a boots%0A/);
  const message = line
    .slice(line.indexOf('::', 2) + 2)
    .replace(/%0A/g, '\n')
    .replace(/%25/g, '%');
  assert.deepEqual(
    fromNotice(message).map((t) => [t.file, t.name, t.ms]),
    list.map((t) => [t.file, t.name, Math.round(t.ms / 10) * 10]),
  );
  assert.match(markdown(list), /\| 1 \| 12\.40s \| over 10 s \|/);
});

test('--summary: job summary + notice + a warning per test over 10 s; no report is not an error', () => {
  const dir = mkdtempSync(join(tmpdir(), 'slow-tests-test-'));
  try {
    writeFileSync(join(dir, 'vitest-1.json'), vitestReport);
    const summary = join(dir, 'summary.md');
    const script = new URL('../scripts/slow-tests.mjs', import.meta.url).pathname;
    const env = { ...process.env, GITHUB_STEP_SUMMARY: summary };
    const r = spawnSync(process.execPath, [script, '--summary', dir], { encoding: 'utf8', env });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /::notice title=slow-tests::/);
    assert.match(r.stdout, /::warning title=slow test::12\.40s .*a boots/);
    assert.match(readFileSync(summary, 'utf8'), /### Slowest tests \(top 10\)/);
    const none = spawnSync(process.execPath, [script, '--summary', join(dir, 'missing')], { encoding: 'utf8', env });
    assert.equal(none.status, 0, none.stderr);
    assert.match(none.stdout, /no timed tests/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('budget: the PR path bails at the first failure, fails a test above 10 s and skips *.slow.test.*', () => {
  const pr = vitestBudget({ testTimeout: 60_000, env: { CI_TEST_PROFILE: 'pr' } });
  assert.equal(pr.bail, 1);
  assert.equal(pr.testTimeout, PR_TEST_TIMEOUT_MS);
  assert.equal(pr.slowTestThreshold, 2_000);
  assert.ok(pr.exclude.includes(SLOW_TEST_GLOB));
  assert.equal(pr.reporters, undefined, 'no report outside CI');
});

test('budget: the PR path never loosens a repo timeout below 10 s (vitest default 5 s stays 5 s)', () => {
  assert.equal(vitestBudget({ testTimeout: 5_000, env: { CI_TEST_PROFILE: 'pr' } }).testTimeout, 5_000);
  assert.equal(vitestBudget({ testTimeout: 5_000, env: { CI_TEST_PROFILE: 'full' } }).testTimeout, 5_000);
});

test('budget: nightly, production and local runs run everything with the repo timeout', () => {
  for (const env of [{ CI_TEST_PROFILE: 'full' }, { GITHUB_EVENT_NAME: 'schedule' }, {}]) {
    const full = vitestBudget({ testTimeout: 60_000, env });
    assert.equal(full.bail, 0);
    assert.equal(full.testTimeout, 60_000);
    assert.ok(!full.exclude.includes(SLOW_TEST_GLOB));
  }
  assert.equal(testProfile({ GITHUB_EVENT_NAME: 'pull_request' }), 'pr', 'a PR run without the profile is the PR path');
});

test('budget: TEST_BAIL, TEST_SLOW and TEST_TIMEOUT_MS override; CI_TEST_REPORT_DIR writes a JSON report', () => {
  const env = {
    CI_TEST_PROFILE: 'pr',
    TEST_BAIL: '0',
    TEST_SLOW: '1',
    TEST_TIMEOUT_MS: '30000',
    CI_TEST_REPORT_DIR: '/tmp/r/',
  };
  const o = vitestBudget({ env });
  assert.equal(o.bail, 0);
  assert.ok(!o.exclude.includes(SLOW_TEST_GLOB));
  assert.equal(o.testTimeout, 30_000);
  assert.deepEqual(o.reporters, ['default', 'json']);
  assert.match(o.outputFile.json, /^\/tmp\/r\/vitest-\d+-\d+\.json$/);
  assert.equal(vitestBudget({ env: { TEST_SLOW: '0' } }).exclude.includes(SLOW_TEST_GLOB), true);
});

test('--repo reads the runs of one workflow (ci.yml by default), not the repo-wide list', () => {
  assert.equal(
    runsPath('AgentsKit-io/x'),
    'repos/AgentsKit-io/x/actions/workflows/ci.yml/runs?status=completed&per_page=50',
  );
  assert.equal(
    runsPath('o/r', 'Product CI.yml'),
    'repos/o/r/actions/workflows/Product%20CI.yml/runs?status=completed&per_page=50',
  );
});
