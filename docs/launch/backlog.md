---
title: Launch backlog by channel
description: Where to publish after validation, with a tailored angle, assets and draft for each channel. Nothing here is posted automatically.
owner: maintainers
lifecycle: active
sourceOfTruth: docs/launch/backlog.md
validationPath: node bin/ak-docs.js conformance run documentation-standard-v1 --text
---

# Launch backlog by channel

This is a backlog, not a schedule. A human owns every post, comment,
submission and pull request; nothing here is automated. The release-specific
drafts for Show HN, the tutorial, the subreddit post and the MCP lists live in
[channels-2.0.md](channels-2.0.md). This page adds the remaining channels,
the shared assets and the rules for staggering and measuring.

Every draft uses only facts from the [README](../../README.md), the
[getting-started guide](../getting-started.md) and the
[positioning](../POSITIONING.md). If a draft and those documents disagree, the
documents win and the draft is corrected.

## Gates before any outreach

Do not post anywhere until a maintainer has checked every gate.

1. **Published.** The package is published (the publish issue, #13) and
   `npm view @agentskit/doc-bridge version` prints the version being announced.
2. **Run and validated.** The two-minute path
   (`npx ak-docs init && npx ak-docs index && npx ak-docs query package example --agent`)
   works in an empty directory, and a dogfood run on a real repository has been
   validated and its findings fixed. Record the outcome as aggregate notes only;
   do not name private repositories in public material.
3. **Assets exist.** Every item under [Required assets](#required-assets) that
   the channel needs is finished. Show HN needs the demo; Product Hunt needs the
   screenshots and the video.
4. **Links resolve.** The GitHub Release, npm page, README, getting-started
   guide and landing page open without errors.

Missing evidence is not success: if a gate cannot be shown, the channel waits.

## Required assets

| Asset | Status | Content |
| --- | --- | --- |
| One-liner | Ready | **Deterministic proof of documentation drift, with evidence-linked handoffs for coding agents.** |
| Tagline | Ready | **Show the change. Keep the evidence.** |
| Install snippet | Ready | See [Install snippet](#install-snippet). |
| Positioning line | Ready | See [Positioning](#positioning-line). |
| 60-second demo script | Draft | See [Demo script](#60-second-demo-script). |
| Terminal recording | To produce | Real output of the demo script. No credentials or private content. |
| 2-3 screenshots | To produce | A handoff, a drift finding, and the MCP tools in an editor. |
| Demo video (Product Hunt only) | To produce | The recording plus voice-over or captions, under two minutes. |

### Install snippet

Run in an empty directory with Node 22 or newer. No API key.

```bash
npm i -D @agentskit/doc-bridge
npx ak-docs init
npx ak-docs index
npx ak-docs query package example --agent
```

State beside every copy of this snippet that the starter handoff proves the
wiring, not real ownership.

### Positioning line

Use this wording, or something that says the same, in every channel:

> doc-bridge is not a docs site and not a RAG wiki. It reads the docs you already
> have, links them to your code ownership and checks, and proves where they drift.
> The core runs without an LLM or API key.

### 60-second demo script

| Time | On screen | Say |
| --- | --- | --- |
| 0:00-0:08 | Empty directory, `npm i -D @agentskit/doc-bridge` | "Coding agents read repos that were documented for humans." |
| 0:08-0:25 | `npx ak-docs init`, `index`, `query package example --agent` | "One command builds an index. The query returns where to start, where to edit, which checks prove it, and the human guide." |
| 0:25-0:30 | Highlight `startHere`, `editRoots`, `checks`, `humanDoc` | "The starter proves wiring. You replace it with your real ownership." |
| 0:30-0:50 | Remove a cited export, run `ak-docs diff --base <snapshot> --root <repo>` | "Compare two revisions. A changed reference asks for review. A removal needs removal evidence." |
| 0:50-0:60 | `ak-docs mcp install --cursor`, then the landing URL | "Add the MCP server so the agent gets the handoff before it edits. No API key for the core." |

Use the runnable signature fixture from the README so the diff step is
reproducible from a built checkout.

## Channel backlog

Order is a suggestion. Stagger posts as described in
[Staggering and measurement](#staggering-and-measurement).

| # | Channel | Needs | Angle | Draft |
| --- | --- | --- | --- | --- |
| 1 | GitHub Release and npm page | Gates 1, 2, 4 | What changed, copy-paste install | [Draft A](#draft-a-github-release-and-npm-page) |
| 2 | DEV / Hashnode tutorial | Gates 1-3 | "Make your docs usable by coding agents" | [Draft B](#draft-b-dev--hashnode-tutorial) |
| 3 | Awesome lists | Gates 1, 2, 4 | One accurate line per list | [Draft C](#draft-c-awesome-lists) |
| 4 | Fumadocs / Docusaurus communities | Gates 1-3, polished example | Adapter-first, integration question | [Draft D](#draft-d-fumadocs-and-docusaurus-communities) |
| 5 | Show HN | Gates 1-3 plus the demo | Method and limits | [channels-2.0.md, Draft 1](channels-2.0.md#draft-1-show-hn) |
| 6 | Reddit (one subreddit at a time) | Gates 1-3 | Educational, discloses affiliation | [Draft E](#draft-e-reddit) and [channels-2.0.md, Draft 3](channels-2.0.md#draft-3-community-educational-post-rtypescript-or-rjavascript) |
| 7 | Product Hunt | Gates 1-3 plus screenshots and video | Visual before/after | [Draft F](#draft-f-product-hunt) |

### Draft A: GitHub Release and npm page

**Angle:** the release page and the npm page are the canonical landing spots.
Keep them factual and short; link the tutorial once it exists.

**Release notes opening:**

> doc-bridge turns the docs you already have into evidence-linked handoffs for
> coding agents and proves where documentation drifts from code. The core is
> deterministic and needs no LLM or API key.
>
> Try it: `npx ak-docs init && npx ak-docs index && npx ak-docs query package example --agent`
>
> The starter handoff proves wiring only. Replace it with your edit roots and checks.

**Checks:** the npm page renders the README, the badges and the topics
(`ai-agents`, `documentation`, `mcp`, `llms-txt`, `typescript`). Run
`npm pack --dry-run` before publishing.

### Draft B: DEV / Hashnode tutorial

**Angle:** a how-to for maintainers, not a product announcement.

**Title:** Make your docs usable by coding agents (no API key needed)

**Outline:**

1. Why agents guess ownership and run the wrong test when docs are written for humans.
2. The two-minute path from the install snippet, with the wiring-only caveat.
3. Replace the starter with real edit roots and checks; show the handoff shape.
4. Link a human docs site (Fumadocs, Docusaurus or plain markdown) to the handoff.
5. Install the MCP server so the agent resolves the handoff before editing.
6. Detect drift between two revisions and read the finding.
7. What it does not do: no natural-language correctness judgement, no automatic edits.

The longer outline with the diff walkthrough is
[channels-2.0.md, Draft 2](channels-2.0.md#draft-2-dev--hashnode-tutorial-outline).
Publish this first and use it as the canonical link for other channels.

### Draft C: awesome lists

**Angle:** one accurate, neutral line. A maintainer opens each pull request,
reads the list's current contribution rules first, and follows them exactly.

| List | Section to target | Line |
| --- | --- | --- |
| awesome-mcp-servers | Developer tools | See [channels-2.0.md, Draft 4](channels-2.0.md#draft-4-awesome-list-entries). |
| awesome-llms-txt | Tools or generators, if the list has one | `doc-bridge - generates and checks an llms.txt-compatible index for repository docs, with evidence-linked handoffs for coding agents.` |
| awesome-ai-agents | Developer tools or infrastructure, if the list has one | `doc-bridge - CLI and MCP server that give coding agents the files to edit, the checks to run and the human doc for a task. No API key for the core.` |
| Documentation tooling lists | Documentation quality or linting | `doc-bridge - deterministic checks for documentation drift between two revisions, with evidence on both sides.` |

Before opening each pull request, confirm that the list is maintained, that
the entry fits its stated scope, and that the description matches the README.
Skip a list whose rules exclude the project.

### Draft D: Fumadocs and Docusaurus communities

**Angle:** adapter-first. Lead with the integration, ask for feedback on it.
Post only when a polished example for that framework exists
(see the [examples](../examples.md) and `examples/fumadocs-with-chat.config.ts`).

**Draft:**

> We built an open-source adapter that links a Fumadocs (or Docusaurus) site to
> the agent-facing handoff for the same code area, so a coding agent knows which
> guide explains the code it is about to edit. The core is deterministic and runs
> without an API key. Disclosure: I work on the project.
>
> Example config and the two-minute path: <repository link>. I would like to know
> where the adapter's assumptions about your docs layout break.

Use each community's designated channel (for example a showcase or
discussion category) and follow its rules. Do not post in general support
channels.

### Draft E: Reddit

**Angle:** educational question, not an announcement. Candidate subreddits are
r/typescript, r/javascript, r/webdev and r/opensource. Post in one at a time,
read its current rules first, use required flair, and disclose affiliation.

Use [channels-2.0.md, Draft 3](channels-2.0.md#draft-3-community-educational-post-rtypescript-or-rjavascript)
as the base. Adapt the opening to the subreddit:

| Subreddit | Opening angle |
| --- | --- |
| r/typescript | Checking that a docs claim still matches the exported signature it cites. |
| r/javascript | Keeping README and guide commands in step with the CLI they describe. |
| r/webdev | Making a docs site useful to coding agents as well as readers. |
| r/opensource | Documentation maintenance as a shared cost, and what a check can and cannot prove. |

### Draft F: Product Hunt

**Angle:** visual. Hold until screenshots and the demo video exist.

- **Name:** doc-bridge
- **Tagline:** Show the change. Keep the evidence.
- **Description (under 260 characters):** Deterministic proof of documentation drift, with evidence-linked handoffs for coding agents. CLI and MCP server. No API key for the core.
- **First comment:** who it is for (teams with real code ownership), the install snippet, the positioning line, and what it does not do.
- **Gallery:** the handoff, the drift finding, the MCP tools, then the video.

## Staggering and measurement

- Leave at least a few days between channels. Publish the tutorial first, then
  lists, then community posts, then Show HN and Product Hunt, each in a window
  when a maintainer can answer questions the same day.
- Do not post identical copy in several places. Each channel gets its own angle
  and its own text. Never cross-post a draft the same day.
- After each post, record in an issue comment: date, link, questions raised,
  failed activation steps and substantive feedback. Fix the docs or product
  before the next channel when a failure repeats.
- Measure with aggregate counts only (visits from the platform's own analytics,
  stars, installs, issues opened). Do not add tracking code and do not claim a
  causal conversion effect.
- Stop and reassess if a channel's response is negative about the method, not
  only about the wording.

## What not to claim

Do not claim universal semantic correctness, zero false positives, all-language
coverage, automatic approval, guaranteed activation times, provider-token savings,
or a general benefit from the study. Do not present a Studio UI, a hosted offering
or required LLM remediation as part of the package. Unknown analysis is not a
clean bill of health.

Nothing on this page authorizes posting, submitting or opening pull requests.
