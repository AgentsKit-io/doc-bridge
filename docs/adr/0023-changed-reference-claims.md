---
title: Changed-reference claims and mentions
status: accepted
date: 2026-10-09
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/changed-claims.ts
validationPath: pnpm vitest run tests/changed-claims.test.ts --maxWorkers=2
---

# Changed-reference claims and mentions

## Context

Historical review distinguishes stale claims from valid export lists, type
annotations, imports and calls that remain supported after optional additions.
A changed target hash alone creates too many review findings for those mentions.

## Decision

Supersede ADR 0010's changed-reference emission rule: emit `CHANGED_REFERENCE`
only when the citing region claims something about the changed aspect. Explicit
signatures, parameters, returns, enum/union members, configuration values and
usage that exercises the changed aspect are claims. A bare mention is not.
Removal and ambiguous-owner findings retain their existing rules.

Classification remains deterministic and bounded. Reuse Markdown citation
regions, TypeScript syntax, retained signature context and the existing
compatibility checker. An optional call addition does not make an unchanged
call claim about that addition; unrelated opaque returns cannot invalidate a
parameter-only proof. Explicit shape declarations and unverified return uses
remain claims. Citing sentences and pronoun continuations keep unrelated subjects separate.
Adjacent code can supply a claim when it contains the cited symbol; recognized
TypeScript fences may include ordinary metadata. Shallow owned option shapes
can prove optional additions while retaining required-field changes. Unused
optional return fields may be omitted only beneath unchanged, positively
covariant wrappers; opaque or restructured variants remain claims.
Unknown syntax, missing regions and oversized regions remain claims.

For enum claims, the existing configuration extractor may inspect bounded,
snapshot-verified head source through the same exact-partition read abstraction.
An exact string-union match can prove a current enum claim. Missing source,
hash mismatch, unresolved aliases, defaults or unsupported shapes remain review
candidates. No repository code, LLM or network request is executed.

Citation relations and changed facts remain in the snapshot and ChangeSet;
classification changes only finding emission. Surviving finding identities and
the index/handoff schemas remain unchanged. This is a public behavior change.

## Consequences

Native and fixture controls, frozen v1 comparisons and hand-reviewed historical
cases must expose coverage changes and remaining mismatches. Mention suppression
is not semantic prose validation. Unknown cases cannot be discarded to improve
precision, and a passing sample does not establish repository-wide readiness.
