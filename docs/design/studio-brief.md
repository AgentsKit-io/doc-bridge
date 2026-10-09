---
title: Local studio design brief
description: Graph, drift inbox and evidence navigation for maintainers and agents' humans.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/schemas/studio-graph-v1.md
validationPath: pnpm vitest run tests/studio.test.ts --maxWorkers=2
---

# Local studio design brief

Design a calm, information-dense local workspace for doc-bridge. Maintainers
need to locate architectural knowledge and review drift; humans supervising
agents need to understand evidence and decide which proposed corrections
belong in a review. Prioritize orientation, provenance and deliberate decisions.
Use the [versioned data contract](../schemas/studio-graph-v1.md), without
inventing analytics, evidence, timestamps or approval state.

## Knowledge graph

A linked-note graph: packages and areas anchor clusters, documents connect to
symbols/facts and decisions, concepts and changes provide context. Offer kind,
area and relation filters, a readable legend, search, focus on one node and its
neighbors, zoom/reset and an accessible list alternative. Use node size for
canonicality with a clear legend, never implied correctness; centrality is a
review signal. Color must be accompanied by shape/icon/text. A right-hand entity
pane shows path, available metrics, evidence links and missing-data explanations.
Retain selection during filters; explain when a selection is hidden. Clicking
an edge explains its kind, direction and original kind where available.

Use WebGL through sigma.js over graphology. Keep layout separate from data
identity, with stable initial positioning and a freeze-layout control. Show
caps and omitted counts persistently; a huge graph opens with useful filters
and focus instead of an unreadable cloud. The accessible list and keyboard
controls are first-class navigation, not a screenshot of the canvas.

## Drift inbox

Group reference findings by document and routing, then severity. Distinguish
BROKEN_REFERENCE, AMBIGUOUS_REFERENCE and CHANGED_REFERENCE in plain language.
Show evidence, the bound revision and configuration, and an
updated-in-this-change badge without presenting it as resolved. Keep findings
and proposed remediations separate: rejecting a correction does not reject the
finding. Display proposed, accepted, in-review, merged, rejected, stale and
superseded states with explicit text. Show approve/reject, reason entry,
verification progress/failure, and an optional PR link. A missing PR link means
no PR is attached, not an error. Require fresh engine validation before actions;
a displayed accepted overlay record alone never authorizes a write.

## Search and why entity page

Search returns ranked documents/modules with matched terms and scoring
components, retaining the exact index hash. Show loading, empty query, no
matches and missing/truncated targets distinctly. Entity pages combine
relationships, source navigation, known metrics, linked findings and proposals.
Use a separate label filter for history entities the index ranker cannot search.
Explain why a match surfaced in concise language, with expandable evidence.
Keep previous results visible during a new request and preserve keyboard focus.

## States and accessibility

- Empty repository: explain what indexing captures and offer the CLI command.
- Loading: stage/status text, cancellable operation where supported, and no fake percentages.
- Huge graph: visible caps, list navigation and focus-first exploration.
- Entities disabled: graph remains useful; explain the opt-in feature and absent history.
- Findings/proposals not analyzed: show missing-input state, never a clean bill of health.
- Errors: stale/missing index, invalid artifact/version, CLI failure and disconnected session each show recovery steps; preserve review drafts.
- Slow operation: keep controls responsive and announce status without repeated alerts.

All interactions support keyboard operation, visible focus, logical tab order,
escape-to-close and focus restoration. Provide labeled buttons, text alternatives
for canvas content and live status announcements. Aim for WCAG AA contrast
(4.5:1 normal text, 3:1 large text and controls); pair color with labels.
Respect reduced motion: stop force-layout movement, animated zoom and pulses.
Use ample click targets, avoid hover-only evidence, and handle long paths with
wrapping and a copy control. Responsive narrow layouts use graph/list tabs and
an entity sheet without hiding review status or action errors.

## Visual direction and boundaries

Dark and light themes use quiet neutral surfaces, restrained accent colors,
compact typography and clear separation between navigation, evidence and actions.
Avoid ornamental motion, oversized cards and neon graphs. Dense tables can
carry the inbox; whitespace and hierarchy should help scanning.

The optional studio binds only to 127.0.0.1 with a random session token. The
core package stays free of UI dependencies. Actions call existing CLI commands;
PR creation is draft-only. The design does not add a hosted service or mutate
repository state directly. The current export command only creates JSON;
the interactive server and action transport belong to a subsequent implementation.

## Using samples

Load files in [studio-samples](./studio-samples/README.md) as contract fixtures.
Start with `synthetic.json` to design every node kind and inbox status, then
`doc-bridge.json` for a real medium graph and `agentskit.json` for a larger
monorepo. Inspect truncation and feature coverage in all three. Synthetic inbox
evidence is for interaction design; the real samples do not claim analyzed
reference drift when no finding artifact was supplied. Check light/dark,
keyboard-only use, reduced motion, long paths, loading/errors and narrow layouts
before requesting visual review. These data artifacts are not rendered UI evidence.
