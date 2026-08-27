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
