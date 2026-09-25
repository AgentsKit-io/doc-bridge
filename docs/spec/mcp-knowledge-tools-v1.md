---
title: MCP knowledge tools v1
description: One search and one lookup that answer inside a declared token budget, findings in the shape the ecosystem consumes, and a doctor that measures what retrieval can see.
---

# MCP knowledge tools v1

An agent about to edit `src/mcp` used to need four calls — a search, a handoff, the diagnostics,
the relations — and got back payloads whose size it could only estimate as `contextBytes / 4`.
Two tools now answer that question in one bounded response, the existing tools stay as they are,
and the doctor stops reporting a health it did not measure.

## `knowledge.search`

```json
{ "query": "where do I add a new MCP tool", "kinds": ["document", "area"], "limit": 5, "explain": true, "budgetTokens": 600 }
```

Ranks the retrieval projection with the same `searchIndex` the CLI uses, so with no `kinds` the
`results` are what `ak-docs search <query> --json` prints for the same query and index — a test
compares the two rather than assuming it. Each result adds the entry's `title` and an `excerpt`,
the opening of the projected body. `kinds` filters after ranking, from a deeper ranking, so the
order never changes and a filtered call still returns up to `limit`. `explain` attaches the
matched terms and every score component, as on the CLI.

## `knowledge.lookup`

```json
{ "id": "area:src/mcp", "depth": 1, "budgetTokens": 900 }
```

Accepts an entity id, an ownership id, an alias or a `path`, through the same resolution
`handoff.resolve` uses. One response carries:

| Section | What it is |
| --- | --- |
| `entity` | id, kind, path, title, summary, aliases, symbols, tags, provenance, confidence, content hash, ownership, area, package, PageRank |
| `neighbours` | every entry within `depth` hops, grouped by relation kind (`covers`, `mentions`, `links-to`, `imports`, `contains`, …), each with direction, confidence, distance and the entry it was reached through |
| `documents` | the documents that `cover` the entity and those that `mention` it, most canonical first |
| `handoff` | exactly what `handoff.resolve` returns for the entity, `related` included |
| `diagnostics` | the open diagnostics of the latest reconciliation report that name the entity or point at its file, with the report hash — or `reportHash: null` when no workflow run exists |
| `evidence` | the entity's path and content hash, then those of the documents about it, each with an `excerpt` |

`contains` is not a projection edge — it is hierarchy — but an agent asking about an area wants its
modules listed, so the lookup synthesises it from `areaId` and `packageId`. Neighbours are
bounded per relation kind and visited in sorted order, so two lookups over the same projection
produce the same response. `depth` is at most 3.

`format: "text"` on either tool renders the same payload as prose through
`formatRetrievedDocuments`, for clients that prefer it.

## Budgets

When `budgetTokens` is present, both tools and `handoff.resolve` trim through `compileBudget`:
each droppable section becomes a message, oldest first in the order it may be dropped, the payload
with every section removed becomes the last message, and `drop-oldest` with `keepRecent: 1` sheds
sections from the front until the rest fits. The declared order is

```
evidenceExcerpts → related → neighbours → summaries
```

and nothing else is ever dropped: the entity, the evidence paths and hashes, the handoff fields an
agent acts on and the open diagnostics survive every budget. A payload whose undroppable core
still exceeds the budget reports `fits: false` with every section dropped, rather than truncating
what it may not drop. A section a payload does not have — search has no `related`, a handoff has
no `neighbours` — is absent from the report, never reported dropped.

```json
{
  "budget": {
    "budgetTokens": 900,
    "tokens": { "total": 790, "budget": 900, "core": 684, "sections": { "evidenceExcerpts": 59, "related": 290, "neighbours": 229, "summaries": 106 } },
    "fits": true,
    "order": ["evidenceExcerpts", "related", "neighbours", "summaries"],
    "kept": ["summaries"],
    "dropped": ["evidenceExcerpts", "related", "neighbours"],
    "tokenMethod": "approximate"
  }
}
```

Tokens are counted with `approximateCounter` — four characters per token plus two per message,
over the serialised sections — and reported as `tokenMethod: "approximate"`. `compileBudget` and
`approximateCounter` are mirrored in `src/budget/compile.ts` because `@agentskit/core` is an
optional peer and every query surface answers with no peer installed; a test runs the real
`compileBudget` over the same messages and asserts the two agree on every token count, every
dropped message and `fits`. On a handoff the droppable sections are `related` and the note that
repeats the target's summary; `budget` is an optional field of `AgentHandoffV1`, so a budgeted
handoff is still a valid handoff.

## Every existing tool keeps working

`handoff.resolve`, `doc.search`, `doc.get`, `gate.status`, `retriever.query`, `memory.*`,
`registry.topology` and `docbridge.*` keep their names, arguments and payloads. `handoff.resolve`
gains an optional `budgetTokens`; `docbridge.diagnostics` gains an optional `format`. The new tools
are appended to the advertised list and to the configuration's `surfaces.mcp.tools` default, so a
configuration that names its tools explicitly is unchanged until it names them.

## Canonical findings

```
ak-docs check --json --format finding
docbridge.diagnostics { "format": "finding" }
```

Both emit every reconciliation diagnostic as a `Finding` from `@agentskit/core/finding`, with
severities drawn from `SEVERITY_ORDER`, so Code Review and dashboards read Doc Bridge with no
parser of their own. Internal severities map `error → high`, `warn → medium`, `info → low`,
`off → info`; nothing is `critical`, because a documentation finding never takes a system down.
`title` is the code as words, `detail` the message, `category` the status, `location` the first
evidence path and line, `ref` the code, and `metadata` carries the internal code, status,
severity, evidence and entity ids, so nothing is lost. `confidence` follows the status: an
observed relation is certain, a stale declaration less so, a coverage gap least of all. Findings
are ordered most severe first and by id within a severity.

This is a reporter, not a migration: `KnowledgeDiagnostic`, `RuleFinding` and
`DocumentationAuditFinding` keep their shapes, and the rule verdict still decides the exit code
of `check`. A test imports the real package and asserts assignability and the severity order.

## The measured doctor

Three dimensions join the score and can lower the grade:

| Dimension | Measures | Points |
| --- | --- | --- |
| Reachability | the share of the snapshot's document entities present in the retrieval projection | 15 |
| Connectivity | the mean of: areas with at least one covering or mentioning document; documents with at least one edge into code | 15 |
| Benchmark | hit@3 over the golden suite at `retrieval.benchmark.suite` (`docs/bench/retrieval-suite-v1.json` by default) | 10 |

The existing dimensions — index present and fresh, agent docs, human guides, gates — make up the
other sixty. A repository with no golden suite reports the benchmark as `not-analyzed`, scores
nothing for it and says so in the issues; it is never silently omitted.

An A requires all three: reachability at 100 percent, connectivity at 80 percent or more, and a
measured hit@3 of 80 percent or more. A score of 90 that misses one of them is a B, and the text
report says which. Reachability must be complete because a document retrieval cannot find is a
document the product does not deliver; the other two have a floor rather than a ceiling.

On this repository every document is in the projection and the benchmark is at 88.3 percent, but
20 of 39 areas have no document about them and 55 of 100 documents do not point at code —
connectivity 47 percent, grade B. That is the honest state. A test proves the other direction on
the same repository: one document out of the projection is enough to lose the A, and an index
with no projection at all — what the builder produced before the corpus projection — is at zero.

The doctor's `ok` is unchanged: it is still "no error-severity issue and the gates pass", so a
CI step that runs `ak-docs doctor --text` fails on a stale index, not on a B.
