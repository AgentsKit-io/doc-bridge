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
| `mentions-symbol` | document → module | inline code or an exact fenced identifier equal to an exported name of exactly one module |
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

A document referencing more than 64 legacy relations records `evidenceTruncated` and a coverage note. An
index page's sixty-fifth link is not knowledge, and an unbounded list is not evidence.

Non-symbol fact citations (`metadata.factKind`) have a separate bounded cap of
64 per document. They never consume or displace the legacy relation cap.
Exceeding it records `factReferencesTruncated` (without changing legacy
`evidenceTruncated`) and a distinct `fact-relations:<path>`
coverage note. Repeated citations still share the existing eight-location bound.

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


## Generic codec fact citations

The built-in Markdown v2 plugin resolves codec-backed `symbol`, `cli-command`,
`cli-flag`, `config-key`, `signature` and `package` entities without interpreting
source syntax. Package facts are cited by purl. Exact repository paths take precedence, then
codec facts, legacy package names and exports, and finally fuzzy paths. A token
matching both a legacy export and a codec fact resolves through codec facts.
Symbol facts retain `metadata.symbol` and existing symbol relation IDs.
Other facts resolve independently by kind and exact name: one owner produces a
`mentions-symbol` relation to `ownerId` with `metadata.factKind` and
`metadata.factName`; multiple owners produce no relation for that kind.
Different kinds sharing a token are evaluated in sorted kind order.
The relation discriminator is `${factKind}:${factName}`; repeated citations
accumulate at most eight documentation evidence locations.

Configuration facts use an isolated citation index: only dotted paths match,
and source/document package and fixture boundaries must agree. Bare keys produce
no config relation. Relations retain canonical dotted `metadata.factName`.
See [configuration key facts](config-key-facts-v1.md).

Generic ambiguity uses document `metadata.ambiguousFactReferences`, an array of
`{ factKind, factName, candidateOwnerIds, candidateCount, lines }` sorted by
kind/name. Names are bounded to 256 characters, sorted owner IDs to 32, sorted
citation lines to eight and entries to 64. The true owner count is retained;
additional entries set `metadata.ambiguousFactReferencesTruncated: true`.
A partial coverage note also records ambiguity. Snapshot, index and handoff
schemas remain compatible through their existing open metadata records.

Markdown analyzer version `1.2.0` introduces an independent 64-relation fact
citation cap for every fact kind. Fact citations cannot consume or displace the
legacy relation cap; legacy relation identities and evidence remain unchanged.
The v2 plugin parses documents afresh; the synchronous shared fact hook binds
the fact universe into its resolution fingerprint before reusing document relations.

### Qualified CLI citations

CLI commands require an exact declared-bin-prefixed command path in inline code, such as
`doc-bridge report`; an unqualified common word such as `report` is not a CLI
citation. Command prefixes are matched exactly against codec facts. In shell
fences (`sh`, `bash`, `shell`, `zsh`, `console`), the first word of a line must
be an exact known bin; root commands may also be cited there. Every declared
bin alias qualifies independently. Package-runner prefixes accept `npx`
(optionally `-y` or `--yes`), `pnpm` (optionally `dlx` or `exec`), `yarn`
(optionally `dlx`) and `bunx`, followed by a known bin or indexed package name.
Package versions are stripped. When all normalized entry paths identify one executable, a package maps to
one canonical alias: its unscoped package name if present, otherwise the
lexicographically first alias. Declaration key order does not affect resolution; with distinct entry paths,
only the bin matching its unscoped package name qualifies. Indexed package
metadata retains the manifest `cliBin` declaration for historical revalidation.
Direct bin citations remain exact for every alias; package invocations produce
one executable citation rather than duplicate alias findings. Package-name
mapping requires `npx`, `pnpm dlx`/`exec`, `yarn dlx`, or `bunx`. Unresolved
package mappings produce no citation or finding. Shell expressions,
prompts, scripts for unknown executables and ordinary prose do not qualify.
Only whitespace-delimited dash-prefixed flag tokens are candidates; `--flag=value`
is normalized to `--flag`. Short aliases resolve through their own facts.
Flags following a matched invocation resolve only against that command's
prefix owners, including its root command. Inline root-bin invocations with
flags also qualify. Standalone inline dash-prefixed flags retain exact fact
resolution. Competing owners within the matched context retain bounded ambiguity;
an unrelated bin gaining the same flag does not make a qualified citation ambiguous.

