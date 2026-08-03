# Install Doc Bridge in Cline

Use this guide when Cline needs deterministic Doc Bridge handoffs without adding a dependency to the repository it is inspecting.

## Requirements

- Node.js 22 or newer
- pnpm available on `PATH`
- Cline 4.1 or newer
- An absolute path to the repository Doc Bridge may read

Doc Bridge does not need an API key. It runs locally over stdio and treats the configured working directory as the project boundary.

## Configure Cline

1. Open **Cline → MCP Servers → Configure MCP Servers**.
2. Merge the server below into `cline_mcp_settings.json`. Preserve any existing servers.
3. Replace `/absolute/path/to/your/repository` with the repository's absolute path.

```json
{
  "mcpServers": {
    "ak-docs": {
      "command": "pnpm",
      "args": [
        "dlx",
        "@agentskit/doc-bridge@1.2.6",
        "mcp"
      ],
      "cwd": "/absolute/path/to/your/repository"
    }
  }
}
```

Reload the MCP servers. Cline should show `ak-docs` with eight read-only tools.

The pinned package runner downloads Doc Bridge into pnpm's tool cache. It does not add `@agentskit/doc-bridge` to the repository's `package.json` or lockfile.

## Verify the connection

Ask Cline to call `registry.topology` with an empty object:

```json
{}
```

A successful response includes:

```json
{
  "id": "doc-curator",
  "delegates": ["docs-chat", "knowledge-promoter", "code-review"]
}
```

This check is read-only and does not require a Doc Bridge index.

## Enable repository handoffs

From the configured repository root, generate the deterministic local index:

```bash
pnpm dlx @agentskit/doc-bridge@1.2.6 index
```

Then ask Cline to call `handoff.resolve` before editing a package:

```json
{
  "id": "your-package-id",
  "kind": "package"
}
```

Read `startHere`, stay inside `editRoots`, and run every command in `checks` returned by the handoff.

## Safety boundaries

- Do not run `npm install`, `pnpm add`, or add Doc Bridge as a development dependency merely to start the MCP server.
- Do not add credentials or environment variables; the core MCP server needs none.
- Do not replace other entries in `cline_mcp_settings.json`; merge only the `ak-docs` entry.
- Stop if the package version, server name, or tool count differs from this guide.
- All eight MCP tools declare the read-only annotation. `memory.promoteDraft` produces a reviewable draft and does not publish it.

For the full tool reference and other MCP clients, see [docs/mcp.md](docs/mcp.md).
