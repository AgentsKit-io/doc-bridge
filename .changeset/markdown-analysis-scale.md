---
'@agentskit/doc-bridge': patch
---

Make Markdown reference resolution scale, so a large repository can be indexed at all.

Dogfooding Doc Bridge on a monorepo of 4 100 documents, 9 240 TypeScript files and 102 packages
found that `ak-docs scan` and `ak-docs index` did not complete — not slowly, but not at all within
fifteen minutes. The cost was superlinear in corpus size and concentrated in one place: a CPU
profile of a 401-document corpus put 56.5% of samples in `fuzzyMatchList`, the near-miss resolver
for path-shaped references.

Two things were wrong. The analyzer rebuilt the candidate universe — every document, module and
area path — once per document, which on that monorepo is tens of millions of string copies before
any analysis happens; the universe is now built once per run and passed in as
`MarkdownResolution.pathIndex`. And every unresolved reference ran a full Jaro-Winkler scan over
that universe, where almost every candidate cannot reach the 0.92 threshold for reasons that cost
far less to check than a similarity computation.

`createFuzzyCandidateIndex` precomputes, per candidate, its length and its character counts over a
fixed alphabet. A query then visits only the lengths that can pass, and within those skips any
candidate whose shared-character count is too low. Both tests are upper bounds on Jaro's match
count — `m` cannot exceed the shorter string, and cannot exceed the multiset intersection — so a
candidate they drop provably could not have matched. The filter is behaviour-preserving including
the order of tied scores, and a test asserts that a list universe and an index universe return
identical results over 646 candidates at four thresholds.

Measured on the same corpora: 908 documents went from 151 to 25 seconds, and the monorepo that
did not finish in fifteen minutes now scans in 100 seconds. `fuzzyMatchList` and
`resolveFuzzyReference` still accept a plain array, so the public contract and the mirror of
`@agentskit/core/fuzzy-match` are unchanged.
