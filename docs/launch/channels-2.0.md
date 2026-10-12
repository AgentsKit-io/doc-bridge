---
title: 2.0 launch channels plan
description: Launch drafts for the published 2.0.0 release (Show HN, tutorial outline, community post, awesome-list entries); human-posted only, after the waitlist form is live.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/launch/channels-2.0.md
validationPath: node bin/ak-docs.js conformance run documentation-standard-v1 --text
---

# 2.0 launch channels plan

Status: `@agentskit/doc-bridge` 2.0.0 is the stable release. The drafts below
are ready for a maintainer to post. A human owns every post, comment, submission
and pull request; nothing here is scheduled or automated.

One-liner: **Deterministic proof of documentation drift, with evidence-linked
handoffs for coding agents.** Tagline: **Show the change. Keep the evidence.**

Landing: https://doc-bridge.agentskit.io

Every draft uses only facts from the [README](../../README.md),
[getting-started guide](../getting-started.md) and
[minimal study results](../study/minimal-study-results-v1.md). If a draft and
those documents disagree, the documents win and the draft is corrected.

## Gates before any post

Posting happens **after the early-access waitlist form is live**. Do not post
before every gate below is checked by a maintainer.

1. **Waitlist form live.** The landing page shows the early-access waitlist only
   when the site is built with a waitlist endpoint. Open https://doc-bridge.agentskit.io
   and confirm the form renders and accepts a submission. The drafts mention it as
   "hosted documentation maintenance from AgentsKit (early access)".
2. **Package resolves.** `npm view @agentskit/doc-bridge version` prints `2.0.0`,
   and `npx ak-docs init && npx ak-docs index && npx ak-docs query package example --agent`
   runs in an empty directory.
3. **Release and links.** The GitHub Release for 2.0.0 exists, and the README,
   getting-started, study and landing links resolve.

## Sequence

| Order | Step | Owner decision |
| --- | --- | --- |
| 1 | Confirm the three gates above | Maintainer |
| 2 | Publish the DEV or Hashnode tutorial (primary home; use it as the canonical link) | Maintainer |
| 3 | Submit the awesome-list entries (pull request and form, below) | Maintainer |
| 4 | Post Show HN during an author availability window, linking the repository and the tutorial | Maintainer |
| 5 | Post one community draft (r/typescript or r/javascript, not both), after reading that subreddit's current rules | Maintainer |

Do not post identical copy in several places. Answer questions in the thread,
with the method and limits. Measure visits to the tutorial and getting-started
guide, questions raised, and failed activation steps; do not add tracking code.

## Draft 1: Show HN

**Title:** Show HN: doc-bridge 2.0 - deterministic documentation drift findings for coding agents

**Body:**

doc-bridge is a TypeScript CLI and MCP server. It reads a repository's docs and
ownership map, then gives humans and agents the same starting point: `startHere`,
`editRoots`, `checks` and a `humanDoc` link. The core needs no LLM and no API key.

2.0 also compares two captured revisions. It reports changed references, which
request review rather than automatic correction, and removals, which require
removal evidence. Ambiguous or unsupported extraction stays visible.

Try it in an empty directory:

    npx ak-docs init
    npx ak-docs index
    npx ak-docs query package example --agent

The starter handoff proves the wiring, not real ownership. Replace it with your
repository's edit roots and checks before you rely on it.

Study, with its limits: a small agent-efficiency study ran six repository
questions in two scenario arms, with 18 attempts per scenario per run, one model
(claude-haiku-5-5) and one coding-agent setup. Grading was by an agent, scenario-blind,
with no human review.

- Run 1 showed no gain. Mean score was 0.611 with the doc-bridge MCP server and
  0.722 with repository tools only, and no attempt called a doc-bridge tool. The MCP
  server sent no initialize instructions in that run.
- Run 2 came after a product change (initialize instructions, a discovery fix and a
  larger search budget). Mean score was 0.833 with MCP and 0.611 without, and all 18
  MCP attempts called a doc-bridge tool.

Run 2 is not a controlled comparison with run 1. The repository-only arm moved by
0.11 between runs with the same setup, which is within the noise observed. Treat
these as directional results from two small runs.

It does not judge natural-language correctness. Prose analysis stays marked as
not analyzed until a configured review evaluates it. Feedback on the method and
its limits is welcome.

Repository: https://github.com/AgentsKit-io/doc-bridge
Landing: https://doc-bridge.agentskit.io
Hosted documentation maintenance from AgentsKit (early access): join the waitlist on the landing page.

## Draft 2: DEV / Hashnode tutorial outline

**Working title:** Find the documentation a code change made stale, then hand the fix to a coding agent

**Audience:** maintainers of repositories that have docs and coding agents.
**Length:** about 1,200 words plus a terminal recording.
**Prerequisites:** Node 22 or newer. No API key.

1. **The problem.** Most repository docs are written for humans. Agents guess
   ownership, edit the sibling package or run the wrong test. (README: "Why teams use it".)
2. **Two-minute path.** Install with `npm i -D @agentskit/doc-bridge`, then run
   `npx ak-docs init`, `npx ak-docs index` and `npx ak-docs query package example --agent`.
   Say plainly that the starter handoff proves wiring only. (Getting started.)
3. **Real ownership.** Replace the starter with your edit roots and checks. Link the
   config selection table in the examples guide and the config spec. Show the handoff shape:
   `startHere`, `editRoots`, `checks`, `humanDoc`.
4. **Capture a base revision.** Run `ak-docs discover --json` on the repository and
   keep the snapshot. Use the runnable signature fixture from the README so readers
   can reproduce it from a built checkout.
