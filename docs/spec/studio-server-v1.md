---
title: Local Studio server v1
description: Optional authenticated loopback transport for graph navigation and proposal review.
owner: maintainers
lifecycle: active
sourceOfTruth: packages/studio/src/server.ts
validationPath: pnpm vitest run tests/studio-server.test.ts --maxWorkers=2
---

# Local Studio server v1

`ak-docs studio` dynamically loads the separately installed
`@agentskit/doc-bridge-studio` package. Core runtime dependencies and index/handoff
schemas are unchanged. `studio export` retains its deterministic JSON contract.
The optional package serves built React assets using sigma.js over graphology;
all graph data and ranking come from existing deterministic engine operations.

The server listens on **127.0.0.1 only**, with an ephemeral port and a fresh
256-bit random session token in the printed URL. Every request, including
HTML, script and stylesheet requests, requires that token in `?token=` or
`Authorization: Bearer`. The host must exactly match the bound loopback origin;
foreign Origin and cross-site fetch requests fail. Actions additionally require
that exact Origin and `Content-Type: application/json`. No CORS is enabled.
Responses forbid caching and referrer transmission and set a restrictive CSP:
no external resources, inline scripts, evaluation, frames, objects or forms.
Style attributes are permitted for the canvas renderer's positioning; script
sources remain same-origin only. The session URL is a local capability, not
proof of a remote person's identity. Anyone holding it can act as the entered
reviewer; use only on a trusted machine and keep it out of logs and shared links.

## Read API

| Request | Response |
| --- | --- |
| `GET /api/graph` | Strict [StudioGraphV1](../schemas/studio-graph-v1.md), from a fresh engine index and available overlay. |
| `GET /api/search?q=...` | StudioSearchV1, existing engine ranking/explanations; query length at most 1,024. |
| `GET /api/why?id=...` | StudioWhyV1, bounded node relationships, finding and proposal references. |

Missing/truncated entities, stale/missing indexes and invalid artifacts return
JSON `{error}` with status 409 and actionable engine diagnostics. Unknown routes
return 404, absent/wrong tokens 401, foreign origins/hosts 403, unsupported methods
405. Authentication precedes route lookup. Every graph reload checks freshness;
there is no background watcher or automatic indexing. Shutdown stops accepting
requests, drains queued actions and disconnects remaining HTTP connections.

## Review API

`POST /api/actions` accepts exactly the following object, at most 8,192 bytes:

```json
{
  "requestId": "review-request-0001",
  "action": "approve",
  "proposalId": "exact-proposal-id",
  "evidenceHash": "64-lowercase-hex-characters",
  "indexHash": "64-lowercase-hex-characters",
  "by": "human-reviewer",
  "reason": "Reviewed current evidence"
}
```

`requestId` has 16–80 ASCII letters, digits, underscores or hyphens. `action` is
`approve`, `reject` or `prepare-draft`; hashes are exact 64-character hex engine
bindings, not the illustrative strings above. Reviewer, reason and proposal ID
are nonempty text of at most 1,024 characters with no control characters.
Unknown fields, including push flags, fail with 400; oversized bodies fail 413.

Actions serialize and append durable started/done/failed records to the local,
gitignored `.doc-bridge/studio/actions.jsonl` (8 MB cap; no session token).
A repeated request ID with identical fields returns the prior successful result,
including after restart. A changed payload returns 409. Interrupted or failed
requests fail closed: inspect engine approval/overlay records before refreshing
and submitting a new review. The journal is not a transaction with the engine;
interruption can leave an engine decision recorded without a completed journal
entry. Studio never blindly repeats that uncertain operation. Preserve the
journal when restarting; stop Studio before archiving it. Archiving resets transport replay protection.

Before a new action, Studio reloads the fresh index, checks the displayed index
and evidence hashes and exact pending ID, discovers current repository facts,
and checks overlay revision, configuration, snapshot and target bindings.
Approval/rejection then calls `decideEnrichment`, the same operation used by
`ak-docs enrich approve|reject`; native vault edits use that same overlay path.
A stale, accepted or unavailable proposal cannot authorize another write.
Decisions affect corrections, not finding suppression or source documents.
Existing engine identity/approval safeguards remain authoritative.

`prepare-draft` calls the existing draft-writing operation with a request-bound
filename and returns `dryRun: true`, a relative path and suggested commands. Distinct
requests cannot overwrite each other through a timestamp-based filename. Those
commands include a draft-only PR; **Studio never executes push or PR creation**.
There is deliberately no push flag in this foundation. Review and explicitly
execute the CLI commands separately when authorized. Sample mode uses committed
fixtures, disables mutation and ranked-search controls with neutral guidance, and
refuses operations without real inputs. Session HTML carries a read-only sample
marker; no extra fields enter the strict graph contract.

## Accessibility and presentation

Graph coordinates derive from IDs and remain frozen; camera controls are instant
and reduced-motion preferences disable CSS motion. An accessible entity list,
kind/area/relation/label filters, focus on neighbors, explicit kind legend and
bounded metric labels accompany the canvas. Inbox findings remain distinct from
corrections; evidence includes revision/configuration and unchanged finding
status. Search preserves prior results and supports cancellation; entity panels
support escape-to-close and restore keyboard focus. Light/dark and narrow layouts
share one neutral theme module. Missing analysis and truncation remain visible.

The local filesystem, engine configuration and dependencies are trusted inputs;
this is not a hosted multi-user security boundary. The transport exposes only
fixed API/asset routes and never accepts arbitrary shell commands or file paths.
