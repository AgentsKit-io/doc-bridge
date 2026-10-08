---
owner: maintainers
lifecycle: active
sourceOfTruth: src/discovery/obsidian.ts
validationPath: pnpm vitest run tests/obsidian.test.ts --maxWorkers=2
---

# Obsidian Markdown v1

This opt-in discovery mode supports the shared Obsidian, Foam and Logseq
wikilink syntax, without network calls. Application-specific queries, page
properties and rendering extensions are not interpreted.

## Configuration and ownership

Configure `corpus.human` using the same root, include, exclude and `urlPrefix`
options as `plain-markdown`:

```json
{ "plugin": "obsidian", "options": { "root": "notes", "include": ["**/*.md"] } }
```

The root defaults to `docs`; `contentDir` and `docsDir` are existing root aliases.
Only files inside each configured corpus participate in that corpus's resolution.
Multiple corpora are independent. Other documents retain ordinary Markdown
analysis; without an `obsidian` corpus, discovery and index behavior are unchanged.

The document stage follows [discovery plugins v2](discovery-plugin-v2.md), owning
each document once. `createObsidianPluginV2()` exposes that stage for a
caller-managed registry; it replaces the standard Markdown stage, rather than
being appended after a plugin that already owns documents. The caller still
supplies corpus configuration. Repository discovery selects it from
`corpus.human`; configuration never loads executable plugins.

## Parsing and resolution

`@flowershow/remark-wiki-link` parses `[[target]]`, `[[target|alias]]`,
`[[target#heading]]`, `[[target#^block]]` and `![[embed]]`. Resolution uses its
source target, never its rendered href. Inline/fenced code is excluded by the
syntax tree. Callouts remain normal blockquotes.

Resolution precedence:

1. Exact case-sensitive corpus-relative path, optionally suffixed `.md` or `.mdx`.
   Explicit `./` and `../` resolve from the source document's directory and cannot
   leave the corpus. A fragment-only target addresses the source document.
2. One unique basename within the corpus.
3. One unique frontmatter alias within the corpus.

An ambiguous stage stops resolution. Missing/ambiguous targets emit no relation
and produce `UNRESOLVED_WIKILINK` / `AMBIGUOUS_WIKILINK` coverage diagnostics with
source path and line. Failure does not prove a broken reference. Heading/block
fragments are retained as document citations; this version does not assert that
the referenced heading or block exists.

Resolved links and Markdown embeds produce observed `links-to` relations using
the existing `(document, kind, target document)` identity, including self-links.
Repeated references aggregate up to eight evidence locations and
`metadata.references` entries: target, line, embed status, optional display alias
and fragment. Non-Markdown embeds populate `metadata.assetEmbeds`, without a
document relation or asset existence claim.

Frontmatter `aliases`, a string or string list, populate existing entity and
retrieval aliases without replacing path-based IDs. Frontmatter `tags` and inline
`#tag` outside code populate document `metadata.tags` and retrieval tags. Nested
tags retain `/`; a leading frontmatter `#` is removed. `metadata.markdownSyntax`
identifies these documents as `obsidian`; other metadata tags keep their existing
retrieval behavior. Aliases are bounded to 32
entries of at most 256 characters; metadata tags and asset embeds to 64 entries.
Retrieval retains its existing 32-tag limit, preserving built-in tags first. Ordering
is deterministic. Vault document relation reuse is disabled because another
document's aliases can change resolution without changing the referring document.

## Exclusions and compatibility

Safety exclusions, including `**/*secret*` and `**/*credential*`, still prevent
reading contents. Local discovery reports up to 32 excluded Markdown filenames
visible in the directory walk as `EXCLUDED_VAULT_FILE` coverage diagnostics.
Readers that hide excluded names report `EXCLUDED_VAULT_INVENTORY_UNAVAILABLE`
as `not-analyzed`; they do not claim an empty inventory. Directories excluded by
secret/credential names report `EXCLUDED_VAULT_DIRECTORY`; their contained names
are not enumerated. Ignored paths and symlinks remain outside acquisition.
Inventory overflow reports `EXCLUDED_VAULT_INVENTORY_TRUNCATED`, with an omitted
repository-path count, rather than claiming complete exclusion coverage.

Caller-managed v2 registries also receive these codes in `diagnostics` with
reader-issued evidence hashes. Repository diagnostics use existing snapshot coverage, preserving strict
`DocBridgeIndexV1`, `DiscoverySnapshotV1` and `AgentHandoffV1` serialization.
Enabled snapshots include the `obsidian` analyzer version. Existing hash
algorithms and IDs remain unchanged; syntax/metadata affect hashes only when
this mode is configured.
