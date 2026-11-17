import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromPattern, toPattern } from '../scripts/oxlint-baseline.mjs';

// ignorePatterns are globs: a Next.js route segment like [id] is a character class, so an unescaped baseline entry
// (apps/web/src/app/(User)/x/[id]/page.tsx) never matches its file and the lint stays red after the baseline.
test('a baseline entry is the file path with glob metacharacters escaped', () => {
  assert.equal(toPattern('apps/web/src/app/(User)/x/[id]/page.tsx'), 'apps/web/src/app/(User)/x/\\[id\\]/page.tsx');
  assert.equal(toPattern('a/[...slug]/b*?{c}.ts'), 'a/\\[...slug\\]/b\\*\\?\\{c\\}.ts');
  assert.equal(toPattern('apps/api/src/plain.ts'), 'apps/api/src/plain.ts');
});

test('the listed path reads back to the file path', () => {
  for (const file of ['apps/web/src/app/(User)/x/[id]/page.tsx', 'a/[...slug]/b*?{c}.ts', 'plain.ts']) {
    assert.equal(fromPattern(toPattern(file)), file);
  }
});
