---
title: Choose the right context layer
description: Decide when an agent needs repository rules, deterministic routing, code search, RAG, or human review.
---

# Choose the right context layer

Coding agents rarely fail because a repository has no context. They fail because the right context arrives too late, or because several different kinds of context are treated as interchangeable.

`AGENTS.md`, Doc Bridge, code search, RAG, and human review solve different problems. The most reliable workflow composes them in that order instead of asking one layer to do every job.

## The short version

| Layer | Best question | Use it for | Do not rely on it for |
| --- | --- | --- | --- |
| `AGENTS.md` | What rules apply here? | Repository-wide invariants, conventions, safety rules, and workflow expectations | Selecting the owner of every task in a large monorepo |
| Doc Bridge | Where does this task belong? | Deterministic ownership, starting docs, declared edit roots, package checks, and matching human docs | Explaining every implementation detail or enforcing filesystem permissions |
| Code search | Where is this exact thing used? | Symbols, imports, references, call sites, and concrete strings | Deciding ownership from similarity alone |
| RAG | What broader context may be relevant? | Design history, migrations, scattered documentation, and open-ended questions | Overriding an explicit ownership contract |
| Human review | Is this boundary still correct? | Ambiguous, cross-cutting, security-sensitive, or high-impact decisions | Routine routing that the repository can declare and test |

## Start with repository rules

An `AGENTS.md` file is the right place for rules that should survive individual tasks:

- required coding conventions;
- security and privacy constraints;
- commands that must run before a change is accepted;
- architectural invariants;
- contribution and release expectations.

Doc Bridge does not replace those rules. A handoff can include `AGENTS.md` in `readBeforeEditing`, then narrow the task to the package-specific material that matters.

## Use Doc Bridge for deterministic routing

When the repository already knows which package owns authentication, the agent should not infer ownership from filenames or semantic similarity. Resolve a handoff first:

```bash
ak-docs query package auth --agent
```

A useful handoff answers four operational questions:

```json
{
  "startHere": "docs/for-agents/packages/auth.md",
  "editRoots": ["packages/auth"],
  "checks": [
    "pnpm --filter @example/auth test",
    "pnpm --filter @example/auth lint"
  ],
  "humanDoc": "docs/guides/auth.md"
}
```

This is intentionally smaller than a repository dump. It gives the agent an explicit starting point, declared scope, evidence to run, and a human-facing description of the same feature.

`editRoots` is a routing and audit contract. It does not create an operating-system sandbox by itself. If a workflow must technically prevent writes outside those roots, enforce that boundary with the agent runner, sandbox, permissions, or CI policy.

## Search after scope is known

Code search is strongest after the owner is resolved. Inside the intended scope, use it to find:

- the implementation of a symbol;
- all imports of an adapter;
- tests for an error code;
- callers affected by a signature change.

Search can reveal that a task is genuinely cross-cutting. When it does, expand the declared handoff or ask for human review. Do not quietly turn a package-scoped change into a repository-wide edit.

## Add RAG for open-ended context

RAG is useful when the question does not have one exact answer:

- Why did the authentication design change?
- Which migration notes mention token rotation?
- What guidance exists for moving from one provider to another?

That context can improve the implementation, but it should expand a deterministic handoff rather than replace one. Similar documents are evidence, not ownership.

Doc Bridge keeps this distinction explicit: Layer 0 indexing and handoffs work offline without a model or API key; RAG and chat are optional intelligence layers.

## Escalate ambiguity to a human

Some changes should not be forced into a convenient directory. Ask for human review when:

- multiple packages legitimately own part of the change;
- a public contract or security boundary may change;
- the handoff conflicts with the current repository shape;
- checks are missing or no longer prove the behavior;
- the cost of a wrong boundary is high.

A useful routing system should make uncertainty visible. It should not produce false confidence when the repository has not declared an answer.

## Recommended order

```text
resolve handoff
  → read AGENTS.md and startHere
  → search exact code inside the declared scope
  → retrieve broader context when needed
  → edit the intended roots
  → run the declared checks
  → request human review for unresolved boundaries
```

For an existing repository, the smallest adoption path is:

```bash
npm install --save-dev @agentskit/doc-bridge@1.2.6
npx ak-docs init
npx ak-docs index
npx ak-docs query package example --agent
npx ak-docs gate run
```

The gate makes drift visible when ownership inputs or linked documentation change without a refreshed index. That keeps the routing contract reviewable instead of silently rebuilding it during validation.

## A practical decision rule

If the question begins with **must**, put the invariant in repository instructions. If it begins with **where**, resolve a Doc Bridge handoff. If it begins with **which exact reference**, search the code. If it begins with **why** or **what else**, retrieve broader context. If the answers disagree, stop and ask a human.

## Related

- [Index and query](./index-and-query.md)
- [For agents](../for-agents.md)
- [Chat and RAG](../chat-and-rag.md)
- [Gate in CI](./gate-ci.md)
- [AgentHandoff schema](../schemas/agent-handoff-v1.md)
