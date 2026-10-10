---
title: Why doc-bridge
description: Evidence for documentation drift and useful repository handoffs, with explicit limits.
---

# Why doc-bridge

A cited API can change while its documentation stays unchanged. doc-bridge
compares revision facts and citation evidence to show deterministic documentation
drift, then routes work through ownership, edit roots and checks. Changed claims
require review; bare mentions and positively proved compatible uses are distinct.
Missing extraction is visible coverage, not proof that documentation is correct.

Use it when repository ownership, human guides and agent instructions need the
same evidence-linked starting point. Start with [getting started](./getting-started.md)
and choose a [configuration example](./examples.md).

Keep your existing documentation site. If you only need prose search, have no
ownership/check contract, or need semantic validation of every sentence,
this engine alone does not establish that outcome. Optional remediation generates
reviewable proposals; humans still judge intent and correctness.

The core is local and deterministic, without an API key. See
[positioning](./POSITIONING.md), [measurement and limits](./bench/layer1-results-v2.md)
and [migration](./migration/1.x-to-2.0.md). The Studio UI is planned for 2.1, not 2.0.
