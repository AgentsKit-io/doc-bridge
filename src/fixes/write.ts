import { closeSync, fstatSync, openSync, readFileSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

const removeIfPresent = (path: string): void => {
  try { unlinkSync(path) } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
}

export type FileReplacement = { absolute: string; before: string; after: string }
/** Both fix versions use this mutation path; failed restores retain their backup. */
export const replaceFiles = (changes: readonly FileReplacement[], verify?: () => void): void => {
  const token = randomUUID()
  const backups = changes.map(change => ({ ...change, backup: `${change.absolute}.docbridge-${token}.original`, temp: `${change.absolute}.docbridge-${token}.tmp` }))
  const written = new Set<string>()
  try {
    for (const change of backups) {
      const fd = openSync(change.absolute, 'r')
      try {
        const target = fstatSync(fd)
        if (!target.isFile() || realpathSync.native(change.absolute) !== change.absolute || readFileSync(fd, 'utf8') !== change.before) throw new Error('Target changed before staging')
        writeFileSync(change.backup, change.before, { encoding: 'utf8', flag: 'wx', mode: target.mode })
        writeFileSync(change.temp, change.after, { encoding: 'utf8', flag: 'wx', mode: target.mode })
      } finally { closeSync(fd) }
    }
    for (const change of backups) {
      if (realpathSync.native(change.absolute) !== change.absolute || readFileSync(change.absolute, 'utf8') !== change.before) throw new Error('Target changed before replacement')
      renameSync(change.temp, change.absolute)
      written.add(change.absolute)
    }
    for (const change of backups) if (readFileSync(change.absolute, 'utf8') !== change.after) throw new Error('Postcondition failed')
    verify?.()
  } catch (error) {
    const failures: string[] = []
    for (const change of backups) {
      if (!written.has(change.absolute)) continue
      try { renameSync(change.backup, change.absolute) } catch { failures.push(change.backup) }
    }
    for (const change of backups) {
      removeIfPresent(change.temp)
      if (!failures.includes(change.backup)) removeIfPresent(change.backup)
    }
    if (failures.length) throw new AggregateError([error], `Rollback failed; recoverable originals: ${failures.join(', ')}`)
    throw error
  }
  for (const change of backups) unlinkSync(change.backup)
}
