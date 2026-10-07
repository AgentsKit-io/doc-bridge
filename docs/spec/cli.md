---
title: ak-docs CLI
description: Complete command reference for indexing, querying, gates, doctor, memory, and MCP.
---

# ak-docs CLI

Command-line interface for **`@agentskit/doc-bridge`**. The package publishes two executables: `ak-docs` is the product CLI and `ak-verify` is the verification-harness wrapper.

## Naming

| What | Name |
|------|------|
| npm package | `@agentskit/doc-bridge` |
| CLI binary | `ak-docs` |
| Verification binary | `ak-verify` |
| Primary config filename | `doc-bridge.config.ts` |
| GitHub repo | `AgentsKit-io/doc-bridge` |

Install the package, run `ak-docs` — not `doc-bridge` on the shell.

The primary filename is shown for readability. Discovery also accepts
`doc-bridge.config.mts`, `.js`, `.mjs`, `.json`, and the `docBridge` field in
`package.json`; see the [configuration contract](./config-v1.md#discovery-order)
for the authoritative order.

## Why a separate binary

| Choice | Rationale |
|--------|-----------|
| **`ak-docs`**, not `agentskit docs` | Dedicated tool; no need for full `@agentskit/cli` |
| **`ak-docs`**, not an OS subcommand | OS CLIs imply sidecar / runs / pipelines |
| **`@agentskit/doc-bridge` package** | Part of AgentsKit npm scope; engine + first consumer alignment |
| **`ak-docs` bin name** | Short, memorable CLI; avoids colliding with package import path |

## Install

```bash
npm install @agentskit/doc-bridge
# or
pnpm add -D @agentskit/doc-bridge
```

```json
{
  "name": "@agentskit/doc-bridge",
  "bin": {
    "ak-docs": "./bin/ak-docs.js",
    "ak-verify": "./bin/ak-verify.js"
  }
}
```

## Commands (v1)

### Layer 0 — no API key

| Command | Description |
|---------|-------------|
| `ak-docs init` | Scaffold `doc-bridge.config.json` + agent INDEX stub |
| `ak-docs init --scaffold-workspaces` | Also create draft `docs/for-agents/packages/*.md` from discovered pnpm workspaces; never overwrites existing docs |
| `ak-docs bootstrap agent-docs` | Create draft `docs/for-agents/human/*.md` from configured human-doc adapters; never overwrites existing docs |
| `ak-docs validate-config` | Zod-validate config file |
| `ak-docs demo [--fixture example\|monorepo] [--text]` | Bundled 60s wow path: handoff, gate red→green, MCP snippet |
| `ak-docs doctor [--text] [--badge] [--write-badge]` | Coverage score, gaps, gates, shields.io badge |
| `ak-docs index` | Build `DocBridgeIndex` + optional `llms.txt` |
| `ak-docs index --watch` | Debounced rebuild on agent/human doc changes |
| `ak-docs query <target> [--agent] [--text]` | Resolve package/area/module/document/intent/change → handoff JSON or text |
| `ak-docs search <term> [--agent] [--explain] [--mode=<mode>] [--context-budget=<tokens>] [--text]` | Ranked search over the retrieval projection; `--explain` names every scoring component and the matched terms, and agent mode bounds the context it returns to a task-specific budget |
| `ak-docs ask <question>` | Human-readable local consult mode: search + best match + next handoff commands; no LLM |
| `ak-docs ask` | Interactive local REPL in a TTY; commands: `search <term>`, `read <id-or-path>`, `open <id-or-path>`, `resolve <id>`, `gate [id]`, `exit` |
| `ak-docs retrieve <query>` | Hybrid local/federated retriever chunks; deterministic local first |
| `ak-docs init --demo` / default | Scaffold demo ownership (`example`) + `AGENTS.md` snippet so `query --agent` works immediately |
| `ak-docs init --no-demo` | Config + empty INDEX only |
| `ak-docs memory ingest` | Normalize local memory files (`.agent-memory/**/*.md`, `.cursor/rules/*.mdc`) into `MemoryCandidate[]` |
| `ak-docs memory classify` | Deterministically route candidates to agent/human/playbook/discard |
| `ak-docs memory promote` | Build draft-only promotion body with safety scan; never auto-merges |
| `ak-docs memory promote --pr --dry-run [--force]` | Write a local draft and print the `git`/`gh` commands; does not execute them |
| `ak-docs memory promote --pr [--force]` | Write the draft, commit/push it, and open a GitHub draft PR via `gh` |
| `ak-docs registry topology` | Print the `doc-curator` topology for AgentsKit/Registry composition |
| `ak-docs suggest [--documentation] --json` | Run the configured Registry agent module or CLI and persist its typed proposal; optionally include the bounded documentation-audit context |
| `ak-docs enrich [--json\|--text]` | Run the enrichment stage: context packs to the configured Registry roles, deterministic validators, the overlay at `.doc-bridge/enrich/overlay.json`. Zero agent calls over an unchanged repository |
| `ak-docs enrich list \| approve <proposalId> --by <name> \| reject <proposalId> --by <name> [--reason <text>]` | Review pending enrichment proposals; a decision is recorded through the ecosystem approval gate under `.doc-bridge/approvals/`, bound to the proposal id and the target content hash |
| `ak-docs check --enrich` | `check` with the `enrich` stage between `reconcile` and `evaluate`; a failed enrichment is reported in `enrichment` and never changes the check result |
| `ak-docs enrich --retrieval-delta [--json\|--text]` | `enrich`, then the golden suite with and without the accepted overlay on the same snapshot. Exits 1 when the overlay lowers hit@3 |
| `ak-docs bench retrieval <suite.json> --overlay [--json\|--text]` | The overlay on disk measured against a suite: both indexes projected from one snapshot, no index on disk required. Exits 1 on a hit@3 regression |
| `ak-docs study expectations <task-suite.json> --expectations <local.json> [--index <index.json>] [--repository <id>]` | Check a study round's mechanical retrieval expectations through the benchmark. Exits 1 when a reference does not resolve or a case misses |
| `ak-docs playbook draft` | Build a draft Playbook feedback payload from local memory candidates |
| `ak-docs playbook pattern [--text]` | Export published Doc Bridge Playbook pattern (OKF markdown / JSON) |
| `ak-docs list <kind> [--text]` | List packages, apps, intents, … |
| `ak-docs gate run [gate-id]` | Run resolved configured documentation gates; an optional id narrows the run to one gate |
| `ak-docs conformance run documentation-standard-v1 [--text\|--json]` | Run the stable ecosystem documentation profile with evidence and remediation |
| `ak-docs audit documentation [--text\|--json]` | Measure documentation quality and compare documentation claims with the observed project graph |
| `ak-docs parity [--claims <file>] [--json\|--text]` | Check the public claim registry against what the repository can prove: stale, missing, contradictory and not-analyzed claims, each with an owner, an exact source and a remediation. Exits 1 on a blocking finding |
| `ak-docs render <llms.txt\|area\|ownership\|change-digest\|overlay-review> [--data <artifact>] [--output <path>] [--print-template] [--json]` | Render the canonical artifacts as Markdown from bundled or project templates (`render.templates`); deterministic, no agent. See [Render v1](./render-v1.md) |
| `ak-docs bench retrieval <suite.json> [--index <file>] [--baseline <file>] [--limit <n>] [--text\|--json]` | Measure retrieval quality against a golden query suite: hit@1, hit@3, mean reciprocal rank, context bytes and approximate tokens. Exits non-zero on a hit@3 regression against the baseline. No model, no network |
| `ak-docs bench retrieval <suite.json> --baseline <file> --update-baseline --by <name> [--reason <text>]` | Record the measured figures as the approved baseline. A normal run never writes one |
| `ak-docs mcp` | Start MCP server (stdio default) |
| `ak-docs mcp install --cursor \| --claude` | Write MCP server config for Cursor or Claude Desktop |

### Layer 1 — optional AgentsKit peers (`intelligence.enabled`)

| Command | Description |
|---------|-------------|
| `ak-docs rag ingest` | Ingest agent corpus into `@agentskit/rag` + file vector store |
| `ak-docs rag search <query>` | Semantic search over ingested vectors |
| `ak-docs chat` | Interactive terminal chat (`@agentskit/ink` + retriever + adapter) |
| `ak-docs ask <question> --chat` | One-shot grounded answer (`handoffFirst` when possible) |

Peers: `@agentskit/rag`, `@agentskit/ink`, `@agentskit/adapters`, `@agentskit/memory`, `react`.

## Global flags

| Flag | Description |
|------|-------------|
| `--config <path>` | Config file (default: auto-discover) |
| `--json` / `--text` | Output format for non-agent commands (default: formatted json); `--agent` emits compact machine-readable JSON, while `--text` remains human-readable |
| `--chat` | Request planned intelligence-backed ask mode; errors clearly until `intelligence.adapter` and RAG/chat support are configured |
| `--help` | Command help |

## Examples

```bash
ak-docs index
ak-docs query ownership auth --agent
ak-docs query ownership auth --text
ak-docs search "sidecar transport" --agent --mode=discovery --context-budget=256
ak-docs list packages --text
ak-docs gate run
ak-docs mcp
```

## MCP server config (Cursor)

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "ak-docs",
      "args": ["mcp"]
    }
  }
}
```

## Programmatic API

```ts
import { buildIndex, query, defineConfig } from '@agentskit/doc-bridge'

