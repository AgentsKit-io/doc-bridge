import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const root = process.env.DOC_BRIDGE_REAL_SMOKE_ROOT ?? join(tmpdir(), 'doc-bridge-real')
const tarball = join(repo, 'agentskit-doc-bridge-0.1.0-alpha.1.tgz')
const runner = join(root, 'runner')

const run = (cmd, args, cwd = repo) =>
  execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const write = (path, value) => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, value)
}

const cloneOrUpdate = (url, dir) => {
  if (existsSync(join(dir, '.git'))) {
    run('git', ['fetch', '--depth', '1', 'origin', 'HEAD'], dir)
    run('git', ['checkout', '--detach', 'FETCH_HEAD'], dir)
    return
  }
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dirname(dir), { recursive: true })
  run('git', ['clone', '--depth', '1', url, dir])
}

const install = () => {
  rmSync(runner, { recursive: true, force: true })
  rmSync(tarball, { force: true })
  mkdirSync(runner, { recursive: true })
  run('pnpm', ['build'])
  run('npm', ['pack', '--json'])
  run('npm', ['init', '-y'], runner)
  run('npm', ['install', tarball], runner)
  return join(runner, 'node_modules', '.bin', 'ak-docs')
}

const prepareDocusaurus = (dir) => {
  rmSync(join(dir, 'docs/for-agents/human'), { recursive: true, force: true })
  rmSync(join(dir, '.doc-bridge'), { recursive: true, force: true })
  rmSync(join(dir, 'llms.txt'), { force: true })
  write(join(dir, 'docs/for-agents/INDEX.md'), '# Docusaurus agent docs\n\nReal clone smoke index.\n')
  write(join(dir, 'docs/for-agents/packages/core.md'), '# core\n\nAgent guide for the Docusaurus core package.\n')
  write(
    join(dir, 'doc-bridge.config.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        corpus: {
          agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' },
          human: {
            plugin: 'docusaurus',
            options: {
              docsDir: 'website/docs',
              sidebarsFile: 'website/sidebars.ts',
              urlPrefix: '/docs',
            },
          },
        },
        routing: {
          plugin: 'pnpm-monorepo',
          options: {
            packages: ['packages/*'],
            ownership: {
              core: {
                path: 'packages/docusaurus',
                agentDoc: 'docs/for-agents/packages/core.md',
                humanDoc: '/docs/installation',
              },
            },
          },
        },
        gates: { preset: 'standard' },
      },
      null,
      2,
    )}\n`,
  )
}

const prepareFumadocs = (dir) => {
  rmSync(join(dir, 'docs/for-agents/human'), { recursive: true, force: true })
  rmSync(join(dir, '.doc-bridge'), { recursive: true, force: true })
  rmSync(join(dir, 'llms.txt'), { force: true })
  write(join(dir, 'docs/for-agents/INDEX.md'), '# Fumadocs agent docs\n\nReal clone smoke index.\n')
  write(
    join(dir, 'doc-bridge.config.json'),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        corpus: {
          agent: { root: 'docs/for-agents', index: 'docs/for-agents/INDEX.md' },
          human: {
            plugin: 'fumadocs',
            options: { contentDir: 'apps/docs/content/docs', urlPrefix: '/docs' },
          },
        },
        routing: { plugin: 'pnpm-monorepo', options: { packages: ['packages/*'] } },
        gates: { preset: 'standard' },
      },
      null,
      2,
    )}\n`,
  )
}

const countFiles = (dir) =>
  Number(run('find', [dir, '-type', 'f'], dirname(dir)).trim().split('\n').filter(Boolean).length)

const smokeDocusaurus = (bin, dir) => {
  prepareDocusaurus(dir)
  run(bin, ['validate-config'], dir)
  const bootstrap = JSON.parse(run(bin, ['bootstrap', 'agent-docs'], dir))
  if (bootstrap.created.length < 80) throw new Error(`Docusaurus created only ${bootstrap.created.length} drafts`)
  if (!bootstrap.created.some((path) => path.endsWith('/installation.md'))) {
    throw new Error('Docusaurus did not create installation draft')
  }
  run(bin, ['index'], dir)
  const gate = JSON.parse(run(bin, ['gate', 'run', 'human-guide-links'], dir))
  if (!gate.ok) throw new Error(`Docusaurus gate failed: ${JSON.stringify(gate)}`)
  const index = JSON.parse(run('node', ['-e', "process.stdout.write(JSON.stringify(require('./.doc-bridge/index.json')))"], dir))
  if (Object.keys(index.handoffs ?? {}).length < 30) throw new Error('Docusaurus handoff coverage too low')
  return { drafts: bootstrap.created.length, handoffs: Object.keys(index.handoffs ?? {}).length }
}

const smokeFumadocs = (bin, dir) => {
  prepareFumadocs(dir)
  run(bin, ['validate-config'], dir)
  const bootstrap = JSON.parse(run(bin, ['bootstrap', 'agent-docs'], dir))
  if (bootstrap.created.length < 80) throw new Error(`Fumadocs created only ${bootstrap.created.length} drafts`)
  const dotDrafts = bootstrap.created.filter((path) => /\/\.[^/]+\.md$/.test(path))
  if (dotDrafts.length) throw new Error(`Fumadocs leaked dot partial drafts: ${dotDrafts.join(', ')}`)
  run(bin, ['index'], dir)
  const index = JSON.parse(run('node', ['-e', "process.stdout.write(JSON.stringify(require('./.doc-bridge/index.json')))"], dir))
  if (Object.keys(index.handoffs ?? {}).length < 25) throw new Error('Fumadocs handoff coverage too low')
  return { drafts: bootstrap.created.length, handoffs: Object.keys(index.handoffs ?? {}).length }
}

try {
  mkdirSync(root, { recursive: true })
  const docusaurus = join(root, 'docusaurus')
  const fumadocs = join(root, 'fumadocs')
  cloneOrUpdate('https://github.com/facebook/docusaurus.git', docusaurus)
  cloneOrUpdate('https://github.com/fuma-nama/fumadocs.git', fumadocs)
  const bin = install()
  const result = {
    docusaurus: smokeDocusaurus(bin, docusaurus),
    fumadocs: smokeFumadocs(bin, fumadocs),
    root,
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
} finally {
  rmSync(tarball, { force: true })
}
