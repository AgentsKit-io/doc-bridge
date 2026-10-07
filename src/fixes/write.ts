import { existsSync, readFileSync, realpathSync, statSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'

export type FileReplacement = { absolute: string; before: string; after: string }
/** Both fix versions use this mutation path; failed restores retain their backup. */
export const replaceFiles = (changes: readonly FileReplacement[], verify?: () => void): void => {
  const token = randomUUID()
  const backups = changes.map(change => ({ ...change, backup: `${change.absolute}.docbridge-${token}.original`, temp: `${change.absolute}.docbridge-${token}.tmp` }))
  const written = new Set<string>()
  try {
    for (const change of backups) {
      if (realpathSync.native(change.absolute) !== change.absolute || readFileSync(change.absolute, 'utf8') !== change.before) throw new Error('Target changed before staging')
      writeFileSync(change.backup, change.before, { encoding: 'utf8', flag: 'wx', mode: 0o600 })
      writeFileSync(change.temp, change.after, { encoding: 'utf8', flag: 'wx', mode: statSync(change.absolute).mode })
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
      if (existsSync(change.temp)) unlinkSync(change.temp)
      if (!failures.includes(change.backup) && existsSync(change.backup)) unlinkSync(change.backup)
    }
    if (failures.length) throw new AggregateError([error], `Rollback failed; recoverable originals: ${failures.join(', ')}`)
    throw error
  }
  for (const change of backups) unlinkSync(change.backup)
}
