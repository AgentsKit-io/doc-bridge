import { readFileSync, statSync } from 'node:fs'

export const MAX_DOCUMENT_BYTES = 4 * 1_024 * 1_024
export const MAX_CORPUS_BYTES = 64 * 1_024 * 1_024

export type TextReadBudget = { used: number }

export const readBoundedText = (
  path: string,
  budget: TextReadBudget,
  limits?: { readonly maxFileBytes?: number; readonly maxCorpusBytes?: number },
): string => {
  const maxFileBytes = limits?.maxFileBytes ?? MAX_DOCUMENT_BYTES
  const maxCorpusBytes = limits?.maxCorpusBytes ?? MAX_CORPUS_BYTES
  const stat = statSync(path)
  if (!stat.isFile()) throw new Error(`Documentation path is not a regular file: ${path}`)
  if (stat.size > maxFileBytes) {
    throw new Error(`Documentation file exceeds the ${maxFileBytes} byte limit: ${path}`)
  }
  if (budget.used + stat.size > maxCorpusBytes) {
    throw new Error(`Documentation corpus exceeds the ${maxCorpusBytes} byte read budget.`)
  }
  budget.used += stat.size
  return readFileSync(path, 'utf8')
}
