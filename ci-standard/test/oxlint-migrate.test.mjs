import assert from 'node:assert/strict';
import { test } from 'node:test';
import { migrate, RULES } from '../scripts/oxlint-migrate.mjs';

test('a biome-ignore of a rule oxlint has becomes oxlint-disable-next-line, same line and reason', () => {
  const src = [
    '  // biome-ignore lint/style/noNonNullAssertion: invariant guaranteed by the caller',
    '  const a = x!.y;',
    '// biome-ignore lint/suspicious/noExplicitAny: loosely typed JSON body',
    '{/* biome-ignore lint/correctness/useExhaustiveDependencies: run once */}',
  ].join('\n');
  const r = migrate(src);
  assert.equal(r.converted, 3);
  assert.deepEqual(r.text.split('\n'), [
    '  // oxlint-disable-next-line typescript/no-non-null-assertion -- invariant guaranteed by the caller',
    '  const a = x!.y;',
    '// oxlint-disable-next-line typescript/no-explicit-any -- loosely typed JSON body',
    '{/* oxlint-disable-next-line react-hooks/exhaustive-deps -- run once */}',
  ]);
});

test('a rule oxlint does not have (a11y, Biome-only) is kept and listed', () => {
  const src = '// biome-ignore lint/a11y/useKeyWithClickEvents: decorative\n<div onClick={f} />\n';
  const r = migrate(src);
  assert.equal(r.converted, 0);
  assert.equal(r.text, src);
  assert.deepEqual(r.kept, [{ line: 1, rule: 'a11y/useKeyWithClickEvents' }]);
});

test('every mapped oxlint rule has a plugin prefix the template config enables, or is a core rule', () => {
  const plugins = new Set(['typescript', 'unicorn', 'react', 'react-hooks', 'import', 'oxc']);
  for (const [biome, ox] of Object.entries(RULES)) {
    const prefix = ox.includes('/') ? ox.split('/')[0] : null;
    assert.ok(prefix === null || plugins.has(prefix), `${biome} -> ${ox}`);
  }
});
