---
title: GitHub Marketplace
description: Run independent index gates and optional deterministic pull request advisories with the Doc Bridge composite Action.
---

# GitHub Marketplace

Doc Bridge ships one root composite Action: `doc-bridge-gate`. Its default
`index-source: committed` verifies the checked-in index before generating any
artifact. Blocking gates and advisory delivery have independent results.

## Inputs and outputs

| Input | Default | Contract |
| --- | --- | --- |
| `index-source` | `committed` | `committed` or `ci-built`; other values fail. |
| `config-path` | discovered | Static configuration within the captured revision. Caller selects the path. |
| `gate` | configured gates | Caller-selected blocking gate; selecting a different gate does not hide reported index drift. |
| `advisory` | `false` | Opt into exact base/head Layer-1 analysis. |
| `comment` | `false` | Separate opt-in publisher; otherwise retain summary and annotations. |
| `fail-on-findings` | `false` | Explicitly block on pending advisory reference findings; delivery failure never clears or changes gates. |
| `base-revision` | PR base SHA | Exact commit already present locally; no branch names or implicit fetch. |
| `head-revision` | PR head SHA, otherwise event SHA | Exact commit already present locally. |
| `pr-number` | event PR number | Repository/PR/revision binding for the advisory. |
| `node-version` | `22` | Runtime version. |
| `engine` | `published` | Explicit `checkout` engine is limited to unprivileged doc-bridge self-CI; comment publishing is forbidden. |
| `package-version` | Action release version | Exact trusted published engine; never install the PR workspace package. |

Outputs are `index-report` (blocking JSON path), `index-source`, `source-revision`,
`advisory-report` (bounded JSON path, adjacent `.md` and `.diff.json`), and
`comment-status` (`comment`, `summary`, `disabled`, or `unavailable`). Reports label
the selected source and exact analyzed head revision.

`ci-built` allows an absent committed index. It builds with `write: false`, writes
the result outside the checkout, reloads it and compares its hash with a repeated
build. A separate provenance sidecar binds the generated artifact to the exact
revision. In an isolated exact-revision capture, the trusted engine also generates
enabled Git-ignored `llms.txt` and capabilities exports before gates. Tracked
exports still require existing current evidence. It never writes over the committed
index or modifies the caller checkout.
If a committed index exists, its drift is checked first and reported independently;
when `index-freshness` is selected, that drift still blocks the job. A repeat build
proves reproducibility for the captured inputs, not semantic documentation accuracy.

## Use it in a repository

Pin an immutable Action release containing these inputs and its matching published
engine. Older releases provide only committed gate validation.

```yaml
name: Documentation gate
on: [pull_request]
permissions:
  contents: read
concurrency:
  group: doc-bridge-advisory-${{ github.repository }}-${{ github.event.pull_request.number }}
  cancel-in-progress: false
jobs:
  docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
        with:
          fetch-depth: 0
          ref: ${{ github.event.pull_request.head.sha }}
          persist-credentials: false
      - uses: AgentsKit-io/doc-bridge@ee756a13c006c597445c31e2643c1e8cece715d7 # v1.7.45
        with:
          config-path: doc-bridge.config.json
```

The doc-bridge repository itself generates an ignored index before its Action
self-smoke; this does not change the committed-index contract for consumers.

The pinned example uses the existing committed-only release. After selecting an
immutable release containing the new contract, opt into the following inputs:

```yaml
with:
  index-source: ci-built
  advisory: 'true'
  comment: 'true'
```

Add `pull-requests: write` to the publisher job only when `comment: 'true'` is
requested; otherwise keep `contents: read` only. Forks remain summary-only.

Consumers must use their audited immutable Action SHA; never load Action scripts
from an untrusted PR checkout. By default the installed engine is the exact
published `package-version`, with install lifecycle scripts disabled. Pre-release
self-CI may explicitly select `engine: checkout` in the doc-bridge repository only,
after building its engine in the unprivileged test job. That choice runs the PR's
engine code intentionally, is not the service safety boundary, forbids comment
publishing, and must never receive write credentials. No workspace engine is
selected automatically and no workspace install scripts are run by the Action.

If a committed index is stale, run `ak-docs index`, review the generated diff, and
commit it. Choosing `ci-built` does not repair or clear committed drift.

## Advisory and event safety

