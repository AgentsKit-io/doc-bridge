---
title: 2.0 launch channels plan
description: Staggered distribution drafts, assets and evidence gates; no posts are scheduled.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/launch/channels-2.0.md
validationPath: node bin/ak-docs.js conformance run documentation-standard-v1 --text
---

# 2.0 launch channels plan

The 2.0 launch scope is only the GitHub Release, npm package, documentation site
and landing page. Social, community, newsletter and list channels are not part of
the 2.0 launch: the drafts below are kept for a later, separate decision.

This is a reviewable plan, not published posts. A human owns any outreach. Nothing
here is scheduled. Revisit it only after package publication, release validation
and dogfood review are confirmed. The checked-in engine is a prerelease; do not
announce stable 2.0 prematurely.

One-liner: **Deterministic proof of documentation drift, with evidence-linked
handoffs for coding agents.** Tagline: **Show the change. Keep the evidence.**

## Launch scope and deferred drafts

Only the first row (GitHub Release + npm) is in the 2.0 launch, together with the
documentation site and landing page. Every other row is a deferred draft for a
later decision and is not part of 2.0.

| Channel | Angle | Draft copy | Required assets |
| --- | --- | --- | --- |
| GitHub release + npm (2.0 launch) | Reproducible upgrade and actual shipped scope | “doc-bridge 2.0 compares revision evidence, separates changed claims from bare mentions, and exposes repository rationale through CLI/MCP. Start with init → index → query. Read the migration guide before regenerating artifacts. Optional remediation remains human-reviewed.” | Release notes, exact install version, migration link, passing release evidence |
| DEV / Hashnode tutorial | Teach one concrete stale-doc repair workflow | “Make your docs usable by coding agents: capture a base snapshot, change a cited API, inspect the bounded drift finding, then resolve the owning handoff. This walkthrough needs no model key. We also show what unsupported analysis looks like.” | Runnable public example, terminal recording, screenshots, benchmark method link |
| Show HN | Inspectable deterministic engine and limitations | “Show HN: doc-bridge — deterministic documentation drift evidence and agent handoffs. It compares observed revision facts with cited claims; it does not judge all prose. Native controls reached 100% precision; historical changed-reference precision was 83.3%, with 6.25% false positives on negative cases. The method and remaining errors are public.” | Crisp 60-second demo, repository link, chart with denominators and caveats |
| Relevant subreddits / communities | Educational example matched to community | “We built a small public example showing when an API change makes a documentation claim worth reviewing, and when a bare mention stays valid. Here are the commands, false positives and limits. How do you keep those claims current?” | Public example and moderation-rule review; adapt separately for JavaScript, TypeScript, web development and open-source communities |
| AgentsKit site / newsletter (deferred) | Practical adoption for existing ecosystem users | “doc-bridge 2.0 adds evidence-linked drift review, opt-in knowledge entities and generated vault navigation. Run the key-free handoff path, then add MCP or advisory CI when useful. The Studio UI is planned for 2.1.” | Getting-started link, release link, short recording, explicit optional-provider boundary |
| Documentation framework communities | Show a polished adapter example | “Here is a working human-guide → agent-handoff example using your existing documentation layout, with ownership and checks preserved. The core index and query need no provider.” | Tested framework-specific config and humanDoc link demonstration |
| Awesome lists | Submit a concise relevant entry after adoption evidence | “doc-bridge: deterministic documentation drift findings and evidence-linked CLI/MCP handoffs for repository work.” | Fit with list rules, stable release and maintained README; human-owned PR |
| Product Hunt (later, optional) | Visual product walkthrough after assets exist | “See documentation changes with their evidence, then hand off the right files and checks to your coding agent.” | Reviewed screenshots and video; defer until polished demo and clear scope exist |

Choose DEV or Hashnode as the primary tutorial home; use a canonical link for
any later adaptation. Read each community's current rules before posting and
answer questions in place. Do not blast identical copy across communities.

## Assets and demo script

- GIF of an Action advisory comment: actual base/head evidence, claim vs mention,
  review-required status, and visible coverage. Capture a reviewed public demo;
  never imply the advisory approves edits.
- Benchmark chart: native 15 TP / 0 FP / 0 FN, historical 10 TP / 2 FP / 0 FN;
  precision 100% vs 83.3%, negative-case FP 2/32 = 6.25%. Label finding and case
  denominators separately and link the [method and results](../bench/layer1-results-v2.md).
- Two or three screenshots: useful handoff, drift finding, rationale or vault.
  No credentials, private content or fabricated output.
- Copy-paste install snippet pinned to the published release. Until publication,
  use the [getting-started guide](../getting-started.md) without claiming stable availability.
- 60-second demo: 0–10s introduce a public repo; 10–25s init/index/query and show
  real ownership; 25–45s compare a changed claim and an unchanged mention;
  45–60s show evidence, limits and human review. Link the longer runnable steps.

## Sequence and measurement

The 2.0 launch sequence is the first two rows only. The remaining rows are a
deferred plan that starts only if a maintainer decides to run outreach later.

| Relative time | Step | Gate / measure |
| --- | --- | --- |
| Before day 0 | Review release notes, migration, activation flow and release evidence | Maintainer approval; package published and dogfood validated |
| Day 0 (2.0 launch) | GitHub Release and npm package; docs site and landing page | Exact version works; links resolve; activation steps recorded |
| Deferred | Social, community, newsletter and list channels | Separate decision; no outreach is part of the 2.0 launch |
| Deferred, if approved | Primary educational tutorial | Measure tutorial-to-guide visits and questions before expanding |
| Deferred, if approved | Show HN during an author availability window | Crisp demo ready; respond with method and limitations |
| Deferred, if approved | One relevant community at a time | Follow rules; learn from responses; no duplicate promotional blast |
| Deferred, if approved | Framework communities and list submissions; optional Product Hunt | Examples polished; assets reviewed; human chooses whether to proceed |

Timing is relative to confirmed publication, not a promise of calendar dates.
Measure clone → init → index → first useful query/handoff duration, successful
activation reports, common setup errors and substantive feedback. Distinguish
starter-fixture success from real repository ownership. Collect aggregate feedback
without adding tracking code or claiming causal conversion improvements.

## What not to claim

Do not claim universal semantic correctness, zero false positives, all-language
coverage, automatic approval, guaranteed two-minute activation, provider-token
savings from payload estimates, or release readiness from benchmark scores.
Native 100% is a sample finding-precision result; historical 83.3% and 6.25% use
different denominators. Unknown analysis is not a clean bill of health.
Do not describe Studio as part of 2.0 (it is planned for 2.1), promote a hosted/commercial offering, or
imply optional LLM remediation is required by the deterministic core.
Nothing in this plan authorizes posting, publishing or closing the outreach backlog.
