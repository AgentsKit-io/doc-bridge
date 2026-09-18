---
type: module
id: doc-bridge-report
editRoot: src/report
humanDoc: /docs/for-agents
owner: doc-bridge-maintainers
lifecycle: active
sourceOfTruth: src/report
validationPath: pnpm test && pnpm typecheck
docbridge:
  covers:
    - area:src/report
---

# Report

Owns the offline HTML report: a snapshot and its reconciliation rendered into something a person can
open without a server, an index, or the CLI. One file, `html.ts`.

The exported surface is `renderOfflineReport` and `renderOfflineReportArtifact`, taking
`OfflineReportInput` and `OfflineReportOptions` and returning an `OfflineReportArtifact` — a single
self-contained page, or a directory of files with a manifest for an artifact store. The view model it
renders from is built internally and is not part of the API; the artifact shape is.

Options cover privacy (private and anonymised modes) and whether snippets are embedded, because a
report is the one output likely to leave the repository and land in a CI artifact or a ticket. Large
graphs are chunked per group and package so the page stays openable.
