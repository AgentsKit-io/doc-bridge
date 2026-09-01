---
title: Generic CLI adapter for controlled study providers
status: accepted
date: 2026-08-31
---

# Generic CLI adapter for controlled study providers

## Decision

The controlled study invokes explicitly configured model or agent CLIs as fresh child processes. The adapter accepts an executable plus an argument array, never a shell command string, and allowlists environment variables. Each invocation receives bounded input, runtime, output, and retry limits and must return one JSON object on stdout. Logs belong on stderr.

Provider configuration is content-addressed and maps every `(model, scenario)` pair to exactly one command. The adapter does not bundle or require a local model runtime: hosted providers, vendor CLIs, and AgentsKit Registry agents are configured by the study owner. Provider network access is declared per mapping so the run can be audited; repository task network policy remains governed by the study protocol.

## Alternatives considered

- Ollama as the default: rejected because a heavyweight local runtime would create friction and hardware-dependent results.
- Direct SDK integrations: deferred because they multiply provider-specific dependencies and credential handling in the core package.
- Shell command strings: rejected because shell interpretation makes argument provenance and isolation weaker.

## Consequences

- A real provider can be selected without changing the runner or ledger schema.
- A missing executable, malformed JSON, non-zero exit, timeout, or output limit fails closed and is recorded as unavailable, invalid, failed, timed-out, or budget-exceeded evidence.
- Provider credentials remain outside committed study artifacts; only explicitly allowlisted environment variables are passed to the child.