5. **Change a cited API.** Remove one cited export, then run
   `ak-docs diff --base <snapshot> --root <repo>`. Explain the two outcomes: a
   changed reference requests review, and a removal needs removal evidence.
   Show `--no-policy` for the raw diagnostics. Link the diff and findings guide.
6. **Hand the fix to an agent.** Install the MCP server (`ak-docs mcp install --cursor`
   or the `ak-docs mcp` config in getting started). Name the tools `handoff.resolve`,
   `doc.search`, `doc.get` and `gate.status`. The agent gets the handoff before it edits.
7. **What the evidence shows, with limits.** Include the minimal study numbers from
   draft 1, with the same limits: 18 attempts per scenario per run, one model,
   scenario-blind agent adjudication with no human review with no human review, a product change between runs, and
   run 1 showing no gain. Link the full results.
8. **What it does not do.** No natural-language correctness judgement, no automatic
   approval or edits, and any optional LLM remediation is human-reviewed. Unsupported
   analysis is not a clean bill of health.
9. **Next steps.** Link getting started and the Action advisory guide. End with the
   landing link and the line: "Hosted documentation maintenance from AgentsKit (early access)
   is on the waitlist at https://doc-bridge.agentskit.io."

Assets: a terminal recording of steps 2 and 5, and two screenshots (a handoff and a
drift finding). Use real output only; no credentials or private content.

## Draft 3: Community educational post (r/typescript or r/javascript)

Post one version only. Disclose the author's affiliation in the post. Read the
subreddit's current rules first, and use a flair or self-promotion format if the
rules require one.

**Title:** How do you know a docs claim still matches the code it cites? A small TypeScript example

**Body:**

Docs drift quietly. A function is renamed or an export is removed, and the page
that described it still reads as true. We built a small deterministic check in
TypeScript as an experiment. It is open source. Disclosure: the author works on the
project.

The idea: take a snapshot of the observed facts from two revisions (exports, CLI
commands, config keys and signatures). Compare them with the claims that cite those
facts. Then sort the results:

- a removed export that a doc cites needs removal evidence before it is called broken;
- a changed signature that a doc cites is a changed reference, which asks for review;
- a bare mention of a name, with no claim about the changed aspect, does not raise a changed-reference finding.

Commands, from an empty directory with Node 22 or newer:

    npm i -D @agentskit/doc-bridge
    npx ak-docs init
    npx ak-docs index
    npx ak-docs query package example --agent

The starter handoff only shows the wiring. The useful part is pointing it at your own
edit roots and checks.

What it does not do: it does not judge whether prose is correct, it never rewrites your docs
on its own (commands that write, such as `init`, `fix` or `vault export`, say so and produce
reviewable output), and the deterministic layer runs without an LLM or API key. Prose analysis stays marked as not analyzed.

Questions for the sub: how do you keep documentation claims current? Do you
check them in CI, by review, or not at all? I am happy to share the method and
the limits of the small agent study we ran on this tool.

Repository: https://github.com/AgentsKit-io/doc-bridge
Landing: https://doc-bridge.agentskit.io
Hosted documentation maintenance from AgentsKit (early access): join the waitlist on the landing page.

## Draft 4: awesome-list entries

These lists accept pull requests or submissions from humans. Do not add the
agent opt-in marker to the title of a pull request; a maintainer opens and owns it.

### punkpeye/awesome-mcp-servers (pull request)

Contribution format (from the list's CONTRIBUTING.md): fork, branch, edit
`README.md` with one server per line in an existing category, keep alphabetical
order inside the category, and describe the server in a concise line. The list's scope is
servers with a public GitHub repository that you install and run yourself, which fits.

Exact entry line, to place in the **Developer Tools** section (check alphabetical
order inside that section before opening the PR):

```markdown
- [AgentsKit-io/doc-bridge](https://github.com/AgentsKit-io/doc-bridge) 📇 🏠 - Deterministic documentation drift findings and evidence-linked handoffs for coding agents: CLI and MCP server, no API key needed for the core.
```

Legend check: 📇 is the TypeScript codebase marker and 🏠 is the local-service
marker, per the list's legend. The list also asks for operating-system markers; add
them only after a maintainer confirms the platforms in the install instructions.

PR title: `Add doc-bridge (documentation drift findings for coding agents)`

PR body: a one-line description, the repository link, and the landing link.

### wong2/awesome-mcp-servers (no pull requests)

This list states at the top of its README that it does not accept pull requests.
Submit through its website form at https://mcpservers.org/submit instead. Use the
same description as the entry above and the repository link.

## Assets

- Terminal recording of the two-minute path and the drift diff (steps 2 and 5 of the tutorial).
- Two screenshots: one handoff and one drift finding. Real output only.
- The README's runnable verify-handoff example, linked rather than copied.
- Study chart, only with its denominators and limits in the caption, linked to the
  [minimal study results](../study/minimal-study-results-v1.md).

## Measurement

Measure clone to init to index to first useful query duration, successful activation
reports, common setup errors and substantive feedback. Keep starter-fixture success
separate from real repository ownership. Collect aggregate feedback only, without
tracking code, and do not claim causal conversion effects.

## What not to claim

Do not claim universal semantic correctness, zero false positives, all-language
coverage, automatic approval, guaranteed activation times, provider-token savings,
or that the study proves a general or enterprise benefit. Do not describe run 2 as a
controlled comparison with run 1. Do not describe a Studio UI as part of doc-bridge,
promote a hosted or commercial offering beyond the waitlist line, or imply that optional
LLM remediation is required by the deterministic core. Unknown analysis is not a clean bill of health.

Nothing in this plan authorizes posting, submitting or opening pull requests. A
maintainer makes each decision.
