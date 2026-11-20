import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { checkDirs, checkText } from '../scripts/cache-guard.mjs';
import { applyBaseline, loadBaseline } from '../scripts/guard-baseline.mjs';

const workflow = (jobs) => `name: x\non: [pull_request, push]\njobs:\n${jobs}`;

test('setup-node with cache: npm fails (inline and block with:)', () => {
  const inline = workflow(`  a:
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: npm }
      - run: npm ci
`);
  const block = workflow(`  a:
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
          cache: pnpm
`);
  assert.deepEqual(
    checkText(inline).map((v) => v.line),
    [8],
  );
  assert.equal(checkText(block).length, 1);
  assert.match(checkText(block)[0].message, /setup-node/);
});

test('actions/cache@ or cache/save in a job that runs on PRs fails', () => {
  const full = workflow(`  a:
    runs-on: x
    steps:
      - uses: actions/cache@v4
        with: { path: ~/.npm, key: k }
`);
  const save = workflow(`  a:
    if: always()
    runs-on: x
    steps:
      - name: save
        uses: actions/cache/save@v4
        with: { path: ~/.npm, key: k }
`);
  assert.equal(checkText(full).length, 1);
  assert.equal(checkText(save).length, 1);
});

test('compliant pattern passes: restore anywhere, save only in a base-branch job', () => {
  const ok = workflow(`  seed:
    if: github.event_name != 'pull_request' && github.ref_name == inputs.base-branch
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - uses: actions/cache/save@v4
        with: { path: ~/.npm, key: k }
  test:
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: "22"
      # cache: npm in a comment is fine
      - uses: actions/cache/restore@v4
        with: { path: ~/.npm, key: k, restore-keys: npm- }
`);
  assert.deepEqual(checkText(ok), []);
});

test('the base-branch condition of one job does not leak into the next job', () => {
  const leak = workflow(`  seed:
    if: github.event_name != 'pull_request'
    runs-on: x
    steps:
      - run: true
  pr:
    runs-on: x
    steps:
      - uses: actions/cache/save@v4
        with: { path: ~/.npm, key: k }
`);
  assert.equal(checkText(leak).length, 1);
});

test('a composite action may restore but never save', () => {
  const action = `name: a
runs:
  using: composite
  steps:
    - uses: actions/cache/restore@v4
      with: { path: ~/.npm, key: k }
    - uses: actions/cache/save@v4
      with: { path: ~/.npm, key: k }
`;
  assert.deepEqual(
    checkText(action).map((v) => v.line),
    [7],
  );
});

test('setup-bun must not cache its binary (one entry per PR ref): no-cache: true passes, anything else fails', () => {
  const action = (extra) => `name: a
runs:
  using: composite
  steps:
    - uses: oven-sh/setup-bun@0c5077e51419868618aeaa5fe8019c62421857d6 # v2
      with:
        bun-version: 1.4.4${extra}
`;
  assert.deepEqual(
    checkText(action('')).map((v) => v.line),
    [5],
  );
  assert.deepEqual(
    checkText(action('\n        no-cache: false')).map((v) => v.line),
    [5],
  );
  assert.deepEqual(checkText(action('\n        no-cache: true')), []);
});

