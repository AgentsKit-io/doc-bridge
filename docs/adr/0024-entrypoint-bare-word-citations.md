---
title: Entrypoint scripts and bare-word citations
status: accepted
date: 2026-10-10
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/markdown.ts
validationPath: pnpm vitest run tests/entrypoint-bare-word.test.ts tests/entrypoint.test.ts tests/changed-claims.test.ts tests/advisory-policy.test.ts --maxWorkers=2
---

# Entrypoint scripts and bare-word citations

## Context

The Markdown analyzer treats every inline-code span equal to an exported name as a symbol
citation. In this repository, `main` is both the git branch that CI enforces and the exported
`main()` of `scripts/verification-harness.mjs`. Once `scripts/study-minimal.mjs` also exported
`main()`, the advisory reported prose about the branch as `AMBIGUOUS_REFERENCE` in four
contributor and governance documents. Those spans cite a branch, not a function.

## Decision

Keep the citation rule and narrow the candidate set. A bare lowercase word (`/^[a-z]+$/`, the whole
span) that is an inline-code or link-text token does not resolve to a candidate module that is an
entrypoint script, unless that module is anchored by its path or package name in the same citation
region (the same line when outside any region). This is the owner-anchor pattern already used for
bare configuration keys. Fenced syntactic citations, CLI tokens and non-entrypoint owners are
unaffected. Entrypoint status is the module fact `metadata.entrypoint: true`, decided from source
text by shebang or by a main-module guard (`import.meta.url` against `process.argv[1]`, or
`require.main === module`).

The rule applies at the citation-extraction seam, so base relations, head ambiguity and the diff
re-resolution of citations in head all agree. `MARKDOWN_ANALYZER_VERSION` and the `js-ts` adapter
version are bumped so incremental reuse does not replay old answers.

## Rejected alternative: gate every bare lowercase word unless anchored

The broad gate filtered every bare lowercase single-word token that did not have an anchor, not
only entrypoint owners. It was rejected on measured cost:

- it dropped genuine citations of lowercase library functions, such as "Call `make` with no
  arguments" in `tests/changed-claims.test.ts`, and that test's changed-reference finding was lost;
- 27 existing tests broke;
- retrieval hit@3 regressed from 88.3% to 86.7%, below the committed baseline.

The narrow rule keeps library functions citable and touches only the owners that cause the noise.

## Consequences

- Prose that uses a bare word for something else is no longer linked to an entrypoint script it
  does not name. An entrypoint script is reachable through its path, or through a bare word cited
  next to that path.
- Detection is a text heuristic with fixed forms, documented in `src/discovery/entrypoint.ts`. A
  script guarded in another form is treated as a library until its guard matches a supported
  form; that is a conservative loss of a bare-word citation, never a false ambiguity.
- Entrypoint status is part of the resolution fingerprint and the analyzer versions. A snapshot
  written before this change is re-analysed in full on the next scan.

## Validation

- `tests/entrypoint.test.ts` covers each guard form and a library that only mentions
  `import.meta.url` or `process.argv`.
- `tests/entrypoint-bare-word.test.ts` covers the prose regression (a second entrypoint `main`),
  anchored and unanchored resolution, a non-entrypoint library function, and genuine ambiguity
  between two library modules.
