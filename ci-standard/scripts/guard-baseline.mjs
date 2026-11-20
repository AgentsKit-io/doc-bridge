// Adoption baseline of the two policy guards (cache-guard, no-fixed-ports), per FILE, same idea as the oxlint one
// (oxlint-baseline.mjs): the files that violated the guard when the standard was adopted are listed in
// ci-standard/guard-baseline.json and tolerated; every other file, new ones included, is checked strict. The list is
// generated (`node ci-standard/scripts/<guard>.mjs --write-baseline`) and only shrinks, one maintenance ticket per area.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const BASELINE_FILE = 'ci-standard/guard-baseline.json';

export function loadBaseline(name, file = BASELINE_FILE) {
  if (!existsSync(file)) return new Set();
  return new Set(JSON.parse(readFileSync(file, 'utf8'))[name] ?? []);
}

/** Violations outside the baseline (`fresh`) and the baseline files that no longer violate anything (`stale`). */
export function applyBaseline(violations, baseline) {
  const fresh = violations.filter((v) => !baseline.has(v.file));
  const seen = new Set(violations.map((v) => v.file));
  const stale = [...baseline].filter((f) => !seen.has(f));
  return { fresh, stale };
}

export function writeBaseline(name, violations, file = BASELINE_FILE) {
  const all = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  all[name] = [...new Set(violations.map((v) => v.file))].sort();
  writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
  return all[name].length;
}