export default defineConfig({ schemaVersion: 1, corpus: { agent: { root: 'docs' } } })
```

CLI is a thin wrapper over the same exports.

`MCP_TOOLS` exports the static tool descriptors used by `tools/list`.

## Private Dogfood Alias

```bash
pnpm docs:internal:query …   # private dogfood wrapper → ak-docs query …
```

`ak-docs` is the primary product CLI. `ak-verify` is the portable verification-harness entry point used to prove repository work against a declared contract.

## See also

- [config-v1.md](./config-v1.md)
- [POSITIONING.md](../POSITIONING.md)

## Snapshot diff

```bash
ak-docs diff --base snapshot.json [--head snapshot.json] [--root directory] [--output diff.json] [--json]
```

`--base` is required and both snapshot inputs are validated, including their
versioned hashes. Snapshot files contain the raw discovery artifact, not the
`discover` command's enclosing response. Without `--head`, discovery scans
`--root` or the current project using its configuration and safe defaults when
no configuration exists. With `--head`, `--root` explicitly supplies the matching
head checkout for citation verification; omitting it produces snapshot-only
`stale-or-unverified` removal findings. Local verification freezes an inventory using the existing safe repository walk
and binds a `RepositoryReadV1` to the head snapshot's revision. The adapter checks
pinned content references before `diffSnapshotsWithRead` verifies citation hashes;
changed or unavailable bytes remain `stale-or-unverified`, without a latest-revision
fallback. This local convenience does not prove that a dirty checkout is the
committed revision; the inventory binds the bytes present at invocation. Incomplete
or over-budget inventory capture exits 2. Head text must match its snapshot hash.

Output is deterministic JSON containing `changeSet`, `impact` and `findings`.
`--output` writes the same bytes printed on stdout. This command defaults to JSON;
`--json` is accepted explicitly. Success exits 0, including advisory findings;
missing inputs, invalid hashes, different project identities and I/O errors exit 2.
See [ChangeSetV1](change-set-v1.md) for extraction limits and finding evidence.

Library callers use the [injected storage guide](../guides/injected-storage.md)
to provide their own exact-revision capabilities; no additional CLI or MCP tools
are required.

## Caller service profile

The caller-selected [service profile v1](service-profile-v1.md) restricts this
surface before repository configuration is interpreted. Repository config admits
only the enumerated leaves; ignored options retain path-only diagnostics and
`not-analyzed` coverage. Agent execution, repository module imports, federation,
watch and legacy writes are denied. Service library calls use injected storage;
service CLI writes require `--artifact-root`. MCP mutating/agent operations and
filesystem fallbacks are refused. Ordinary local calls remain unchanged.

## Findings and negotiated handoff caveats

Region fixes and settled human decisions follow [region remediation v1](../spec/region-remediation-v1.md),
[FindingV1](../schemas/finding-v1.md), [RemediationV1](../schemas/remediation-v1.md) and
[DecisionV1](../schemas/decision-v1.md). Existing whole-file fix commands remain V1;
region creation/review is a deterministic library API. Enrichment retains settled Decision records
through cache replay, without converting remediation rejection into finding rejection.

`AgentHandoffV1` readers accept optional bounded `caveats` with `pendingFindings`,
`analyzed` repository/revision identities and `coverage` limitations. New writers emit
it only with explicit `includeCaveats: true` and caller-supplied validated caveats; unknown
capability defaults to the legacy field set. Default index and MCP writers never embed
caveats. New strict readers accept legacy payloads; old strict readers receive legacy
output. The public reader preserves negotiated caveats. Limitations cannot establish
semantic validation or invent an answer.

## Action analysis commands

These deterministic commands support the Action contract in
[Marketplace](../MARKETPLACE.md). They add no fields to `DocBridgeIndexV1` or
`AgentHandoffV1`.

```bash
ak-docs action index --root <checkout> --revision <exact-sha> --index-source committed --report <outside-json>
ak-docs action index --root <checkout> --revision <exact-sha> --index-source ci-built --output <outside-index-json> --report <outside-json>
ak-docs action snapshot --root <checkout> --revision <exact-sha> --output <outside-snapshot-json>
ak-docs diff --advisory --base <snapshot-json> --head <snapshot-json> --root <head-checkout> --repository <owner/repo> --pr <number> --index-source committed --output <outside-advisory-json>
```

All commands require clean exact-revision checkouts and accept a caller-selected
`--config <path>`. Ref names, dirty captures, escaped service configuration paths
and in-checkout artifact destinations are rejected. `action index` runs existing
static-config gates; `--gate <id>` selects a blocking gate. In `ci-built` mode it
checks any existing committed drift before an in-memory build, writes and reloads
an isolated artifact, compares a repeated hash and writes a provenance sidecar.
Drift blocks only under the configured freshness policy and remains visible under
other policies. Missing committed indexes are permitted only in explicit CI-built
mode. The repeated artifact hash check does not prove semantic correctness.

`action snapshot` applies the service capability ceiling, captures bounded reads
and binds the snapshot's source revision to the declared Git hash. It never executes
repository-selected modules, scripts, agents, providers or hooks. `diff --advisory`
uses the same ChangeSet/reference engine as `diff`, with bounded service head reads.
It writes a bounded binding envelope, adjacent Markdown (`.md`) and full diff
(`.diff.json`). The envelope binds repository, PR, exact base/head hashes and source
mode, with a stable hidden marker. Escaped Markdown lists deterministic broken and
ambiguous references, evidence/status and incomplete coverage. Historical/generated
findings remain visible; policy routing and version exclusions are not analyzed by
this command. Nothing proposes edits or approves findings.

`--summary <file>` appends that same advisory Markdown to a caller-provided summary.
`--fail-on-findings` returns 1 for reference findings; otherwise findings return 0.
Invalid inputs, unavailable reads or invalid artifacts return 2. Action-level
analysis unavailability is separately reported with an explanation and does not
change blocking results; publisher errors also fall back without changing gates.
The publisher is separate from the CLI and does not execute the source checkout.

## Long-operation controls

`discover`, `index` and `diff` accept `--max-duration <ms>` (positive integer) and
`--progress` (bounded human-readable stage/count/elapsed events on stderr).
The local CLI selects the async injected reader path when either flag is present;
commands without these flags retain their synchronous compatibility behavior.
These controls remain deterministic and local. `--watch` cannot be combined with
them. With `--progress`, run metrics are printed only on stderr; progress never enters a
snapshot/index/change-set payload or its hash.

The async path handles Ctrl-C with an `AbortSignal`, exits nonzero and does not
publish a cancelled/limited computation. It yields during inventory acquisition
and before publication so a queued SIGINT is observed after synchronous parsing.
Limits are cooperative at file/host/stage boundaries; a synchronous parse is not
preempted halfway through. `--max-duration` includes local inventory acquisition.
Local index exports are prepared only after successful computation and replaced
with same-directory temporary files; handled failures remove owned temp files.
Individual exports are atomic, not a multi-file transaction. A limited diff can
be printed with coverage but is never written to `--output` as a complete result.
Service discover/index accept the same flags and pass cancellation to their
partitioned artifact store. Service diff remains unavailable under its existing
command ceiling.
