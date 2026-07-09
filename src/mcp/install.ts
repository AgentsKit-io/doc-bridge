import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

export type McpInstallTarget = 'cursor' | 'claude'

export type McpInstallResult = {
  readonly ok: boolean
  readonly target: McpInstallTarget
  readonly configPath: string
  readonly created: boolean
  readonly serverName: string
  readonly nextSteps: readonly string[]
}

const SERVER_NAME = 'ak-docs'

const mcpServerEntry = (root: string) => ({
  command: 'npx',
  args: ['ak-docs', 'mcp'],
  cwd: root,
})

const readJson = (path: string): Record<string, unknown> => {
  if (!existsSync(path)) return {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

const writeJson = (path: string, value: Record<string, unknown>): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

const resolveTargetPath = (target: McpInstallTarget, root: string): string => {
  if (target === 'cursor') return resolve(root, '.cursor', 'mcp.json')
  return join(homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
}

export const installMcpConfig = (
  root: string,
  target: McpInstallTarget,
): McpInstallResult => {
  const configPath = resolveTargetPath(target, root)
  const created = !existsSync(configPath)
  const existing = readJson(configPath)
  const servers =
    existing.mcpServers && typeof existing.mcpServers === 'object' && !Array.isArray(existing.mcpServers)
      ? { ...(existing.mcpServers as Record<string, unknown>) }
      : {}

  servers[SERVER_NAME] = mcpServerEntry(root)
  writeJson(configPath, { ...existing, mcpServers: servers })

  const nextSteps =
    target === 'cursor'
      ? [
          'Restart Cursor or reload MCP servers',
          'Paste the doc-bridge skill into Cursor rules (see docs/skills/doc-bridge.md)',
          'Before editing packages/* call handoff.resolve',
        ]
      : [
          'Restart Claude Desktop',
          'Run ak-docs index after doc changes',
        ]

  return {
    ok: true,
    target,
    configPath,
    created,
    serverName: SERVER_NAME,
    nextSteps,
  }
}

export const mcpSnippet = (root: string): string =>
  JSON.stringify({ mcpServers: { [SERVER_NAME]: mcpServerEntry(root) } }, null, 2)