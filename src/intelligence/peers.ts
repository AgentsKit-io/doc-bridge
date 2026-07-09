export class PeerMissingError extends Error {
  constructor(
    readonly peer: string,
    readonly installHint: string,
  ) {
    super(
      `Optional peer "${peer}" is not installed.\nInstall Layer 1 intelligence peers:\n  ${installHint}`,
    )
    this.name = 'PeerMissingError'
  }
}

const LAYER1_INSTALL =
  'npm i -D @agentskit/rag @agentskit/ink @agentskit/adapters @agentskit/memory react'

/** True when a dynamic import failed because the package could not be resolved/loaded. */
export const isPeerResolutionFailure = (error: unknown): boolean => {
  const parts: string[] = []
  let cur: unknown = error
  for (let i = 0; i < 6 && cur; i += 1) {
    if (cur instanceof Error) {
      parts.push(cur.message, cur.name)
      const code = (cur as NodeJS.ErrnoException).code
      if (code) parts.push(String(code))
      cur = cur.cause
      continue
    }
    parts.push(String(cur))
    break
  }
  const text = parts.join(' ').toLowerCase()
  return (
    text.includes('cannot find package') ||
    text.includes('cannot find module') ||
    text.includes('module not found') ||
    text.includes('err_module_not_found') ||
    text.includes('err_package_not_found') ||
    text.includes('err_package_path_not_exported') ||
    text.includes('failed to resolve module') ||
    text.includes('failed to resolve') ||
    // Node / network resolution edge cases for bare package imports
    text.includes('fetch failed') ||
    text.includes('enotfound') ||
    text.includes('getaddrinfo')
  )
}

export const importPeer = async <T>(name: string): Promise<T> => {
  try {
    return (await import(name)) as T
  } catch (error) {
    if (isPeerResolutionFailure(error)) {
      throw new PeerMissingError(name, LAYER1_INSTALL)
    }
    throw error
  }
}

export const layer1InstallHint = (): string => LAYER1_INSTALL
