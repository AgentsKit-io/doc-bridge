---
title: Syntactic signature facts v1
description: Deterministic bounded exported JS/TS signature extraction and symbol citations.
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/facts/signatures.ts
validationPath: pnpm vitest run tests/signatures.test.ts
---

# Syntactic signature facts v1

The built-in `js-ts:signature` component, version `1.0.0`, extracts `signature`
facts from scan-local TypeScript syntax trees. It never creates a type checker or
program, executes repository code, or infers types. The existing surface codec,
module owner IDs, snapshot, index and handoff envelopes remain unchanged.

An exported function or arrow/function-expression binding has its exported name
as the fact name. Overloads produce one fact: declared overloads in source order
replace the implementation signature. Implementations and bodies do not affect
the value hash. Export aliases, assignments, default exports and re-exports remain
partial coverage; external package signatures are never guessed.

Callable values record parameter names in order, optionality, rest, default
presence, declared type text, type parameters and declared return type text.
Default expression values are excluded. Type text is normalized as an ordered
array of syntax leaf tokens, skipping comments and whitespace while preserving
string and template literal contents. Missing declared types are recorded as null with partial
coverage. A constructor has no required return annotation.

Exported classes, interfaces and object type aliases produce an aggregate fact
named after the export plus facts for their top-level public members, named
`Export.member` or `Export.static:member`. Aggregate members are sorted by name;
callable overload order and parameter order remain significant. Private and
protected members are excluded. Property optionality, readonly and declared type,
type parameters and heritage text are recorded. Non-object type aliases hash
their normalized declared type text and outer type parameters. Inherited class members, dynamic/computed
or punctuated names, accessors and call/index members produce explicit partial coverage.

The value hash uses the existing normalized SHA-256 codec over the ordered
signature projection. IDs use `surfaceFactEntityId('signature', moduleId, name)`.
Evidence records the declaration's bounded file, lines and original content hash.
At most 4096 facts per module, 256 characters per name, 16 KiB per projected value
and eight evidence locations per fact are emitted. Exceeding a bound produces
partial coverage, never complete empty output. Each module contributes capability
`signatures` coverage under this extractor's own analyzer ID/version.

## Documentation and changes

A signature citation reuses an existing uniquely resolved symbol citation. The
legacy `metadata.symbol` relation remains; an additional relation to the same
module carries `factKind: signature` and `factName` equal to that symbol. No new
token matching is introduced. Citing a class or type references its aggregate
signature, including its public member declarations. Exact paths retain
precedence, ambiguous symbols produce no signature relation, and the existing
64-relation/eight-location bounds apply. Facts do not become retrieval documents.

The existing generic delta compares value hashes. A retained symbol with changed
parameters produces a `signature` change with operation `changed`, before/after
value hashes and documentation review impact. It creates no new finding code and
no `BROKEN_REFERENCE` for a changed signature. Removal uses the existing removal
finding flow and completeness rules; incomplete extraction cannot prove a break.
