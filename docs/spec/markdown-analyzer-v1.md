---
title: Markdown analyzer v1
description: What Doc Bridge reads from a Markdown document, and the relations it observes from prose.
---

# Markdown analyzer v1

Documentation is parsed with remark (CommonMark plus GFM), not with regular expressions, so a
document's own prose becomes evidence. Every relation below is `observed` and carries the file and
line the claim was made on.

| Relation | From → to | Observed from |
| --- | --- | --- |
| `links-to` | document → document | a relative link that resolves to a scanned document |
| `mentions` | document → module or package | inline code or link text equal to a scanned path or a package name |
| `mentions-symbol` | document → module | inline code equal to an exported name of exactly one module |
| `covers` | document → anything | a `docbridge` declaration, unchanged |

A symbol resolves to the module that **declares** it, never to a barrel that re-exports it. When
two modules declare the same name the reference resolves to neither: the tokens and their lines
are reported as a `markdown` coverage note instead, because sending an agent to one of two
possible definitions is worse than sending it nowhere. The same rule governs near-misses — an
unresolved path-shaped reference is matched with Jaro-Winkler and accepted only at 0.92 or above
*and* with a single candidate, recorded as `metadata.confidence: "fuzzy"`.

Document entities gain what the parser can see: `title`, headings to depth three with their
lines, a bounded `summary`, `wordCount`, the frontmatter subset (`type`, `audience`, `owner`,
`lifecycle`, `tier`), any generated regions, and the file's `contentHash` on its evidence. A
document declaring `audience` overrides the path heuristic that classifies it; `type` overrides it
only when it names an audience, since in practice `type` names a document kind.

Each cited symbol has a distinct relation identified by
`relationId(documentId, 'mentions-symbol', moduleId, symbol)`, with the cited name in
`metadata.symbol`. Repeated citations accumulate at most eight evidence locations on that
symbol's relation. Unresolved tokens produce no dangling relation and do not prove removal.

Ambiguous symbols also appear on the document entity in `metadata.ambiguousSymbolReferences`:
a symbol-sorted array of `{ symbol, candidateModuleIds, candidateCount, lines }`. Names are
bounded to 256 characters; candidate IDs are sorted and bounded to 32, while `candidateCount`
retains the true total. Citation lines are sorted and bounded to eight. At most 64 entries are
retained; exceeding that bound sets `metadata.ambiguousSymbolReferencesTruncated: true`.
The existing human-readable coverage note, scope and citation evidence remain unchanged.
These fields use existing open metadata records; strict snapshot, index and handoff envelopes
are unchanged. Retrieval and graph importance count unique document/module connections rather
than increasing a module's importance for each cited symbol.

A document referencing more than 64 relations records `evidenceTruncated` and a coverage note. An
index page's sixty-fifth link is not knowledge, and an unbounded list is not evidence.

## Generated regions

```markdown
<!-- doc-bridge:generated hash=8f79947 -->
…generator output…
<!-- /doc-bridge:generated -->
```

Mentions inside a generated region are ignored, so Doc Bridge never reads its own output back in
as evidence about the repository. An unclosed marker owns the rest of the file. The regions are
recorded on the document entity, which is what lets the audit report a manual edit inside one.

## The `docbridge` block

The block is real YAML validated by a schema, so quoted lists, flow mappings, anchors and
multi-line strings work as they do in every other tool. Schema violations report the field:
`docbridge.relations.0: Unrecognized key: note`. Each `DOCBRIDGE_*` code is preserved — a
repository failing its build on one keeps failing on the same one — and a block YAML cannot read
at all falls back to the line-oriented scanner, because on a mangled block a diagnostic per line
helps the author more than a single parser error.

## The cost of a near-miss

Near-miss resolution is the analyzer's only super-linear step: every unresolved path-shaped
reference is a query against every document, module and area path in the repository. On a monorepo
of 4 100 documents and 9 240 modules the naive form of that — rebuilding the candidate list per
document, then computing Jaro-Winkler against each candidate — did not finish.

Two bounds make it cheap, and both are bounds on Jaro's match count `m` rather than heuristics.
`m` cannot exceed the shorter string, so `jaro ≤ (m/|a| + m/|b| + 1) / 3`; with the prefix bonus
bounded by `jw ≤ 0.6·jaro + 0.4`, a threshold of 0.92 admits only candidates whose length is
within 0.6× to 1.67× the query's. And `m` cannot exceed the number of characters the two strings
share, which one pass over a 128-slot count vector answers, where a similarity computation costs a
pass over one string per character of the other.

Both only ever over-estimate `m`, so a candidate they skip could not have matched: the index is a
speed-up with no effect on results, tied scores included. `MarkdownResolution.pathIndex` carries it,
built once per run; an analyzer called without one builds its own and produces the same output more
slowly.

## Discovery v2 transport

The Markdown built-in v2 plugin shares this analyzer with synchronous discovery.
Acquisition supplies verified scan-local content and generic resolution owners;
Markdown does not read native files or interpret source syntax. Declared versus
forwarded ownership, ambiguous references, document collection, generated regions,
BOM/CRLF normalization and bounded note ordering are unchanged. Documentation
hashes retain the BOM-stripping Markdown codec even when the storage content
reference uses the source/configuration codec. The built-in registry validates
that distinction against issued bytes. Caller-provided symbol fact owners may
join the resolution universe without adding a language branch to Markdown.
