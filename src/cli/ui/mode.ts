export type RichOutputInput = {
  readonly stdout: { readonly isTTY?: boolean | undefined }
  readonly flags: ReadonlySet<string> | readonly string[]
  readonly env: Readonly<Record<string, string | undefined>>
}

const isSet = (value: string | undefined): boolean => value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false'

/**
 * Whether a command prints the Ink view. Rich output is for a person at a terminal: a pipe, a CI
 * log, an agent (`--json`, `--agent`) or an explicit `--text` / `NO_COLOR` / `AK_DOCS_PLAIN=1`
 * keeps the plain output every script already parses.
 */
export const richOutput = ({ stdout, flags, env }: RichOutputInput): boolean => {
  const has = (flag: string): boolean => (Array.isArray(flags) ? (flags as readonly string[]).includes(flag) : (flags as ReadonlySet<string>).has(flag))
  if (stdout.isTTY !== true) return false
  if (has('--json') || has('--text') || has('--agent')) return false
  if (isSet(env.CI)) return false
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false
  if (env.AK_DOCS_PLAIN === '1') return false
  return true
}
