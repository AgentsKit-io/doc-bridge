import { resolve } from 'node:path'

export const toPosix = (value: string): string => value.split('\\').join('/')

export const resolveFromRoot = (root: string, rel: string): string =>
  resolve(root, rel)