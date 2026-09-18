---
type: module
id: doc-bridge-lib
editRoot: src/lib
humanDoc: /docs/POSITIONING
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/lib
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/lib
---

# Lib

Owns the small shared helpers the rest of the tree depends on. Nothing here reaches back into a feature
area, which is what keeps it importable from anywhere.

`bounded-text.ts` caps reads at `MAX_DOCUMENT_BYTES` (4 MiB) per file and `MAX_CORPUS_BYTES` (64 MiB)
per corpus, both overridable per call — the budget is enforced while reading, not checked afterwards.
`static-js-literal.ts` exports `parseStaticJsObject`, which is how a `.ts`/`.js` config becomes an
object without being executed; comment stripping is a step inside it, not its purpose.

`fuzzy-match.ts` implements Jaro-Winkler mirrored from `@agentskit/core` rather than imported, so
discovery stays synchronous and never loads an optional peer. `paths.ts` normalises to POSIX and checks
containment within the project root; `walk.ts` traverses by extension; `glob-expand.ts` turns workspace
globs into directories; `markdown.ts` reads frontmatter; `package-manager.ts` detects the package
manager from lockfiles and builds the matching check commands.
