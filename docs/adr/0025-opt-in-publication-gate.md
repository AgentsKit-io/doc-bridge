---
title: Opt-in publication gate for pending reference findings
status: accepted
date: 2026-10-14
owner: maintainers
lifecycle: active
sourceOfTruth: src/gates/reference-findings.ts
validationPath: pnpm vitest run tests/publication-gate.test.ts tests/publication-gate-mcp.test.ts tests/cli-controls.test.ts --maxWorkers=2
---

# Opt-in publication gate for pending reference findings

Amends [ADR 0015](0015-advisory-action-and-ci-built-index.md).

## Context

ADR 0015 keeps the advisory separate from blocking gates. It rejects turning advisory findings into
an implicit blocking gate, because that changes configured policy without consent. Since then no
gate has looked at findings: `ak-docs diff` exits 0 with findings present, and only the Action's
`fail-on-findings` input turns the advisory's `pendingCount` into a failed step.

That leaves one gap. `ak-docs index` writes `llms.txt`, the index and the capabilities file, which
are the context agents read. It writes them even when the documentation still cites code that the
change removed or changed. A maintainer who wants agents to never receive that context has no way
to say so.

## Decision

Add a `reference-findings` gate that a maintainer turns on explicitly. Blocking is a choice the
maintainer makes in configuration. Doc Bridge never infers it.

- **Default off.** No preset selects the gate. It runs only when `gates.include` names it, and
  `gates.exclude` still removes it. A `gates.referenceFindings` block alone enables nothing.
  Repositories that do not opt in see no change in behaviour.
- **Same count as `fail-on-findings`.** The gate discovers the head, runs the same snapshot diff
  the advisory runs against `gates.referenceFindings.base`, and keeps the same findings
  (`BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE`, `CHANGED_REFERENCE`, minus findings whose citing
  documentation was updated in the same change). It fails while that count is above zero. The
  advisory and the gate share one function for this selection, so the two counts cannot drift
  apart.
- **Base is a snapshot file.** `base` names a discovery snapshot (`ak-docs action snapshot`, or the
  `snapshot` of `ak-docs discover --json`). We did not accept a Git reference: it would make the
  gate check out and analyse another revision. `action snapshot` already does that job, with
  exact-revision provenance.
- **Fails closed.** A selected gate with no base, a base that cannot be read, a file that is not a
  snapshot, or a diff that cannot run is a failure with a message saying what to fix. It never
  passes in silence.
- **`ak-docs index` respects the gate.** When the gate is selected and fails, `index` writes
  nothing (no index, no `llms.txt`, no capabilities file), exits 1 and prints the findings, one line
  each: code, document, line and target. `ak-docs gate run` prints the same short list, and its JSON
  output carries every finding in full. `index --watch` skips each rebuild while the gate fails.
- **Explicit override.** `ak-docs index --allow-pending-findings` publishes anyway. The index then
  records the override in `publication.pendingReferenceFindings` (pending count, base revision,
  reason), and the capabilities file records the same thing. This provenance is outside
  `contentHash`, so `index-freshness` still compares content only. The override does not carry over
  to later runs: the next `index` without the flag is blocked again, and the next unblocked
  publication drops the record.
- **MCP warns, never blocks.** `ak-docs mcp` reads the index already published. On start it warns
  on stderr when the gate is selected and failing, then serves as usual.

### Relation to `fail-on-findings`

`fail-on-findings` stays as it is. It is an Action input that fails a CI step on the advisory's
`pendingCount`, and it never stops anything from being published. The gate is a repository
policy that every surface running gates honours (`gate run`, `doctor`, the Action's gate step), and
`index` checks it before publishing. A repository can use either, both, or neither. Both read one
count, so they agree.

## Alternatives considered

- **Count findings in an existing gate, or add the gate to a preset.** This is the implicit
  blocking that ADR 0015 rejected.
- **Pass when no base is configured.** A misconfigured gate would look like a passing one.
- **Block `ak-docs mcp`.** The server only reads what was already published. Refusing to start
  would take context away from agents without stopping a single bad publication.
- **Make the override persistent.** One forced publication would turn the gate off quietly.

## Consequences

- The gate does a full local discovery and diff, which costs about as much as `ak-docs diff`.
  Repositories that do not select it pay nothing.
- Snapshots taken under the service profile (`action snapshot`) and local discovery share a project
  identity when the root `package.json` names the project. When the identities differ, the diff
  refuses them and the gate fails closed with that reason.
- `ak-docs action index --index-source ci-built` reports the gate like any other selected gate. Its
  ephemeral exports are unchanged by this ADR.
