/**
 * The CLI's usage text, in its own module.
 *
 * `ak-docs parity` checks that a command this repository documents in public is a command the CLI
 * actually offers, which means something other than the CLI has to be able to read the usage. The
 * text lives here so that check does not import the program and create a cycle through it.
 */
export const CLI_COMMAND_USAGE = `ak-docs — human↔agent documentation bridge (@agentskit/doc-bridge)

Core (no API key):
  ak-docs init [--demo] [--scaffold-workspaces]
  ak-docs demo [--fixture example|monorepo] [--text] [--in-project]
  ak-docs doctor [--text] [--badge] [--write-badge]
  ak-docs index [--watch]
  ak-docs discover [--text|--json]
  ak-docs benchmark <fixture.json> <observation.json> [--text|--json]
  ak-docs bench retrieval <suite.json> [--index <file>] [--baseline <file>] [--limit <n>] [--text|--json]
  ak-docs bench retrieval <suite.json> --update-baseline --by <name> [--reason <text>]
  ak-docs study protocol <protocol.json> [--text|--json]
  ak-docs study history <registry.json> [--protocol <protocol.json>] [--text|--json]
  ak-docs study tasks <task-suite.json> [--text|--json]
  ak-docs study select <task-suite.json> [--text|--json]
  ak-docs study plan <run-plan.json> [--text|--json]
  ak-docs study providers <provider-cli.json> [--text|--json]
  ak-docs study run <run-plan.json> <task-suite.json> --providers <provider-cli.json> --repositories <repositories.json> --ledger <ledger.json> [--round <id>] [--dry-run] [--text|--json]
  ak-docs study adjudicate <observation-ledger.json> <task-suite.json> --adjudicator <provider-cli.json> --output <ledger.json> [--run-id <id>] [--offset <n>] [--limit <n>] [--text|--json]
  ak-docs study ledger <observation-ledger.json> [--text|--json]
  ak-docs study verification <binding.json> [--text|--json]
  ak-docs study metrics <observation-ledger.json> [--baseline-round <id>] [--current-round <id>] [--baseline-run-id <id>] [--current-run-id <id>] [--allow-regressions] [--text|--json]
  ak-docs scan | reconcile | check | map [--text|--json] [--html] [--report-threshold <bytes>]
  ak-docs check --json --format finding             emit diagnostics in the ecosystem Finding shape
  ak-docs bench retrieval <suite> --overlay        measure the suite with and without the accepted overlay
  ak-docs enrich --retrieval-delta                 run the overlay through the golden suite after enriching
  ak-docs study expectations <suite> --expectations <file>   check the study's mechanical retrieval expectations
  ak-docs check --enrich          run the enrichment stage between reconcile and evaluate
  ak-docs enrich [--json|--text]  run the configured Registry roles over context packs
  ak-docs enrich list | approve <proposalId> --by <name> | reject <proposalId> --by <name> [--reason <text>]
  ak-docs fix propose links|normalize <artifact> [--output <file>]
  ak-docs fix approve|apply <proposal.json> [--by <name>]
  ak-docs suggest [--documentation] [--json|--text]   run the configured Registry agent
  ak-docs query [package|ownership|intent|change] <id> [--agent] [--text]
  ak-docs search <term> [--agent] [--explain] [--mode=<mode>] [--context-budget=<tokens>] [--text]
  ak-docs list <packages|intents|changes|knowledge> [--text]
  ak-docs ask [question]          local consult (no LLM)
  ak-docs gate run [gate-id]
  ak-docs rules run <report.json> [--preset default|recommended|strict] [--severity rule=level] [--ignore rule]
  ak-docs conformance run documentation-standard-v1 [--text|--json]
  ak-docs audit documentation [--text|--json]
  ak-docs parity [--claims <file>] [--json|--text]   check public claims against what the repository proves
  ak-docs render <llms.txt|area|ownership|change-digest|overlay-review> [--data <artifact>] [--output <path>] [--print-template] [--json]
  ak-docs mcp
  ak-docs mcp install --cursor | --claude
  ak-docs memory ingest|classify|promote [--pr] [--dry-run]
  ak-docs bootstrap agent-docs
  ak-docs validate-config | validate-handoff <file>

Intelligence (optional AgentsKit peers):
  ak-docs rag ingest|search <query>
  ak-docs chat                    terminal chat (Ink + RAG)
  ak-docs ask <question> --chat   one-shot grounded answer

Advanced / ecosystem:
  ak-docs retrieve <query>
  ak-docs registry topology
  ak-docs playbook draft | pattern [--text]

Global flags:
  -h, --help   --version
  --config <path>   (project root = config file directory)
  --agent   --json   --text   --chat   --demo
`