The advisory analysis captures exact Git objects into temporary worktrees, materializing
blobs without checkout filters, hooks, submodules or head scripts. Symlinks and
submodules are rejected rather than followed. No additional fetch or network call
is made by analysis; `actions/checkout` must supply both objects. Missing objects,
limits and unsupported analysis are reported as unavailable, never as zero findings.
Snapshots and the advisory variant of `ak-docs diff` use bounded service reads;
agent, network and repository-module options are ignored with visible coverage.
Blocking gates retain deterministic static-config behavior under the trusted engine.
CI-built gates always use an isolated exact-revision capture and generate enabled
ignored exports with the trusted engine; no repository scripts are executed.
Committed mode uses a clean exact workspace to retain caller-prepared ignored
conformance artifacts, otherwise an isolated capture. Committed mode never repairs
missing exports. Match checkout to `head-revision` when preparing those artifacts.
Failures name the gate and up to five required failing rules with bounded reasons
in the annotation and summary. Advisory-unavailable notices include the bounded,
redacted engine error, independently of blocking results.

The Markdown lists `BROKEN_REFERENCE`, `AMBIGUOUS_REFERENCE` and
`CHANGED_REFERENCE`, epistemic status,
bounded documentation locations, exact revisions and partial/missing coverage.
The advisory applies policy by default: included broken, ambiguous and changed
references are listed; historical/generated/version exclusions are summarized as
counts with complete evidence in the diff artifact. Changed values require review,
never automatic edits. Same-repository implicit targets track the analyzed branch;
consumer/explicit version targets retain eligibility. It proposes no patches or
acceptance decisions. `ak-docs diff --no-policy` restores raw debugging output.

| Event/token | Analysis | Comment |
| --- | --- | --- |
| `pull_request`, same repository, write token | Read-only captured head data | Opt-in create/update. |
| `pull_request`, fork or read-only token | Same service ceiling | Summary and annotations; permission failure does not fail the job. |
| No PR / unavailable exact objects | Gates remain independent | Advisory unavailable with an explanation. |
| `pull_request_target` | Never execute or load head code with write credentials | Prefer a separate trusted publisher consuming only bound bounded artifacts. |

Default to `pull_request`. Never use `pull_request_target` to install dependencies,
run scripts, load an Action, or execute repository-selected modules from the head.
Only the publisher receives the write token, and it has no source execution path.
Do not supply write credentials in job-wide environment variables. Static gate
configuration must be selected by the trusted workflow; it is parsed, never executed.

The publisher uses the issue-comment endpoint `POST /repos/{owner}/{repo}/issues/{pr}/comments`
and `PATCH /repos/{owner}/{repo}/issues/comments/{id}`; `pull-requests: write` is the
required token permission for PR comments. It checks repository/PR/base/head/mode
binding, current PR revisions, author identity and an engine-owned hidden marker.
It updates one own comment and removes duplicates from that author/marker only.
Uncertain writes are reconciled before one bounded retry. Forks, unsupported tokens,
API limits and permission errors fall back to the same summary/artifact and annotations.

Use the workflow concurrency group above for every publisher of this advisory type
so runs cannot race between API revision checks and comment writes. Revision checks
also suppress already-superseded runs; the API does not provide an atomic
revision-bound comment write. Live concurrency behavior still requires verification.

Temporary source worktrees and the installed runtime are removed by the Action.
Generated report files remain under the runner temporary directory until runner
cleanup. If evidence must survive the job, upload the output paths with a separately
SHA-pinned artifact step, an explicit retention policy (for example seven days), and
restricted artifact access. Never upload source credentials or install directories.

## Verification boundary

`pnpm check:marketplace` checks the static contract. `pnpm test:marketplace` runs
real local Git base/head fixtures, fresh/stale/absent index flows, preserved drift,
summary fallback and non-execution checks. Publisher tests use simulated endpoint
responses; they do not prove real token permissions or delivery.

Before release acceptance, run real PR workflows for fresh/stale committed indexes;
absent/present CI-built indexes with drift preserved; exact reference findings;
trusted/fork inputs; no-write summary fallback; create/update/deduplication;
uncertain retry; serialized concurrent and superseded runs; and independent blocking
results. These live GitHub flows remain **unverified** by local contract tests.

## Release-owner checklist

1. Run `pnpm check:marketplace`, `pnpm test:marketplace`, and the repository release matrix.
2. Confirm the public repository contains exactly one root `action.yml` and its name is available.
3. Publish the matching engine before consuming the new Action commands.
4. Push the immutable semver tag. The release workflow leaves a Release draft for review.
5. Publish the Action listing deliberately and execute the real consumer workflow matrix above.

## Related

- [Gate and CI guide](./guides/gate-ci.md)
- [Getting started](./getting-started.md)
- [CLI](./spec/cli.md)

Citation regions edited in the same change remain visible as
`updated-in-this-change`, grouped separately in comments, summaries and JSON.
They require confirmation and do not count as pending for `fail-on-findings`.
