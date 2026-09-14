import { Buffer } from 'node:buffer'

const TOOL_TYPES = new Set([
  'command_execution',
  'mcp_tool_call',
  'web_search_call',
  'file_search_call',
  'computer_call',
])

const byteLength = (value: unknown): number => {
  if (value === undefined || value === null) return 0
  const encoded = typeof value === 'string' ? value : JSON.stringify(value)
  return encoded === undefined ? 0 : Buffer.byteLength(encoded, 'utf8')
}

const firstPresent = (value: Record<string, unknown>, keys: readonly string[]): unknown => {
  for (const key of keys) {
    if (value[key] !== undefined && value[key] !== null) return value[key]
  }
  return undefined
}

export type ProviderToolTelemetry = {
  readonly observedToolEventCount: number
  readonly observedToolInputBytes: number
  readonly observedToolOutputBytes: number
}

export const measureProviderToolTelemetry = (events: readonly unknown[]): ProviderToolTelemetry => {
  let observedToolEventCount = 0
  let observedToolInputBytes = 0
  let observedToolOutputBytes = 0

  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) continue
    const record = event as { readonly type?: unknown; readonly item?: unknown }
    if (record.type !== 'item.completed' || !record.item || typeof record.item !== 'object' || Array.isArray(record.item)) continue
    const item = record.item as Record<string, unknown>
    if (typeof item.type !== 'string' || !TOOL_TYPES.has(item.type)) continue
    observedToolEventCount += 1
    observedToolInputBytes += byteLength(firstPresent(item, ['command', 'arguments', 'input', 'params']))
    observedToolOutputBytes += byteLength(firstPresent(item, ['aggregated_output', 'output', 'result', 'content']))
  }

  return { observedToolEventCount, observedToolInputBytes, observedToolOutputBytes }
}
