import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { applyBaseline, loadBaseline, writeBaseline } from '../scripts/guard-baseline.mjs';

test('a baseline file is tolerated, any other file is strict, a fixed one is reported stale', () => {
  const dir = mkdtempSync(join(tmpdir(), 'guard-baseline-'));
  const file = join(dir, 'baseline.json');
  try {
    assert.equal(writeBaseline('g', [{ file: 'old.yml' }, { file: 'old.yml' }, { file: 'fixed.yml' }], file), 2);
    const baseline = loadBaseline('g', file);
    const { fresh, stale } = applyBaseline(
      [
        { file: 'old.yml', line: 1 },
        { file: 'new.yml', line: 2 },
      ],
      baseline,
    );
    assert.deepEqual(fresh, [{ file: 'new.yml', line: 2 }]);
    assert.deepEqual(stale, ['fixed.yml']);
    assert.equal(loadBaseline('other', file).size, 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
