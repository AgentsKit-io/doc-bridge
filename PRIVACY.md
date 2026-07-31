# Privacy Policy

Effective date: July 31, 2026

This policy covers the local Doc Bridge MCP server distributed by AgentsKit, including its MCP Bundle for Claude Desktop.

## Data the connector accesses

Doc Bridge accesses only the local project selected by the user through its `doc-bridge.config.json` file. Within that project, its MCP tools may read:

- the Doc Bridge configuration and deterministic index;
- documentation files explicitly included in that index;
- ownership and package metadata described by the configuration;
- `.agent-memory/**` and `.cursor/rules/*.mdc` when the user calls a memory-classification or draft-promotion tool.

Doc Bridge does not read Claude conversation history, Claude memory, browser data, credentials, or files outside the selected project boundary. Indexed-document reads reject paths and symbolic links that resolve outside that boundary.

## Collection, use, and storage

The local MCP server uses project data only to return the handoff, search, documentation, gate, retrieval, memory-classification, draft, or topology result requested by the user. The eight MCP tools are read-only and do not modify project files or publish data.

AgentsKit does not collect or store MCP requests, tool results, project files, or usage telemetry. Source files and any existing Doc Bridge index remain on the user's device and under the user's control.

## Sharing and external services

The local MCP server does not send project data to AgentsKit or another model provider and requires no API key. Claude Desktop receives tool results as the MCP client selected by the user; Anthropic's handling of data in Claude Desktop is governed by Anthropic's own terms and privacy policy.

Optional Doc Bridge RAG and chat integrations are not enabled or bundled by this local connector. If a user separately configures an external adapter or model provider, that provider's privacy terms apply to the data the user chooses to send through that separate integration.

## Retention and deletion

AgentsKit retains no data from the local MCP server. Users control retention by managing their project files, Doc Bridge index, MCP client history, and installed MCP Bundle. Uninstalling the bundle removes the connector; deleting local project data remains the user's responsibility.

## Contact

Questions about this policy can be filed at https://github.com/AgentsKit-io/doc-bridge/issues. Security concerns should follow the private reporting process at https://github.com/AgentsKit-io/doc-bridge/security/policy.

Material changes to this policy will be published in this repository with an updated effective date.
