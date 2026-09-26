import { mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Creating a file symlink requires SeCreateSymbolicLinkPrivilege on Windows
 * (granted by admin elevation or Developer Mode), unlike POSIX systems where
 * any user can. Probe for it once per process instead of assuming by platform,
 * so these tests still run wherever the privilege happens to be available
 * (e.g. Windows CI with Developer Mode on) and only skip where it is genuinely absent.
 */
const probe = (): boolean => {
  const dir = mkdtempSync(join(tmpdir(), 'doc-bridge-symlink-probe-'))
  try {
    writeFileSync(join(dir, 'target.txt'), 'x')
    symlinkSync(join(dir, 'target.txt'), join(dir, 'link.txt'))
    return true
  } catch {
    return false
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

let cached: boolean | undefined
export const canCreateSymlinks = (): boolean => {
  if (cached === undefined) cached = probe()
  return cached
}
