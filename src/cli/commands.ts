import { Command } from 'commander'

import { PACKAGE_VERSION } from '../version.js'

/*
 * The command surface, declared once. commander owns the names, descriptions and generated help;
 * each command's flags are still read from argv by program.ts, because several commands accept
 * flags in any position and undeclared flags have always been accepted. Declaring every flag here
 * would change which invocations are accepted, so that move is a separate step.
 */

interface CommandSpec {
  readonly name: string
  readonly usage?: string
  readonly description: string
  readonly subcommands?: readonly CommandSpec[]
}

const COMMANDS: readonly CommandSpec[] = [
  { name: 'validate-config', description: 'Validate the doc-bridge config file' },
  { name: 'validate-handoff', usage: '<file>', description: 'Validate an AgentHandoff JSON file' },
  { name: 'init', usage: '[--demo] [--scaffold-workspaces]', description: 'Scaffold the config, agent INDEX, and optional demo ownership' },
  { name: 'bootstrap', usage: 'agent-docs', description: 'Draft agent docs from existing human docs', subcommands: [
    { name: 'agent-docs', description: 'Create draft docs under docs/for-agents/human' },
  ] },
  { name: 'memory', usage: 'ingest|classify|promote [--pr] [--dry-run]', description: 'Normalize, classify, and promote local memory candidates', subcommands: [
    { name: 'ingest', description: 'Normalize local memory files into candidates' },
    { name: 'classify', description: 'Route candidates to agent, human, playbook, or discard' },
    { name: 'promote', usage: '[--pr] [--dry-run]', description: 'Build a draft-only promotion body' },
  ] },
  { name: 'playbook', usage: 'draft | pattern [--text]', description: 'Draft playbook feedback or export the Doc Bridge pattern', subcommands: [
    { name: 'draft', description: 'Build a draft Playbook feedback payload' },
    { name: 'pattern', usage: '[--text]', description: 'Export the published Doc Bridge pattern' },
  ] },
  { name: 'registry', usage: 'topology', description: 'Print the doc-curator topology', subcommands: [
    { name: 'topology', description: 'Print the doc-curator topology for Registry composition' },
  ] },
  { name: 'diff', usage: '--base <snapshot.json> [--head <snapshot.json>] [--root <dir>] [--output <file>] [--json]', description: 'Compare discovery snapshots, or verify frozen local head bytes' },
  { name: 'discover', usage: '[--text|--json]', description: 'Discover the repository and print its snapshot' },
  { name: 'benchmark', usage: '<fixture.json> <observation.json> [--text|--json]', description: 'Measure an observation against a benchmark fixture' },
  { name: 'bench', usage: 'retrieval <suite.json> [--index <file>] [--baseline <file>] [--limit <n>] [--text|--json]', description: 'Measure retrieval quality against a golden query suite', subcommands: [
    { name: 'retrieval', usage: '<suite.json> [--index <file>] [--baseline <file>] [--limit <n>] [--text|--json]', description: 'Score a suite; compare with an approved baseline' },
  ] },
  { name: 'study', usage: 'protocol|history|tasks|select|plan|providers|run|adjudicate|ledger|verification|metrics|expectations <artifact.json> [--text|--json]', description: 'Validate and run controlled study artifacts', subcommands: [
    { name: 'protocol', description: 'Validate a study protocol' },
    { name: 'history', description: 'Validate a historical evidence registry' },
    { name: 'tasks', description: 'Validate a study task suite' },
    { name: 'select', description: 'Select task executions from a suite' },
    { name: 'plan', description: 'Validate a controlled run plan' },
    { name: 'providers', description: 'Validate a provider CLI configuration' },
    { name: 'run', description: 'Run a controlled study against providers and repositories' },
    { name: 'adjudicate', description: 'Adjudicate an observation ledger independently' },
    { name: 'ledger', description: 'Validate an observation ledger' },
    { name: 'verification', description: 'Validate a verification binding' },
    { name: 'metrics', description: 'Compare study rounds on an observation ledger' },
    { name: 'expectations', description: 'Check a study round against its mechanical expectations' },
  ] },
  { name: 'scan', usage: '[--text|--json] [--html] [--report-threshold <bytes>]', description: 'Run the collect and normalize stages' },
  { name: 'reconcile', usage: '[--text|--json] [--html] [--report-threshold <bytes>]', description: 'Run the stages through reconciliation' },
  { name: 'check', usage: '[--text|--json] [--format finding] [--enrich]', description: 'Run reconciliation and rule evaluation' },
  { name: 'map', usage: '[--text|--json] [--html] [--report-threshold <bytes>]', description: 'Write the architecture map' },
  { name: 'fix', usage: 'propose|revalidate|approve|apply|reject <remediation.json> --base <snapshot.json> --allowed-root <path> [--by <name>] [--yes]', description: 'Propose, review, and apply region remediations' },
  { name: 'suggest', usage: '[--documentation] [--json|--text]', description: 'Run the configured Registry agent' },
  { name: 'enrich', usage: '[--json|--text] [--retrieval-delta]', description: 'Run the enrichment stage over context packs', subcommands: [
    { name: 'list', description: 'List pending enrichment proposals' },
    { name: 'approve', usage: '<proposalId> --by <name>', description: 'Approve an enrichment proposal' },
    { name: 'reject', usage: '<proposalId> --by <name> [--reason <text>]', description: 'Reject an enrichment proposal' },
  ] },
  { name: 'index', usage: '[--watch] [--allow-pending-findings]', description: 'Build the documentation index and optional llms.txt' },
  { name: 'gate', usage: 'run [gate-id]', description: 'Run the configured documentation gates', subcommands: [
    { name: 'run', usage: '[gate-id]', description: 'Run every resolved gate, or one by id' },
  ] },
  { name: 'rules', usage: 'run <report.json> [--preset default|recommended|strict] [--severity rule=level] [--ignore rule]', description: 'Evaluate rules over a reconciliation report', subcommands: [
    { name: 'run', usage: '<report.json> [--preset default|recommended|strict] [--severity rule=level] [--ignore rule]', description: 'Evaluate rules over a reconciliation report' },
  ] },
  { name: 'mcp', usage: '[install --cursor | --claude]', description: 'Start the MCP server, or write its client configuration', subcommands: [
    { name: 'install', usage: '--cursor | --claude', description: 'Write MCP server configuration for Cursor or Claude Desktop' },
  ] },
  { name: 'doctor', usage: '[--text] [--badge] [--write-badge]', description: 'Report coverage, gaps, gates, and the badge' },
  { name: 'demo', usage: '[--fixture example|monorepo] [--text] [--in-project]', description: 'Run the bundled walk-through: handoff, gate red to green, MCP snippet' },
  { name: 'query', usage: '[package|ownership|intent|change] <id> [--agent] [--text] [--no-refresh]', description: 'Resolve a package, area, intent, or change to a handoff' },
  { name: 'search', usage: '<term> [--agent] [--explain] [--mode=<mode>] [--context-budget=<tokens>] [--text] [--no-refresh]', description: 'Ranked search over the retrieval projection' },
  { name: 'retrieve', usage: '<query>', description: 'Hybrid local and federated retrieval chunks' },
  { name: 'why', usage: '<path|symbol|concept> [--json]', description: 'Explain the indexed rationale for a path, symbol, or concept' },
  { name: 'ask', usage: '[question] [--chat] [--no-refresh]', description: 'Local consult with no LLM; an interactive REPL in a terminal' },
  { name: 'chat', description: 'Interactive terminal chat (Ink and RAG)' },
  { name: 'rag', usage: 'ingest|search <query>', description: 'Ingest the agent corpus or search its vectors', subcommands: [
    { name: 'ingest', description: 'Ingest the agent corpus into the vector store' },
    { name: 'search', usage: '<query>', description: 'Semantic search over ingested vectors' },
  ] },
  { name: 'list', usage: '<packages|intents|changes|knowledge> [--text]', description: 'List packages, intents, changes, or knowledge documents' },
  { name: 'conformance', usage: 'run documentation-standard-v1 [--text|--json]', description: 'Run the documentation conformance profile', subcommands: [
    { name: 'run', usage: 'documentation-standard-v1 [--text|--json]', description: 'Run the stable documentation profile with evidence' },
  ] },
  { name: 'audit', usage: 'documentation [--text|--json]', description: 'Measure documentation quality against the project graph', subcommands: [
    { name: 'documentation', usage: '[--text|--json]', description: 'Measure documentation quality and claims' },
  ] },
  { name: 'parity', usage: '[--claims <file>] [--json|--text]', description: 'Check public claims against what the repository proves' },
  { name: 'render', usage: '<llms.txt|area|ownership|change-digest|overlay-review> [--data <artifact>] [--output <path>] [--print-template] [--json]', description: 'Render canonical artifacts as Markdown from templates' },
  { name: 'vault', usage: 'export|diff [--pr] [--config <path>] [--text|--json]', description: 'Export generated Markdown navigation, or review note edits', subcommands: [
    { name: 'export', usage: '[--findings]', description: 'Export the generated vault navigation' },
    { name: 'diff', usage: '[--pr]', description: 'Store generated-note edits as pending proposals' },
  ] },
  { name: 'studio', usage: 'export [--output <file>] [--json] [--config <path>]', description: 'Export the studio graph', subcommands: [
    { name: 'export', usage: '[--output <file>] [--json] [--config <path>]', description: 'Export the studio graph as JSON' },
  ] },
  { name: 'action', usage: 'index|snapshot --revision <sha> --root <checkout> --output <outside-artifact>', description: 'Action analysis over an exact-revision checkout', subcommands: [
    { name: 'index', description: 'Build and report the index for a revision' },
    { name: 'snapshot', description: 'Capture a discovery snapshot for a revision' },
  ] },
]

