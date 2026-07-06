# @agentskit/doc-bridge

Portable documentation bridge for AI coding agents — connects **agent corpus** (for-agents / OKF), **human corpus** (Fumadocs, Docusaurus, etc.), and **deterministic handoffs** (where to edit, which checks to run).

Built on [AgentsKit](https://www.agentskit.io) six contracts (`Adapter`, `Tool`, `Skill`, `Memory`, `Retriever`, `Runtime`). Dogfoods the [Agents Playbook](https://playbook.agentskit.io) and [Registry](https://registry.agentskit.io) agents.

## Status

**Early design** — tracking implementation in [GitHub Issues](https://github.com/AgentsKit-io/doc-bridge/issues). Reference architecture distilled from [AgentsKit OS RFC-0056](https://github.com/AgentsKit-io/agentskit-os/blob/main/docs/rfc/0056-doc-bridge-ecosystem-dogfood.md).

## Three artifacts

| Artifact | Playbook pattern | Purpose |
|----------|------------------|---------|
| **OKF knowledge** | [Open Knowledge Format](https://playbook.agentskit.io/docs/pillars/ai-collaboration/open-knowledge-format-pattern) | What things mean (markdown + frontmatter) |
| **Self-Describe** | [Self-Describe](https://playbook.agentskit.io/docs/pillars/ai-collaboration/self-describe-pattern) | What the system can do (`llms.txt`, capabilities) |
| **AgentHandoff** | [Bootstrap Doc](https://playbook.agentskit.io/docs/pillars/ai-collaboration/bootstrap-doc-pattern) | Where to start editing + which gates to run |

## Surfaces

- **CLI** — `doc-bridge query package <id> --agent` → JSON handoff
- **MCP** — `doc.search`, `doc.get`, `handoff.resolve` for Cursor, Claude Desktop, etc.
- **Adapters** — Fumadocs, Docusaurus, plain markdown, pnpm monorepo
- **Memory** — ingest IDE memory files → classify → auto-document (draft PR + CI gates)

## Ecosystem

Part of the [AgentsKit ecosystem](https://www.agentskit.io):

- [AgentsKit](https://www.agentskit.io) — framework (`@agentskit/*`)
- [AgentsKit OS](https://akos.agentskit.io) — reference implementation
- [Agents Playbook](https://playbook.agentskit.io) — patterns + feedback loop
- [Registry](https://registry.agentskit.io) — `docs-chat`, `knowledge-promoter`, etc.

## License

MIT
