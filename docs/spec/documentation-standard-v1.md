# Documentation Standard v1

Status: **stable — HITL-approved on 2026-07-13**

Profile ID: `documentation-standard-v1`

Schema version: `1`

Documentation Standard v1 is a deterministic Doc Bridge conformance profile for
documentation properties in the AgentsKit ecosystem. It turns the shared quality
expectations into local evidence that humans, CI, and agents can inspect without a model,
API key, or network request.

```mermaid
flowchart LR
  A[Human docs] --> P[Documentation Standard v1]
  L[llms.txt and raw sources] --> P
  H[AgentHandoff index] --> P
  C[Contribution and metadata] --> P
  Q[Quickstart test evidence] --> P
  P --> R[Versioned conformance report]
  R --> CI[CI exit code]
  R --> HITL[Human approval]
```

## Rule set

| Rule | Level | Passing evidence |
|---|---|---|
| `human-docs` | Required | A configured human adapter discovers at least one non-agent document |
| `llms-and-raw-source` | Required | `llms.txt` exactly matches the current deterministic Doc Bridge output and every declared raw source is non-empty |
| `agent-handoffs` | Required | Every emitted handoff has `startHere`, edit roots, checks, and a linked/external human bridge |
| `contribution` | Required | At least one declared contribution guide exists and is non-empty |
| `metadata` | Required | Declared metadata files exist and contain every configured marker |
| `cross-links` | Required | Vendored canonical manifest/claims snapshots agree, include this product, and every declared URL is canonical and occurs in source |
| `tested-quickstarts` | Required | Each quickstart maps a doc to a test file, identifying test markers, and a CI command |
| `visual-explanations` | Recommended | Every declared image or animation asset exists |
| `structured-diagrams` | Recommended | Declared diagram source exists and contains its configured marker |

Recommended failures remain visible but do not fail the command. Required failures return
exit code 1 unless an approved exception applies.

## Approved exceptions

Exceptions are explicit audit records, not hidden exclusions. A valid exception requires
the rule ID, a substantive reason, the approver, and a tracking URL:

```json
{
  "ruleId": "structured-diagrams",
  "reason": "The interactive visual already expresses this relationship more clearly.",
  "approvedBy": "Documentation Working Group",
  "trackingUrl": "https://github.com/AgentsKit-io/example/issues/123"
}
```

The report uses status `excepted`; it never rewrites an exception as an ordinary pass.

## Configuration

```json
{
  "conformance": {
    "documentationStandardV1": {
      "rawSources": ["README.md", "docs/getting-started.md"],
      "contributionPaths": ["CONTRIBUTING.md"],
      "metadata": [
        { "path": "docs/index.html", "contains": ["<title>", "name=\"description\""] }
      ],
      "links": [
        { "url": "https://www.agentskit.io", "paths": ["README.md"] }
      ],
      "ecosystemContract": {
        "manifest": "ecosystem.json",
        "claims": "ecosystem-claims.json",
        "productId": "example"
      },
      "quickstarts": [
        {
          "id": "demo",
          "doc": "README.md",
          "test": "tests/demo.test.ts",
          "command": "pnpm vitest run tests/demo.test.ts",
          "testContains": ["runs the demo"]
        }
      ],
      "visuals": ["docs/assets/overview.webp"],
      "diagrams": [
        { "path": "docs/architecture.md", "contains": ["```mermaid"] }
      ],
      "exceptions": []
    }
  }
}
```

The profile does not execute the declared quickstart command. The test-evidence file and
identifying markers prove that the quickstart has a repository test; the normal CI suite
executes that test. This avoids turning documentation configuration into an arbitrary
command-execution surface.

The ecosystem contract files are committed, network-free consumer snapshots of the canonical
AgentsKit `ecosystem.json` v2 manifest and `ecosystem-claims.json` ledger. The gate verifies
their schema relationship, product identity parity, the adopting product ID, and that declared
cross-links occur both in the manifest's public surfaces and in repository documentation.
Doc Bridge also records the upstream ref and SHA-256 digests in `ecosystem-upstream.json`;
`pnpm check:ecosystem-upstream` compares the local snapshots with AgentsKit `main` in CI.
This network parity check is deliberately separate from the runtime conformance profile, which
remains deterministic and offline.

## Run the profile

```bash
ak-docs conformance run documentation-standard-v1 --text
ak-docs conformance run documentation-standard-v1 --json
ak-docs gate run documentation-standard-v1
```

JSON output is the stable automation surface. Text output sends the same evidence in a
human-scannable form. Both return 0 when required rules pass or are explicitly excepted,
and 1 when a required rule fails.

## Adoption and stability

The Doc Bridge repository is the first real fixture and dogfoods the profile in its normal
`ak-docs gate run`. Other ecosystem repositories adopt it in their documentation slices.
The required/recommended rule split received product-owner HITL approval in
[issue #27](https://github.com/AgentsKit-io/doc-bridge/issues/27), and the canonical ecosystem
contract was delivered by
[AgentsKit #1208](https://github.com/AgentsKit-io/agentskit/pull/1208). The profile is stable;
future breaking rule changes require a new version.