CLI lexical tokens are kept separately from ordinary inline-code tokens, so
shell examples do not introduce symbol/config/path mentions. Generated regions,
the 64-relation cap and eight citation locations per relation still apply.
CLI relations use the independent fact cap, preserving bounded legacy evidence.
Historical CLI removal findings verify these same normalized tokens and command
owner context. Help-only partial source coverage yields
stale-or-unverified removal candidates rather than proven conflicts.
## Syntactic signature citations

Built-in JS/TS signature facts reuse uniquely resolved exported-symbol citations,
preserving the legacy symbol relation and adding a signature relation to its
module. Class/type citations refer to the aggregate public-member signature.
No new token matching is introduced; existing relation/evidence bounds apply.
See [signature facts v1](signature-facts-v1.md).
The v2 plugin parses documents afresh, so fact-universe changes cannot replay
stale generic references. The synchronous shared fact hook incorporates the
fact universe into the resolution fingerprint before reusing document relations.
Each registered extractor carries its own component analyzer version.

## Document package targets

Markdown analyzer `1.3.0` adds engine-generic frontmatter `docbridge.targets`:

```yaml
---
docbridge:
  targets:
    "pkg:npm/%40scope/name": "0.4.1"
    "pkg:npm/dependency": null
---
```

Keys are canonical unversioned package purls; values are adapter-native ranges,
`vers:` ranges, `default-branch`, or `null`. A null value explicitly names a
package while requesting lock/manifest resolution. This declaration may appear
alone or alongside `covers` and `relations`. Target parsing never adds citation
relations. Each purl resolves independently; one invalid declaration cannot
change another target. Invalid frontmatter, target shape, purl, version or range
stays unresolved with document evidence; it never silently falls through.

For a null declaration, the nearest owning package's codec dependency facts
supply the resolved lockfile version first, then the manifest range when no
lockfile exists. A present unsupported, malformed or missing lock entry stays
unresolved with lock/manifest evidence. No arbitrary global package-name lookup
or sibling workspace importer is allowed. A named purl absent from the owner's
dependencies stays unresolved. Documents without `docbridge.targets` (or an
empty mapping) retain one implicit latest-released metadata target. Cross-package
consumer eligibility uses released deltas; default diff policy treats same-repository
documents without explicit targets or dependency targets on another package as
branch-tracking, including
unreleased deltas. Packages are never silently selected from prose or path alone.

Document entity `metadata.targets` is an array of at most 32 records with
`state` (`resolved`, `unresolved`, `latest-released`, `default-branch`), optional
`purl` (512 characters), optional `range` (512), `source` (`frontmatter`,
`lockfile`, `manifest`, `implicit`), optional `reason` (256), and at most four
existing evidence records. Over-limit input produces one unresolved record;
no truncated target set is treated as complete. Changes in package version
metadata invalidate warm document reuse even if document bytes are identical.

Adapters own `normalizeRange(purl, value)` and `satisfiesRange`. JS accepts npm
ranges/vers and `workspace:*`, `workspace:^`, `workspace:~` or valid npm workspace
ranges; workspace/default-branch targets track unreleased work. Other schemes
require caller-registered adapter normalization hooks; incompatible or multiple
successful hooks stay unresolved/ambiguous. See
[release eligibility](change-set-v1.md#release-stamping-and-eligibility).

## Fenced citations

Only fences tagged `ts`, `tsx`, `js`, `jsx`, `mjs`, `cjs`, `json`, `jsonc`,
`yaml`, `yml` or `toml` contribute symbols/config keys, at most 4,096 citation
tokens per document. Untagged, text, Markdown, diff and other fences are skipped. JS/TS examples use the TypeScript parser: import/export specifiers, calls, constructors,
JSX tags, type references, and bare value identifiers in assignments/arguments qualify.
Object keys, ordinary shorthand properties, member property names, strings, template
text and comments never cite exports. Module import/destructuring specifiers qualify.
Configuration fences contribute only dotted paths matching extracted configuration
keys, never exports. Dotted JS/TS member expressions may cite configuration keys only.
Substrings and
fuzzy paths never create fence relations. Only extracted names resolve, with
exactly one owner per kind. Dotted config keys retain package/fixture scoping.
Shell fences (`sh`, `bash`, `zsh`, `console`, `shell`) contribute only CLI
commands/flags, retaining known-bin qualification. Repeated citation lines use the existing
eight-location bound and ambiguity metadata. Fence-only relations carry
`metadata.citationContext: "code-fence"`; their symbol identity remains unchanged
and retrieval excludes them from ranking signals. Existing inline relations
retain their metadata and legacy inline evidence when a fence adds another
evidence line. Same-line evidence deduplication applies only to fence citations. Non-symbol facts use the separate
64-fact citation cap. Generated regions remain excluded.
