# Knowledge Engine Runbook

Doc Bridge is deterministic by default. It turns repository structure and Markdown declarations into versioned snapshot, reconciliation, rule, report, and workflow artifacts. Optional Registry assistance is explicit and never changes deterministic results.

## First run

```bash
pnpm install
pnpm build
ak-docs discover --json
ak-docs scan --json
ak-docs reconcile --json
ak-docs check --json
ak-docs map --html --output .doc-bridge/report.html
```

Expected artifacts are under `.doc-bridge/workflow/`: `manifest.json`, immutable stage artifacts, `transitions.jsonl`, and `last-known-good.json`. The HTML report is standalone and can be opened directly without a server or network.

## Safe fixes

```bash
ak-docs fix propose links --output .doc-bridge/proposal.json
ak-docs fix approve .doc-bridge/proposal.json --by human
ak-docs fix apply .doc-bridge/proposal.json
```

Proposal generation never changes project files. Approval is bound to the exact proposal and affected-file hashes; apply rejects drift and rolls back on failure.

## Optional Registry assistance

Install the configured local Registry agent, then configure a local runner module:

```bash
npx agentskit add ecosystem-doc-bridge-corpus-scanner
ak-docs suggest --json
```

Set `intelligence.registry.enabled: true` and `runnerModule` in `doc-bridge.config.json`. The runner receives redacted immutable snapshot/report/evidence context and must return `AgentProposalV1`. Network, shell, direct file mutation, and automatic approval are not available.

## Recovery and CI

Rerunning an unchanged command reuses valid stage artifacts. A changed source revision, configuration hash, or tool version creates a stale/superseding run. CI can use `ak-docs check --json`; non-zero rule findings fail the command while unsupported analysis is reported as explicit coverage.

The first implementation analyzes JavaScript/TypeScript and Markdown. Other languages should add analyzers that emit the same canonical entity, relation, evidence, coverage, and hash contracts.

## Relation coverage policy

Agent documents under the configured `corpus.agent.root` may use the conventional
`packages/<name>.md` or `apps/<name>.md` path to declare package coverage without a
`humanDoc` field. This is intentionally separate from the human bridge: `humanDoc`
still reports whether an agent has a resolvable human-facing guide.

Missing declarations are configurable because not every implementation import is useful documentation. In the root configuration, `reconciliation.scope` selects the semantic comparison level while `reconciliation.requiredRelationKinds` selects the observed relation kinds that must be declared in Markdown. Raw file relations remain available in the snapshot and report for evidence and exploration:

```json
{
  "reconciliation": {
    "scope": "package",
    "requiredRelationKinds": ["imports", "re-exports", "depends-on"]
  }
}
```

Omit the option to preserve the original all-relation behavior. Use an empty list for low-friction adoption when package/app coverage and explicitly declared claims matter more than documenting every module, test, or external-library import. Existing declarations are still checked for stale, conflicting, and unresolved references.

Package health is not inferred from coverage presence alone. A covered package
is `fresh` only when its relevant relations are verified; undocumented or
not-analyzed relations make it `unverified`, while conflicting declarations
make it `stale`. This prevents a high-level coverage document from hiding a
large architecture/documentation gap.

The reconciliation summary also includes deterministic `diagnosticsByCode` and
`diagnosticsByStatus` rollups. Use them for triage and dashboards, but keep the
canonical diagnostics and their evidence as the source of truth.
