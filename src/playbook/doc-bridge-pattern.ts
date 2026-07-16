export const DOC_BRIDGE_PATTERN_ID = 'doc-bridge-pattern' as const

export const DOC_BRIDGE_PATTERN_META = {
  id: DOC_BRIDGE_PATTERN_ID,
  title: 'Doc Bridge Pattern',
  slug: 'pillars/ai-collaboration/doc-bridge-pattern',
  license: 'CC-BY-4.0',
  visibility: 'public',
  playbookUrl: 'https://playbook.agentskit.io/patterns/doc-bridge-pattern',
  npmPackage: '@agentskit/doc-bridge',
  cli: 'ak-docs',
} as const

export const docBridgePatternMarkdown = (): string => `---
type: pattern
id: ${DOC_BRIDGE_PATTERN_ID}
purpose: Route coding agents to the correct package, checks, and human docs in any monorepo.
owner: AgentsKit
license: CC-BY-4.0
visibility: public
tags: [agents, documentation, monorepo, handoff, mcp]
---

# Doc Bridge Pattern

**AgentHandoff for your monorepo** — deterministic routing so agents edit the right roots, run the right checks, and stay linked to human documentation.

## Problem

Coding agents guess package ownership. They edit sibling modules, run repo-wide tests, and ship changes without a bridge to human-facing guides. Wikis and RAG explain concepts but weakly answer *where to act*.

## Solution (three artifacts)

| Artifact | Role |
|----------|------|
| **AgentHandoff** | JSON handoff: \`startHere\`, \`editRoots\`, \`checks\`, \`humanDoc\`, \`bridge\` |
| **DocBridgeIndex** | Deterministic index + \`contentHash\` for CI freshness gates |
| **Self-describe** | \`llms.txt\`, \`capabilities.json\` for discovery |

## Four loops

| Loop | Command | Outcome |
|------|---------|---------|
| **Act** | \`ak-docs query package <id> --agent\` | Agent edits only \`editRoots\` |
| **Bridge** | \`ak-docs bootstrap agent-docs\` | Link agent corpus ↔ human site |
| **Learn** | \`ak-docs memory promote --pr\` | HITL draft PR from agent memory |
| **Explain** | \`ak-docs ask "<question>"\` | Local consult + handoff preview |

## 60-second proof

\`\`\`bash
npm i -D @agentskit/doc-bridge
npx ak-docs demo --text
ak-docs mcp install --cursor
\`\`\`

## AgentHandoff example

\`\`\`json
{
  "type": "agent-handoff",
  "startHere": "docs/for-agents/packages/auth.md",
  "editRoots": ["packages/auth"],
  "checks": ["pnpm --filter @demo/auth test"],
  "humanDoc": "/docs/guides/auth",
  "bridge": { "humanDoc": "linked" }
}
\`\`\`

When \`humanDoc\` is missing, handoffs surface \`bridge.action: "ak-docs bootstrap agent-docs"\` — a feature, not a silent gap.

## MCP contract

Agents call \`handoff.resolve\` before editing \`packages/*\`:

1. Read \`startHere\`
2. Stay inside \`editRoots\`
3. Run every \`checks\` command
4. Link \`humanDoc\` or escalate missing bridge

## CI gate

\`\`\`yaml
- uses: AgentsKit-io/doc-bridge@v1.0.0
\`\`\`

Or: \`ak-docs index && ak-docs gate run\` — stale index fails the PR.

## Coverage metric

\`\`\`bash
ak-docs doctor --text
ak-docs doctor --badge
\`\`\`

Teams track handoff % and human-bridge % daily.

## When to use

- pnpm/npm monorepos with real package ownership
- Fumadocus / Docusaurus human sites + dense agent corpus
- Cursor / Claude / Codex agents that should not guess edit roots

## When not to use

- Single-file repos with no ownership boundaries (AGENTS.md may suffice)
- Hosted doc chat as primary product (doc-bridge is routing + bridge, not SaaS chat)

## References

- npm: https://www.npmjs.com/package/@agentskit/doc-bridge
- repo: https://github.com/AgentsKit-io/doc-bridge
- skill: https://github.com/AgentsKit-io/doc-bridge/blob/master/docs/skills/doc-bridge.md
- landing: https://doc-bridge.agentskit.io/
`

export const docBridgePatternPayload = () => ({
  ...DOC_BRIDGE_PATTERN_META,
  format: 'okf-pattern-v1',
  body: docBridgePatternMarkdown(),
})