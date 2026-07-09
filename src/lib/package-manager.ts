import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

export type PackageManager = 'pnpm' | 'npm' | 'yarn' | 'bun'

export const detectPackageManager = (root: string): PackageManager => {
  if (existsSync(join(root, 'pnpm-lock.yaml')) || existsSync(join(root, 'pnpm-workspace.yaml'))) {
    return 'pnpm'
  }
  if (existsSync(join(root, 'yarn.lock'))) return 'yarn'
  if (existsSync(join(root, 'bun.lockb')) || existsSync(join(root, 'bun.lock'))) return 'bun'
  if (existsSync(join(root, 'package-lock.json'))) return 'npm'

  try {
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      packageManager?: string
    }
    const pm = pkg.packageManager?.split('@')[0]
    if (pm === 'pnpm' || pm === 'npm' || pm === 'yarn' || pm === 'bun') return pm
  } catch {
    // ignore
  }

  return 'npm'
}

export const defaultChecksForTarget = (
  root: string,
  opts: {
    readonly packageId: string
    readonly packagePath: string
    readonly packageName?: string
    readonly strict?: boolean
  },
): string[] => {
  const pm = detectPackageManager(root)

  // Pattern / markdown ownership targets (playbook, etc.) — project-level scripts
  if (/\.mdx?$/.test(opts.packagePath) || opts.packagePath.includes('/pillars/')) {
    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
        scripts?: Record<string, string>
      }
      const scripts = pkg.scripts ?? {}
      if (scripts['check:okf-type']) return ['pnpm run check:okf-type']
      if (scripts['docs:bridge:gate']) return ['pnpm run docs:bridge:gate']
      if (scripts.test) return [pm === 'pnpm' ? 'pnpm test' : 'npm test']
    } catch {
      // fall through
    }
  }

  const isWorkspace =
    existsSync(join(root, 'pnpm-workspace.yaml')) ||
    existsSync(join(root, 'lerna.json')) ||
    Boolean(
      (() => {
        try {
          const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
            workspaces?: unknown
          }
          return Boolean(pkg.workspaces)
        } catch {
          return false
        }
      })(),
    )

  const filter =
    opts.packageName ??
    (opts.packagePath.startsWith('packages/') || opts.packagePath.startsWith('apps/')
      ? opts.packageId
      : undefined)

  if (pm === 'pnpm') {
    if (isWorkspace && filter) {
      const base = [`pnpm --filter ${filter} test`]
      if (opts.strict) base.push(`pnpm --filter ${filter} lint`)
      return base
    }
    return opts.strict ? ['pnpm test', 'pnpm run lint'] : ['pnpm test']
  }

  if (pm === 'yarn') {
    if (isWorkspace && filter) {
      return opts.strict
        ? [`yarn workspace ${filter} test`, `yarn workspace ${filter} lint`]
        : [`yarn workspace ${filter} test`]
    }
    return opts.strict ? ['yarn test', 'yarn lint'] : ['yarn test']
  }

  if (pm === 'bun') {
    return opts.strict ? ['bun test', 'bun run lint'] : ['bun test']
  }

  // npm
  if (isWorkspace && filter) {
    return opts.strict
      ? [`npm test -w ${filter}`, `npm run lint -w ${filter}`]
      : [`npm test -w ${filter}`]
  }
  return opts.strict ? ['npm test', 'npm run lint'] : ['npm test']
}
