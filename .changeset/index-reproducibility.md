---
'@agentskit/doc-bridge': minor
---

Say when a committed index could not have come from a clean checkout.

A scan walks what is on disk and has no reason to consult `.gitignore`, so a generated module or
document silently joins the corpus on a machine that has built and silently leaves it on one that
has not. That is harmless while the index is rebuilt on every run. It is a defect the moment the
index is committed so a gate can verify it — which is the setup `index-freshness` exists for: two
checkouts of the same commit then produce different artifacts, the gate reports staleness that
nothing caused, and regenerating cannot fix it because the next machine disagrees in the other
direction.

Dogfooding found this the expensive way. On a 25-package monorepo the freshness gate passed locally
and failed in CI, twice, because `pnpm lint` had generated one `.ts` file into the corpus before the
index was written; CI lints a narrower scope and never had the file. Diagnosing it took reading two
CI logs and diffing file inventories. Git already knew the answer.

`ak-docs index` now names those paths as it writes, and `ak-docs doctor` raises an
`index-not-reproducible` warning, each with the ignore rule that matched — for example
`apps/docs-next/lib/ask-context.ts (apps/docs-next/.gitignore:13:lib/ask-context.ts)` — so the fix
is one lookup away: add the path to `safety.exclude`.

Both are unconditional and neither changes an exit code or the doctor's score. Enforcement is the
new `index-reproducible` gate, which is in no preset and has to be requested with
`gates.include: ['index-reproducible']`, because turning it on for every consumer would fail gates
that pass for good reasons.

The check reports success rather than failure when the index is not committed or the project is not
a Git checkout, since there is nothing to reproduce in either case, and it does not flag a file that
is both tracked and matched by an ignore rule — being committed is the point.
