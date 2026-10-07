/** Preserve CR bytes: normalizing EOL would make the displayed patch differ from the region edit. */
export const exactLines = (text: string): string[] => (text.match(/[^\n]*\n|[^\n]+$/g) ?? []).map(line => line.endsWith('\n') ? line.slice(0, -1) : line)

/** One bounded-context unified hunk per file. Exact line bytes include CR in CRLF files. */
export const unifiedDiff = (changes: readonly { path: string; before: string; after: string }[]): string => changes.filter(change => change.before !== change.after).map(change => {
  const a = exactLines(change.before), b = exactLines(change.after)
  const equal = (i: number, j: number) => a[i] === b[j] && ((i === a.length - 1 && !change.before.endsWith('\n')) === (j === b.length - 1 && !change.after.endsWith('\n')))
  let prefix = 0, suffix = 0
  while (prefix < Math.min(a.length, b.length) && equal(prefix, prefix)) prefix++
  while (suffix < Math.min(a.length, b.length) - prefix && equal(a.length - suffix - 1, b.length - suffix - 1)) suffix++
  const start = Math.max(0, prefix - 3), endA = a.length - Math.max(0, suffix - 3), endB = b.length - Math.max(0, suffix - 3)
  const output: string[] = []
  const emit = (tag: string, line: string, i: number, all: string[], text: string) => {
    output.push(tag + line)
    if (i === all.length - 1 && !text.endsWith('\n')) output.push('\\ No newline at end of file')
  }
  for (let i = start; i < prefix; i++) emit(' ', a[i]!, i, a, change.before)
  for (let i = prefix; i < a.length - suffix; i++) emit('-', a[i]!, i, a, change.before)
  for (let i = prefix; i < b.length - suffix; i++) emit('+', b[i]!, i, b, change.after)
  for (let i = a.length - suffix; i < endA; i++) emit(' ', a[i]!, i, a, change.before)
  const countA = endA - start, countB = endB - start
  return `--- a/${change.path}\n+++ b/${change.path}\n@@ -${countA ? start + 1 : start},${countA} +${countB ? start + 1 : start},${countB} @@\n${output.join('\n')}\n`
}).join('')
