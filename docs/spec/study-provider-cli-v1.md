---
title: Study provider CLI contract v1
description: Generic, bounded command contract for model and agent execution in controlled studies.
---

# Study provider CLI contract v1

The provider adapter lets a study use a hosted model CLI, a vendor CLI, or an AgentsKit Registry agent without adding that provider to Doc Bridge. It does not install a model runtime and does not assume Ollama.

## Configuration

Create a content-addressed configuration with `createStudyProviderCliConfig` or validate one with:

```bash
ak-docs study providers path/to/provider-cli.json --text
```

Each provider entry contains:

| Field | Meaning |
| --- | --- |
| `modelId` | Must match one pinned model in the run plan. |
| `scenarioIds` | One or more of `repository-only`, `deterministic-doc-bridge`, `registry-assisted`. |
| `command` | Executable name or path. It is launched without a shell. |
| `args` | Ordered arguments passed unchanged to the executable. |
| `envAllowlist` | Names copied from the parent environment. Credentials must be named explicitly. |
| `providerNetwork` | Audit declaration that the provider may send input to an external service. |
| `maxInputBytes` / `maxOutputBytes` | Provider-specific bounds; the lower bound wins against the run-plan budget. |
| `pricing` | Optional configured USD rates used only to derive auditable `agentCostUsd`; omitted rates produce no currency claim. |

The optional top-level `adjudicator` uses the same bounded command fields and adds `id` and `modelId`. It is a separate process from the provider under evaluation. Its output is used to record an independent rubric decision; the provider cannot approve its own result.

```json
{
  "adjudicator": {
    "id": "independent-reviewer",
    "modelId": "reference-model",
    "command": "/absolute/path/to/adjudicator",
    "args": [],
    "envAllowlist": [],
    "providerNetwork": true,
    "maxInputBytes": 1000000,
    "maxOutputBytes": 50000,
    "pricing": {
      "currency": "USD",
      "inputPerMillionUsd": 1,
      "cachedInputPerMillionUsd": 0.5,
      "outputPerMillionUsd": 3
    }
  }
}
```

The cost formula is `(uncached input × input rate + cached input × cached rate + output × output rate) / 1,000,000`. Rates are study configuration, not a vendor billing assertion; the report must preserve the configuration hash and run ID. Cost is emitted only when the process reports both input and output token counts. `providerTokenCostUnits` remains the provider-reported input plus output total and is never presented as currency.

The parser rejects stale content hashes, duplicate model/scenario mappings, unsafe environment names, and invalid command arguments. A command must exist and be executable before any task starts.

## Provider process contract

The child process receives one JSON request on stdin and must emit exactly one JSON object on stdout. Human-readable logs must go to stderr. The request contains the task, scenario, expected outcome, evidence requirements, acceptance checks, allowed tools, and forbidden actions. It does not contain the configured repository path.

The response may contain the bounded metrics below. Unknown fields are ignored by the generic runner, while unknown numeric measurements are preserved by the observation schema for future metric versions. The bundled Codex adapter additionally passes a JSON Schema to the provider CLI and requires the semantic fields (`taskOutcome`, `evidenceQuality`, `safetyOutcome`, evidence IDs, clarification/rework counts, and measurements) so missing output is visible as a provider failure rather than silently becoming an empty result. When observed, measurements must use canonical names: `searchHitRate`, `acceptanceChecksPassed`, `acceptanceChecksTotal`, `errorRate`, `documentationFindingCount`, the documentation `*Rate` fields, `analysisCostUsd`, and `agentCostUsd`.

```json
{
  "inputTokens": 1200,
  "outputTokens": 340,
  "tokenMethod": "provider",
  "toolCalls": 4,
  "taskOutcome": "success",
  "evidenceQuality": "high",
  "safetyOutcome": "safe",
  "evidenceIds": ["artifact-hash:abc123"],
  "clarificationRequests": 0,
  "reworkCount": 0,
  "measurements": {
    "searchHitRate": 1,
    "timeToCorrectAnswerP95Ms": 820
  }
}
```

Raw prompts, responses, repository contents, paths, and credentials are not written to the observation ledger. The ledger stores status, hashes, timing, labeled token counts, tool counts, metric fields, and automated or pending human adjudication. The runner derives `providerTokenCostUnits` from provider-reported input plus output tokens; this is a transparent token-equivalent cost metric and must not be presented as currency.

## Independent adjudication

Adjudicate a persisted ledger in a separate process:

```bash
ak-docs study adjudicate docs/study/observation-ledger-v1.json docs/study/task-suite-v1.json \
  --adjudicator path/to/provider-cli.json --output .tmp/adjudicated-ledger.json \
  --run-id cycle-1 --offset 24 --limit 24 --json
```

The adjudicator receives only anonymized task metadata and the bounded structured candidate record: outcomes, evidence IDs, per-requirement evidence presence, acceptance execution state, numeric measurements, execution status, duration, and response size. It does not receive repository paths, raw stdout, prompts, repository contents, or credentials. Automated adjudication records the adjudicator configuration hash in addition to its actor and method. A timeout, unavailable command, oversized output, or invalid JSON leaves the adjudication `pending`; no deterministic fallback silently converts that failure into a success. `--offset` and `--limit` support deterministic low-cost samples while preserving all unselected observations in the output ledger; offset counts only observations matching `--run-id`.

## Running a study

First validate the complete plan without invoking a provider:

```bash
ak-docs study run docs/study/run-plan-v1.json docs/study/task-suite-v1.json \
  --providers path/to/provider-cli.json \
  --repositories path/to/repositories.json \
  --ledger path/to/observation-ledger.json \
  --dry-run --text
```

The current run plan dry run validates the configured 24-task balanced sample, repository roots, executable commands, and input limits. It writes no ledger and makes no provider call. To execute, omit `--dry-run`. The ledger is persisted after each observation, so an interrupted run can resume and skip completed task executions idempotently. A full 288-execution matrix requires a separately hashed run plan with `sampling.sampleSize` set to 288.

Provider configuration and repository-root configuration are local operational inputs. Do not commit credentials, private paths, raw provider output, or consumer repository content to a publication artifact.
