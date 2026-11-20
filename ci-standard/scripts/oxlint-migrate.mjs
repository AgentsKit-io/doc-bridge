#!/usr/bin/env node
// Moving a repo's lint from Biome to oxlint (CI standard v3): turns every `// biome-ignore lint/<group>/<rule>: <why>` whose
// rule oxlint has into `// oxlint-disable-next-line <oxlint rule> -- <why>` (same line, same reason). A suppression of a
// rule oxlint does not have (a11y, Biome-only rules) is left as it is and listed: it is no longer enforced by a linter, so
// the list is the debt to look at. Without --write it only reports.
//   node ci-standard/scripts/oxlint-migrate.mjs [--write] [dir...]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/** Biome rule (without the group) -> oxlint rule. Only rules with the same meaning. */
export const RULES = {
  noNonNullAssertion: 'typescript/no-non-null-assertion',
  noExplicitAny: 'typescript/no-explicit-any',
  noUnusedVariables: 'no-unused-vars',
  noUnusedImports: 'no-unused-vars',
  noUnusedFunctionParameters: 'no-unused-vars',
  useTemplate: 'prefer-template',
  useImportType: 'typescript/consistent-type-imports',
  useConst: 'prefer-const',
  useIterableCallbackReturn: 'array-callback-return',
  noUnsafeOptionalChaining: 'no-unsafe-optional-chaining',
  noThenProperty: 'unicorn/no-thenable',
  noConsole: 'no-console',
  noDebugger: 'no-debugger',
  noDoubleEquals: 'eqeqeq',
  noFallthroughSwitchClause: 'no-fallthrough',
  noParameterAssign: 'no-param-reassign',
  noShadowRestrictedNames: 'no-shadow-restricted-names',
  noEmptyBlockStatements: 'no-empty',
  noControlCharactersInRegex: 'no-control-regex',
  noAsyncPromiseExecutor: 'no-async-promise-executor',
  noArrayIndexKey: 'react/no-array-index-key',
  noDangerouslySetInnerHtml: 'react/no-danger',
  useExhaustiveDependencies: 'react-hooks/exhaustive-deps',
  useHookAtTopLevel: 'react-hooks/rules-of-hooks',
  noNamespace: 'typescript/no-namespace',
  noBannedTypes: 'typescript/no-unsafe-function-type',
  useAwait: 'require-await',
  noUselessCatch: 'no-useless-catch',
  noSelfCompare: 'no-self-compare',
  noSparseArray: 'no-sparse-arrays',
};

const COMMENT = /^(\s*)(\/\/|\{\/\*)\s*biome-ignore\s+lint\/(\w+)\/(\w+)(?:\s*\([^)]*\))?\s*:?\s*(.*?)\s*(\*\/\})?\s*$/;

/** One file's text -> { text, converted, kept: [{ line, rule }] }. Pure. */
export function migrate(text) {
  let converted = 0;
  const kept = [];
  const lines = text.split('\n').map((line, i) => {
    const m = COMMENT.exec(line);
    if (!m) return line;
    const [, indent, open, group, rule, why] = m;
    const target = RULES[rule];
    if (!target) {
      kept.push({ line: i + 1, rule: `${group}/${rule}` });
      return line;
    }
    converted++;
    const body = `oxlint-disable-next-line ${target}${why ? ` -- ${why}` : ''}`;
    return open === '{/*' ? `${indent}{/* ${body} */}` : `${indent}// ${body}`;
  });
  return { text: lines.join('\n'), converted, kept };
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.wrangler', '.turbo']);
function sources(dir) {
  return readdirSync(dir).flatMap((name) => {
    if (SKIP.has(name)) return [];
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(c|m)?[jt]sx?$/.test(name) ? [path] : [];
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const dirs = args.filter((a) => a !== '--write');
  let converted = 0;
  const kept = [];
  for (const file of (dirs.length ? dirs : ['.']).flatMap(sources)) {
    const before = readFileSync(file, 'utf8');
    if (!before.includes('biome-ignore')) continue;
    const r = migrate(before);
    converted += r.converted;
    for (const k of r.kept) kept.push(`${file}:${k.line} ${k.rule}`);
    if (write && r.text !== before) writeFileSync(file, r.text);
  }
  console.log(
    `oxlint-migrate: ${converted} biome-ignore ${write ? 'converted' : 'to convert'}; ${kept.length} kept (no oxlint rule)`,
  );
  for (const k of kept) console.log(`  kept ${k}`);
}
