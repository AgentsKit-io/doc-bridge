import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { classify, crossCheck, parseNx, parseTurbo } from '../scripts/affected.mjs';

// This file is a template `copy`: the same bytes in every repo. The rules are tested against a fixed config here; the
// repo's own ci-standard/affected.config.json is tested through paths taken from it (its first workspace, its first
// literal global file), never through paths of one product.
const rules = {
  baseBranch: 'develop',
  workspaces: ['apps/api', 'packages'],
  global: ['package.json', 'pnpm-lock.yaml', '.github/**'],
  ignore: ['docs/**', '*.md', 'changelog.d/**'],
};
const config = JSON.parse(readFileSync('ci-standard/affected.config.json', 'utf8'));
const workspace = config.workspaces[0];
const inWorkspace = `${workspace}/src/__affected_probe__.ts`;
const globalFile = config.global.find((g) => !/[*?[]/.test(g));
const cli = (...args) => spawnSync('node', ['ci-standard/scripts/affected.mjs', ...args], { encoding: 'utf8' });

test('only ignorable files -> nothing to run', () => {
  assert.equal(classify(['docs/a.md', 'README.md', 'changelog.d/1.md'], rules).scope, 'none');
});
test('workspace change -> affected', () => {
  assert.deepEqual(classify(['apps/api/src/app.ts', 'docs/a.md'], rules), {
    scope: 'affected',
    packages: ['apps/api'],
    unknown: [],
  });
});
test('global file -> full run', () => {
  assert.equal(classify(['pnpm-lock.yaml', 'apps/api/src/app.ts'], rules).scope, 'full');
});
test("this repo's config: a workspace file is affected, a literal global file runs everything, docs are ignorable", () => {
  assert.ok(typeof workspace === 'string' && workspace !== '', 'affected.config.json lists no workspace');
  assert.deepEqual(classify([inWorkspace], config), { scope: 'affected', packages: [workspace], unknown: [] });
  if (globalFile !== undefined) assert.equal(classify([globalFile, inWorkspace], config).scope, 'full');
  assert.equal(classify(['docs/__affected_probe__.md'], config).scope, 'none');
});
test('a change hidden from the rules fails the run, never skips', () => {
  // A top-level directory no repo has (`tools/` is a workspace in some repos).
  const hidden = cli('--files', '__ci_hidden_probe__/script.ts');
  assert.equal(hidden.status, 1);
  assert.match(hidden.stderr, /hidden from the tool/);
  assert.equal(cli('--files', inWorkspace).status, 0);
});
test('hidden change mixed with ignorable ones still fails', () => {
  assert.equal(cli('--files', 'docs/a.md,unmapped/file.txt').status, 1);
});
test('tool seeing nothing while paths changed fails closed', () => {
  const r = crossCheck(classify(['apps/api/src/app.ts'], rules), []);
  assert.equal(r.scope, 'unknown');
  assert.equal(crossCheck(classify(['apps/api/src/app.ts'], rules), ['@x/api']).scope, 'affected');
});
test('cannot compute the changed files (unknown base) fails instead of skipping', () => {
  assert.equal(cli('--base', 'refs/does-not-exist').status, 1);
});
test('tool output parsers', () => {
  assert.deepEqual(parseTurbo('{"packages":["//","@x/api"]}'), ['@x/api']);
  assert.deepEqual(parseNx('api\nweb\n'), ['api', 'web']);
});
