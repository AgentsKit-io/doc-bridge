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

export const importPeer = async <T>(name: string): Promise<T> => {
  try {
    return (await import(name)) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (
      message.includes('Cannot find package') ||
      message.includes('Cannot find module') ||
      message.includes('ERR_MODULE_NOT_FOUND')
    ) {
      throw new PeerMissingError(name, LAYER1_INSTALL)
    }
    throw error
  }
}

export const layer1InstallHint = (): string => LAYER1_INSTALL
