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

A document referencing more than 64 entities records `evidenceTruncated` and a coverage note. An
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
