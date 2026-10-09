---
title: Knowledge entity contract v1
description: Deterministic decisions, concepts and changes with bounded source evidence.
---

# Knowledge entity v1

`KnowledgeEntityV1` records observed documentation and history, separately from
the human approval `DecisionV1`. It never asserts approval or implementation of
a documented decision. Extraction is deterministic and local, without providers
or network access.

Public API: `extractKnowledgeEntities` in `src/entities/extract.ts`; runtime
validation and exported TypeScript types come from `src/schemas/knowledge-entity.ts`.

## Shape

`KnowledgeEntitiesV1` contains `schemaVersion: 1`, `entities` and `coverage`.

| Entity field | Meaning |
| --- | --- |
| `schemaVersion` | `1` |
| `id` | Stable repository-local identity, at most 256 characters |
| `kind` | `decision`, `concept`, or `change` |
| `name` | Observed title, term, changelog entry or commit subject; at most 256 characters |
| `aliases` | Up to 32 exact declared aliases |
| `evidence` | One to 64 document regions, commits or facts |
| `links` | Up to 64 typed targets |
| `status`, `date` | Optional ADR frontmatter declarations, not validation |
| `conventional` | Optional commit `{type, scope?, breaking}` |

Evidence is a discriminated union:

- `{kind: "document-region", path, lineStart, lineEnd, regionHash}`: relative path,
  inclusive one-based lines, SHA-256 of exact UTF-8 region bytes including source
  LF, CRLF or legacy CR line endings and intervening blank lines.
- `{kind: "commit", sha}`: full local commit object ID.
- `{kind: "fact", factId}`: entity ID from the input discovery snapshot.

Links contain `{kind, target, symbol?}`. `affected-path` targets a cited or touched
relative path; `affected-fact` targets a snapshot entity; `defines-symbol` targets
a unique exact symbol owner. Legacy module export facts retain the precise name
in `symbol`, with the module ID as `target`. `supersedes` and `superseded-by`
target extracted decision IDs. Ambiguous/unresolved owners get no arbitrary link.

## Extraction and identity

ADR files under `adr`, `adrs` or `decisions` layouts, and documents with `type:
adr` or `type: decision`, produce one decision per document. Frontmatter supports
`status`, `date`, `supersedes` and `superseded-by`. Common explicit Status/Date
paragraphs or list metadata in the first 40 lines are supported when frontmatter
does not supply the value. Supersession paths are relative
to the ADR and resolve only to other extracted ADRs. Other documents produce
decisions from explicit Decision/Decisions headings.

Concepts come from glossary/definition headings, definition lists,
`**Term**: definition` and `Term — definition` (also en dash). Concept documents
(`type: concept`, or non-glossary documents declaring aliases) bind frontmatter
aliases to their principal title. Multi-term glossary aliases remain unbound,
with partial coverage. They are never applied to every term. Exact names merge
evidence; symbol matching is case-sensitive and exact, including aliases.
Declaring exports take precedence over forwarding modules, matching discovery.
Multiple owners remain ambiguous.

Changes come from individual changelog list entries under release headings and
local first-parent commits. Merge paths are compared with the first parent;
side-branch commits are not separate entries. Conventional types/scopes, `!`
and `BREAKING CHANGE`/`BREAKING-CHANGE` footers are retained. Exact touched paths
link current facts; removed paths stay path evidence without invented facts.

Decision IDs bind document path/title (and occurrence for repeated explicit
sections); concept IDs bind the exact term; changelog IDs bind path/entry title
and release heading; commit IDs bind SHA. Region movement preserves the ID and
updates lines; evidence edits update region hashes. Renames are never inferred.
IDs use discovery's bounded identity helper. Entities, evidence and links sort
canonically.

## Bounds and coverage

Limits are 10,000 documents, 4 MiB/document, 64 MiB of document text, 16 KiB/entity
region, and 10,000 entities. Documents reuse bounded discovery/read inputs.
Per-document traversal retains at most 8,192 root nodes, 128 headings and 4,096
citation references; truncation is partial coverage.
Fences do not create definitions; regions intersecting generated content are
omitted with partial coverage. Oversized regions, unread documents, invalid
frontmatter, unresolved supersessions, ambiguity and capped arrays are explicit
`partial` coverage, never silently complete analysis.

History defaults to 50 commits; `maxCommits` allows 1–200. Optional `sinceTag`
must name a local tag resolving to an ancestor of HEAD.
Git transport and lazy object fetching are disabled; missing local objects stay
unavailable. Commit text and NUL-delimited changed paths are read separately, so
commit prose cannot become path evidence. Renames preserve both touched paths
without asserting semantic rename identity. Commands have a 1 MiB
output bound and 10-second timeout; the detail loop checks a 10-second budget
between commits. A commit's two in-flight commands can extend that budget by
at most 20 seconds; tag/window acquisition commands have the same individual bound.
Window/cost cutoffs are `partial`; unavailable history, unknown tags or command
failures are `not-analyzed`. Stored inputs never consult local git. Coverage
describes only supported patterns and the configured window, not all knowledge
or all history.

## Index compatibility

`index.knowledgeEntities.enabled: true` explicitly emits `knowledgeEntities` on
`DocBridgeIndexV1`. Default is off, including the 2.0-next boundary. Disabled
settings are removed before building, preserving existing serialized output.

Opt-in requires `sha256-semantic-v1`; legacy hashing rejects the combination.
Readers and the hash API also reject a manually attached unsealed legacy section.
The semantic hash includes entities and coverage. Since history changes can
leave file bytes unchanged, opt-in local freshness uses a full deterministic
rebuild. Handoff emission remains unchanged.

New readers accept legacy indexes; old strict readers reject the opt-in section.
Callers must choose compatible readers before enabling it. Unknown capability
and default configuration receive no section. The existing service allowlist
disables this option. Standalone stored builds can extract captured documents
and explicitly report unavailable history.

## Validation

`pnpm exec vitest run tests/knowledge-entities.test.ts --maxWorkers=2` exercises
real local merge/tag windows, exact hashes, stable IDs, aliases, ambiguity,
generated/fenced exclusions, cost coverage, index compatibility and seals.
Repository gates exercise the default-off real CLI index.