test('a workflow no pull_request reaches (deploy on push, manual) may use setup-node cache; PR and reusable ones may not', () => {
  const job = [
    'jobs:',
    '  deploy:',
    '    runs-on: x',
    '    steps:',
    '      - uses: actions/setup-node@v4',
    '        with: { cache: npm }',
    '',
  ].join('\n');
  assert.deepEqual(checkText(`on:\n  push:\n    branches: [main]\n  workflow_dispatch:\n${job}`), []);
  assert.deepEqual(checkText(`on: [push, workflow_dispatch]\n${job}`), []);
  assert.equal(checkText(`on:\n  pull_request:\n  push:\n${job}`).length, 1);
  assert.equal(checkText(`on: [push, pull_request]\n${job}`).length, 1);
  assert.equal(checkText(`on:\n  workflow_call:\n${job}`).length, 1);
  assert.equal(checkText(`on: pull_request_target\n${job}`).length, 1);
});
test('a composite action that only workflows no PR reaches use (a release on tags) is skipped, like those workflows', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-guard-'));
  const wf = join(dir, 'workflows');
  const actions = join(dir, 'actions');
  try {
    mkdirSync(wf);
    mkdirSync(join(actions, 'release-setup'), { recursive: true });
    mkdirSync(join(actions, 'wrapper'), { recursive: true });
    writeFileSync(
      join(actions, 'release-setup', 'action.yml'),
      'name: s\nruns:\n  using: composite\n  steps:\n    - uses: actions/setup-node@v4\n      with: { cache: pnpm }\n',
    );
    const steps = (uses) => `jobs:\n  a:\n    runs-on: x\n    steps:\n      - uses: ${uses}\n`;
    writeFileSync(
      join(wf, 'release.yml'),
      `on:\n  push:\n    tags: ['v*']\n  workflow_dispatch:\n${steps('./.github/actions/release-setup')}`,
    );
    writeFileSync(join(wf, 'ci.yml'), `on:\n  pull_request:\n${steps('actions/checkout@v4')}`);
    assert.deepEqual(checkDirs([wf, actions]), []);
    // Without the workflows nobody knows who uses it: checked.
    assert.equal(checkDirs([actions]).length, 1);
    // Through another composite action: unused wrapper, still skipped; a PR workflow uses the wrapper: checked.
    writeFileSync(
      join(actions, 'wrapper', 'action.yml'),
      'name: w\nruns:\n  using: composite\n  steps:\n    - uses: ./.github/actions/release-setup\n',
    );
    assert.deepEqual(checkDirs([wf, actions]), []);
    writeFileSync(join(wf, 'ci.yml'), `on:\n  pull_request:\n${steps('./.github/actions/wrapper')}`);
    assert.equal(checkDirs([wf, actions]).length, 1);
    rmSync(join(actions, 'wrapper'), { recursive: true });
    // A PR workflow (or a reusable one) that uses it: checked.
    writeFileSync(join(wf, 'ci.yml'), `on:\n  pull_request:\n${steps('./.github/actions/release-setup')}`);
    assert.equal(checkDirs([wf, actions]).length, 1);
    // A reusable workflow nobody here calls (callers unknown): checked.
    writeFileSync(join(wf, 'ci.yml'), `on:\n  workflow_call:\n${steps('./.github/actions/release-setup/')}`);
    assert.equal(checkDirs([wf, actions]).length, 1);
    // A reusable release gate called only by the tag workflow: not reachable; called by a PR workflow: checked.
    writeFileSync(
      join(wf, 'gate.yml'),
      `on:\n  push:\n    tags: ['v*']\n  workflow_call:\n${steps('./.github/actions/release-setup')}`,
    );
    writeFileSync(join(wf, 'ci.yml'), `on:\n  pull_request:\n${steps('actions/checkout@v4')}`);
    writeFileSync(
      join(wf, 'release.yml'),
      "on:\n  push:\n    tags: ['v*']\njobs:\n  gate:\n    uses: ./.github/workflows/gate.yml\n",
    );
    assert.deepEqual(checkDirs([wf, actions]), []);
    writeFileSync(join(wf, 'ci.yml'), 'on:\n  pull_request:\njobs:\n  gate:\n    uses: ./.github/workflows/gate.yml\n');
    assert.equal(checkDirs([wf, actions]).length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('CLI: fails on a sample workflow with cache: npm, passes on the repo itself', () => {
  const dir = mkdtempSync(join(tmpdir(), 'cache-guard-'));
  try {
    mkdirSync(join(dir, 'workflows'));
    writeFileSync(
      join(dir, 'workflows', 'bad.yml'),
      workflow(`  a:
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with: { node-version: "22", cache: npm }
`),
    );
    const bad = spawnSync(process.execPath, ['ci-standard/scripts/cache-guard.mjs', join(dir, 'workflows')], {
      encoding: 'utf8',
    });
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /bad\.yml:8: setup-node/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // The repo itself: only the files of its adoption baseline (ci-standard/guard-baseline.json) may violate.
  assert.deepEqual(
    applyBaseline(checkDirs(['.github/workflows', '.github/actions']), loadBaseline('cache-guard')).fresh,
    [],
  );
  const repo = spawnSync(process.execPath, ['ci-standard/scripts/cache-guard.mjs'], { encoding: 'utf8' });
  assert.equal(repo.status, 0, repo.stderr);
});

test('setup-node cache: in a base-branch-only job (deploy on push to main) passes, as actions/cache does', () => {
  const deploy = workflow(`  deploy:
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
`);
  assert.deepEqual(checkText(deploy), []);
  const pr = workflow(`  checks:
    if: github.event_name == 'pull_request'
    runs-on: x
    steps:
      - uses: actions/setup-node@v4
        with: { cache: pnpm }
`);
  assert.equal(checkText(pr).length, 1);
});
