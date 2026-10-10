---
title: Separate minimal study execution
status: proposed
date: 2026-10-09
---

# Separate minimal study execution

The existing controlled-study schemas bind four categories per repository, two
models and three scenarios. The minimal study needs six questions, one pinned
model and two scenarios. Changing existing validators would invalidate historical
plans or relax their evidence contracts.

Use a separate versioned public task manifest and optional research script. Reuse
the real local MCP server, paired comparisons, provider metric labeling and
pending agent adjudication; preserve existing core schemas and hashes. Adjudication
is performed by a separate agent run, not by humans. The adjudicating agent is a
different model run from the answering run, is blind to scenario identity and
applies the existing five-outcome rubric. Results are agent-adjudicated evidence
with no human review.
Built-in fetch avoids adding an SDK dependency. Expected answers stay out of
prompts. Environment-only credentials and per-call conservative reservations
bound optional execution; no Layer 0 operation invokes a provider.

The alternative of fitting the reduced design into a larger plan would publish
misleading population/model/scenario counts. The consequence of separation is
that its private ledger is not accepted by existing `study ledger` commands;
agent adjudication and any later import must explicitly reconcile the different
contracts. This proposal does not approve a result or baseline. The maintainer's
2026-10-09 decisions approve only a pilot with a 1 USD cumulative cap for
`claude-haiku-5-5`; the full 36-attempt run needs a new budget approval after the
pilot reports measured cost.
