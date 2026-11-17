import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { inScope, scanFiles, scanText } from '../scripts/no-fixed-ports.mjs';

// The fixtures below are built from parts so this test file never trips the guard itself.
const host = ['127', '0', '0', '1'].join('.');
const year = String(2000 + 26);

test('a fixed port in a localhost URL or PORT=<n> fails', () => {
  assert.equal(scanText(`await fetch('http://${host}:35438/health');`)[0].rule, 'fixed-port');
  assert.equal(scanText('const u = `http://localhost:3000`;')[0].rule, 'fixed-port');
  assert.equal(scanText('PORT=8080 node server.js')[0].rule, 'fixed-port');
  assert.deepEqual(scanText(`const u = \`http://${host}:\${await freePort()}\`;`), []);
});

test('an absolute date fails: new Date(literal), Date.UTC/parse(literal), ISO timestamp literal', () => {
  assert.equal(scanText(`let t = new Date('${year}-11-01T10:00:00Z');`)[0].rule, 'fixed-date');
  assert.equal(scanText(`const t = Date.UTC(${year}, 10, 1);`)[0].rule, 'fixed-date');
  assert.equal(scanText(`const t = Date.parse("${year}-11-11");`)[0].rule, 'fixed-date');
  assert.equal(scanText(`assert.equal(d.toISOString(), '${year}-11-16T10:00:00.000Z');`)[0].rule, 'fixed-date');
  assert.deepEqual(scanText('let t = addMs(testNow(), 3 * DAY);'), []);
  assert.deepEqual(scanText(`const versions = { terms: '${year}-11-01' };`), [], 'a date-only version label is fine');
});

test('flock fails; `// fixed-ok: <reason>` and fixtures/ are exempt', () => {
  assert.equal(scanText('flock -w 900 /tmp/x.lock npm test')[0].rule, 'flock');
  assert.deepEqual(
    scanText(`windowKey('week', new Date('${year}-12-28T00:00:00Z')); // fixed-ok: ISO week edge case`),
    [],
  );
  assert.equal(inScope('apps/api/test/contract/fixtures/data.ts'), false);
  assert.equal(inScope('apps/api/test/contract/suite.ts'), true);
  assert.equal(inScope('apps/web/e2e/login.spec.ts'), true);
  assert.equal(inScope('apps/api/test/unit/core.test.ts'), false);
});

test('an empty fixed-ok reason does not exempt the line', () => {
  assert.equal(scanText(`x(new Date('${year}-12-28')) // fixed-ok:`).length, 1);
});

test('CLI: fails on a contract file with a fixed port and on one with an absolute date; passes on the repo', () => {
  const root = mkdtempSync(join(tmpdir(), 'no-fixed-ports-'));
  const write = (path, text) => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
  };
  try {
    write('apps/api/test/contract/port.ts', `fetch('http://${host}:35438/x');\n`);
    write('apps/api/test/contract/date.ts', `const t = new Date('${year}-11-01T10:00:00Z');\n`);
    write('apps/api/test/contract/fixtures/ok.ts', `const t = new Date('${year}-11-01T10:00:00Z');\n`);
    write('apps/api/test/unit/out-of-scope.test.ts', `fetch('http://${host}:35438/x');\n`);
    const r = spawnSync(process.execPath, ['ci-standard/scripts/no-fixed-ports.mjs', '--root', root], {
      encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /port\.ts:1: fixed-port/);
    assert.match(r.stderr, /date\.ts:1: fixed-date/);
    assert.doesNotMatch(r.stderr, /fixtures|out-of-scope/);
    assert.equal(scanFiles(['apps/api/test/contract/port.ts'], { root }).length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  const repo = spawnSync(process.execPath, ['ci-standard/scripts/no-fixed-ports.mjs'], { encoding: 'utf8' });
  assert.equal(repo.status, 0, repo.stderr);
});
