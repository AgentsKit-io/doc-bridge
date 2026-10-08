---
title: Syntactic signature facts v1
description: Deterministic bounded exported JS/TS signature extraction and symbol citations.
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/facts/signatures.ts
validationPath: pnpm vitest run tests/signatures.test.ts
---

# Syntactic signature facts v1

The built-in `js-ts:signature` component, version `1.1.0`, extracts `signature`
facts from scan-local TypeScript syntax trees. Extraction never creates a type checker or
program, executes repository code, or infers types. Diff-time compatibility checks
use an in-memory TypeScript checker only for changed signature hashes. The existing surface codec,
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
256-fact-relation/eight-location bounds apply. Facts do not become retrieval documents.

The existing generic delta compares value hashes. A retained symbol with changed
parameters produces a `signature` change with operation `changed`, before/after
value hashes and documentation review impact. It creates no new finding code and
no `BROKEN_REFERENCE` for a changed signature. Removal uses the existing removal
finding flow and completeness rules; incomplete extraction cannot prove a break.

## Compatible callable changes

Callable facts optionally retain `signature`, with codec `typescript-callable-v1`, containing the canonical overload
projections and reachable module-local interface/type declarations (`types`).
The entire proof is bounded to 16 KiB; unsupported or oversized proofs are omitted.
Callable proof records do not retain bodies, imports or inferred types. Module context is retained separately as described below; repository code is never executed. Legacy facts
without a proof remain readable and cannot establish compatibility.

A changed callable is marked `compatibility: compatible` in its ChangeSet when
all previous calls retain accepting parameters and a return assignable to the
previous return. Added parameters must be optional or defaulted. Declared
parameter types are checked contravariantly and returns covariantly under strict
TypeScript checking. Unchanged syntax/context needs no checker. Existing
overloads must remain an identical prefix; appended overloads are compatible when they preserve selection for old calls.
Literal-specialized additions require a return assignable to every prior return,
because TypeScript can prioritize them even when appended.
Reordered or shadowing overloads, changed generics/rest parameters, missing types,
`any`-dependent proofs, unresolved required imports and compiler diagnostics cannot prove
compatibility. The checker reads only retained declarations and installed
compiler libraries, never live repository files or network resources. Bounded local imported context is described below.

These changes remain in the ChangeSet and participate in its semantic hash,
but produce no `CHANGED_REFERENCE`. Other unproven signature changes remain
review candidates. Aggregate class/type/member compatibility is not inferred.

## Local imported context

The JS/TS discovery adapter version `1.5.0` additionally retains module metadata
`signatureContext`: printed import/export declarations and interface/type-alias
syntax and unsupported-type-name sentinels, with comments removed and no function or class bodies. Class, enum and import-equals sentinels only reject unsupported references; they never supply a type. Namespace/ambient-module context is unavailable. An empty context is an empty string; unavailable or larger than 64 KiB context is null. Package metadata `signatureEntryPoints` retains explicit
manifest exports (types/import/default precedence), or types/typings/main when
exports is absent, bounded to 64 KiB and eight nested condition levels. No checker or cross-module type traversal
runs during indexing. This metadata participates in snapshot semantic identity;
legacy snapshots remain readable and missing context cannot establish an imported proof.

A changed callable with retained module context traverses its own
snapshot's retained declarations. Relative source imports and explicit local
workspace entrypoints can resolve named type imports, aliases and named or
wildcard re-exports with an explicit module specifier. Only reachable type declarations enter the compiler proof;
unused imports do not require resolution. Resolution must find one source
module and one export. A removed or unresolved dependency is never replaced by
head context when proving the base. External package types, default/namespace
imports, classes, declaration merging, ambiguous exports and unsupported
entrypoint conditions/patterns remain unproven when needed by the proof.

Per snapshot side, traversal is bounded to depth 8, 32 modules and 256 KiB of
retained context; the expanded proof is also bounded to 256 KiB. Cycles terminate
through visited declarations; compiler diagnostics still reject invalid cycles.
Over-budget or missing context retains the review finding. This is deliberately
incomplete compatibility evidence, not acceptance or a repository-wide type check.

### Conditional direct heritage of an opaque external base

A narrow declaration-only fallback recognizes a single nongeneric callable whose
parameters have explicit types and are exactly unchanged, with old return `B` and new return `X`, where
`X` is a locally declared nongeneric `interface X extends B`. There must be one
direct base without type arguments; the named import of `B` has the same local
name, exported name and module specifier on both sides, and existing import
bindings and retained local parameter type declarations are unchanged. This
fallback applies only to an opaque external package, not a failed local proof.
Generics, intersections, indirect inheritance and changed import bindings remain
unproven.

The ChangeSet marks this declaration relationship compatible and labels head
code evidence exactly **`heritage proof (assumes head compiles)`**. This is
conditional evidence: it assumes the head TypeScript declaration is valid, and
does not resolve or claim compatibility of any external member types. The
engine does not run a full repository type check or establish that assumption.
Consumers requiring fully checked compatibility must distinguish this evidence
label from the bounded compiler proof. The change and label participate in
semantic identity; the existing ChangeSet evidence shape is reused.

Traversal does not rehash callables or initiate compatibility analysis for a dependency-only change without a changed callable hash.

The retained context implementation lives in [signature-context.ts](../../src/discovery/facts/signature-context.ts); the bounded compiler proof lives in [signature-compatibility.ts](../../src/discovery/facts/signature-compatibility.ts). Generated proof names reserve decoded TypeScript identifiers, including escaped names, and owner-module cycles use the same virtual namespace graph as dependencies.
