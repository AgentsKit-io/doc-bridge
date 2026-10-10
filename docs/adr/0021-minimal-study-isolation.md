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

## Transport for the pilot (2026-10-09)

The pilot runs through the Claude Code CLI in headless mode (`--transport cli`),
authenticated by the CLI's own login. The runner never reads, requires or passes
`ANTHROPIC_API_KEY`, and removes it from the child environment. Each attempt is a
fresh `claude -p` child with an argument array, a `cwd` at the frozen checkout, an
allowlisted environment, a timeout and an output bound. It uses read and search
tools only, through `--tools`, `--allowedTools` and `--disallowedTools`, and
non-interactive permissions (`--permission-mode dontAsk`, `--permission-prompts
none`). Scenarios differ only in `--mcp-config` and the doc-bridge tool allowance.
The cap applies to the CLI-reported cost; each attempt is capped by
`min(remaining, per-attempt limit)` through `--max-budget-usd`. A failed attempt is
charged the full per-attempt limit.

The Messages API transport (`--transport http`) remains as an option. It keeps its
environment-only key, upper prices and built-in `fetch`, and it is tested as before.

Rules reused from [ADR 0009](0009-study-provider-cli-adapter.md): an executable plus
an argument array (never a shell string), an allowlisted environment, bounded input,
output and runtime, a single JSON object on stdout, and fail-closed handling of
non-zero exit, timeout and malformed JSON. The runner does not import
`src/study/provider-cli.ts`. That module provides configuration, hashing and pricing
helpers, but no process invocation. The optional `.mjs` runner therefore carries
its own short implementation of the same rules.

Alternatives rejected:

- `--bare` excludes `CLAUDE.md`, hooks, plugins and auto-memory more completely, but
  its help text states that Anthropic auth becomes strictly `ANTHROPIC_API_KEY` or
  `apiKeyHelper`. That would reintroduce a key, so it was rejected.
- `--safe-mode` excludes `CLAUDE.md` and customizations, but its help lists MCP
  servers as disabled. The doc-bridge arm would then depend on an untested
  interaction with the explicit `--mcp-config`, which could silently remove the
  treatment. It was not used.
- Replacing the system prompt with a minimal one (`--system-prompt`) would change the
  agent being measured. The default Claude Code system prompt is kept in both
  scenarios.

Consequences: the CLI's login must be present on the machine that runs the pilot.
Absolute token counts include the Claude Code system prompt and harness, so they are
comparable only between the two scenarios. The reported cost is the CLI's own
estimate and is not a billed amount on a subscription login. Isolation is partial:
`CLAUDE.md` and automatic memory are not excluded, and the checkout's `.git` is
reachable by read tools. See [minimal-study-v1 Transport](../study/minimal-study-v1.md#transport-claude-code-cli-pilot-transport)
for the full list. No flag was verified against a live run, and this ADR does not
approve a result.