const FOOTER = `
Optional remediation:
  ak-docs fix --llm --base <snapshot.json> [--responses <script.json>] [--dry-run] [--pr]

Global flags:
  -h, --help   --version
  --config <path>   (project root = config file directory)
  --agent   --json   --text   --chat   --demo
`

const build = (spec: CommandSpec): Command => {
  const command = new Command(spec.name).description(spec.description).exitOverride()
  if (spec.usage) command.usage(spec.usage)
  for (const sub of spec.subcommands ?? []) command.addCommand(build(sub))
  return command
}

/** The root program with every command registered, writing through the current process streams. */
export const buildCommandProgram = (): Command => {
  const program = new Command('ak-docs')
    .description('ak-docs — human↔agent documentation bridge (@agentskit/doc-bridge)')
    .version(`ak-docs ${PACKAGE_VERSION} (@agentskit/doc-bridge)`, '-V, --version')
    .exitOverride()
    .configureOutput({
      writeOut: (text) => process.stdout.write(text),
      writeErr: (text) => process.stderr.write(text),
    })
    .addHelpText('after', FOOTER)
  for (const spec of COMMANDS) program.addCommand(build(spec))
  return program
}

/** Names the parser accepts as a command. Anything else is handled as the top-level help. */
export const COMMAND_NAMES: ReadonlySet<string> = new Set(COMMANDS.map((spec) => spec.name))

/** Print the top-level help, or one command's help, generated by commander. */
export const writeCommandHelp = (name?: string): void => {
  const program = buildCommandProgram()
  const target = name === undefined ? undefined : program.commands.find((command) => command.name() === name)
  ;(target ?? program).outputHelp()
}
