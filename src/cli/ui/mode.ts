export type RichOutputOptions = {
  readonly stdout: Pick<NodeJS.WriteStream, 'isTTY'>
  readonly flags: ReadonlySet<string>
  readonly env: Readonly<Record<string, string | undefined>>
}

export const richOutput = ({ stdout, flags, env }: RichOutputOptions): boolean =>
  Boolean(stdout.isTTY) &&
  !flags.has('--json') &&
  !flags.has('--text') &&
  !env.CI &&
  !env.NO_COLOR &&
  env.AK_DOCS_PLAIN !== '1'
