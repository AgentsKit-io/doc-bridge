import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, expect, it } from 'vitest'
import { discoverRepository } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'
import { surfaceFactFromEntity } from '../src/storage/facts.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
const fixture = (source: string) => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-cli-')); roots.push(root)
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'package.json'), '{"name":"doc-bridge-fixture","bin":{"doc-bridge":"src/cli.ts"}}')
  writeFileSync(join(root, 'src/cli.ts'), source)
  return root
}
const facts = (root: string) => discoverRepository({ root }).entities.filter(entity => ['cli-command', 'cli-flag'].includes(entity.kind)).map(surfaceFactFromEntity)

it.each([
  ['commander', `import { Command } from 'commander'; const cli = new Command(); cli.command('report').requiredOption('-b, --brief <value>', 'Brief', 'yes');`],
  ['cac', `import { cac } from 'cac'; const cli = cac('doc-bridge'); cli.command('report').option('-b, --brief <value>', 'Brief', {default: 'yes'});`],
  ['yargs', `import yargs from 'yargs'; yargs().command('report', 'Report', y => y.option('brief', {alias: 'b', type: 'string', demandOption: true, default: 'yes'})).argv;`],
])('extracts owned commands and flags from %s', (_library, source) => {
  const result = facts(fixture(source))
  const command = result.find(fact => fact.name === 'doc-bridge report')!
  expect(command).toBeDefined()
  expect(result.find(fact => fact.name === '--brief')?.ownerId).toBe(command.id)
})

it('extracts node:util parseArgs defaults and aliases deterministically', () => {
  const root = fixture(`import { parseArgs } from 'node:util'; const { values } = parseArgs({options: {brief: {type: 'boolean', short: 'b', default: false}}});`)
  const first = facts(root)
  expect(first.find(fact => fact.name === '--brief')?.ownerId).toBe(first.find(fact => fact.name === 'doc-bridge')?.id)
  expect(facts(root)).toEqual(first)
  writeFileSync(join(root, 'src/cli.ts'), `import { parseArgs } from 'node:util'; parseArgs({options: {brief: {type: 'boolean', short: 'b', default: true}}});`)
  expect(facts(root).find(fact => fact.name === '--brief')?.valueHash).not.toBe(first.find(fact => fact.name === '--brief')?.valueHash)
})

it('does not treat arbitrary option methods as CLI declarations', () => {
  expect(facts(fixture(`const config = {}; config.option('--brief');`)).some(fact => fact.kind === 'cli-flag')).toBe(false)
})

it('marks dynamic registrations partial and cannot prove their removal', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); cli.option('--brief'); cli.command(process.argv[2]);`)
  writeFileSync(join(root, 'README.md'), '# Guide\n`--brief`\n')
  const base = discoverRepository({ root })
  expect(base.coverage.filter(entry => entry.analyzer === 'js-ts:cli' && ['cli-commands', 'cli-flags'].includes(entry.scope)).every(entry => entry.status === 'partial')).toBe(true)
  writeFileSync(join(root, 'src/cli.ts'), `import { Command } from 'commander'; const cli = new Command(); cli.command(process.argv[2]);`)
  const head = discoverRepository({ root })
  expect(diffSnapshots(base, head, { headRoot: root }).findings.find(finding => finding.code === 'BROKEN_REFERENCE')?.status).toBe('stale-or-unverified')
  expect(head.coverage.find(entry => entry.scope === 'cli-flags')?.status).toBe('partial')
})

it('finds a removed flag cited by a surviving doc through snapshot diff', () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-cli-e2e-')); roots.push(root)
  cpSync(resolve('tests/fixtures/cli-commander'), root, { recursive: true })
  const base = discoverRepository({ root })
  const source = join(root, 'src/cli.ts')
  writeFileSync(source, readFileSync(source, 'utf8').replace('--brief', '--compact'))
  const head = discoverRepository({ root })
  const result = diffSnapshots(base, head, { headRoot: root })
  expect(result.changeSet.changes.filter(change => change.kind === 'cli-flag' && change.op !== 'changed').map(change => [change.op, change.before?.name ?? change.after?.name]).sort()).toEqual([['added', '--compact'], ['removed', '--brief']])
  expect(result.findings.some(finding => finding.code === 'BROKEN_REFERENCE' && finding.status === 'conflict')).toBe(true)
})

it('recognizes marked exported usage and leaves its runtime coverage partial', () => {
  const root = fixture('/** @docbridgeCliUsage */\nexport const help = `doc-bridge report [--brief] [--output <file>]\nGlobal flags:\n  -h, --help\n`')
  const result = facts(root)
  expect(result.some(fact => fact.name === 'doc-bridge report')).toBe(true)
  expect(result.some(fact => fact.name === '--brief')).toBe(true)
  expect(result.some(fact => fact.name === '-bridge')).toBe(false)
  expect(result.some(fact => fact.name === '-h')).toBe(true)
  expect(discoverRepository({ root }).coverage.find(entry => entry.scope === 'cli-flags')?.status).toBe('partial')
  writeFileSync(join(root, 'src/cli.ts'), 'export const help = `doc-bridge report [--brief]`')
  expect(facts(root).some(fact => fact.name === '--brief')).toBe(false)
})

it('does not change legacy JS/TS outputs when only fact extraction is registered', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); cli.option('--brief'); cli.command('report').option('--brief');`)
  writeFileSync(join(root, 'README.md'), '# Guide\n`--brief`\n')
  const cold = discoverRepository({ root })
  const warm = discoverRepository({ root, previous: cold })
  expect(warm.entities).toEqual(cold.entities)
  expect(warm.relations).toEqual(cold.relations)
  expect(warm.contentHash).toBe(cold.contentHash)
  expect(warm.coverage.filter(entry => entry.scope !== 'reused-entities')).toEqual(cold.coverage.filter(entry => entry.scope !== 'reused-entities'))
})

it('marks conditional registration partial', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); if (process.env.MODE) cli.option('--brief');`)
  expect(discoverRepository({ root }).coverage.find(entry => entry.scope === 'cli-flags')?.status).toBe('partial')
})

it('resolves qualified shell/inline citations, excludes prose and unrelated shell commands', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); cli.command('report').option('-b, --brief');`)
  writeFileSync(join(root, 'README.md'), '# Guide\n`report` brief\n\n```sh\nother report --brief\ndoc-bridge report --brief=true\n```\n\n`doc-bridge report --brief`\n\n<!-- doc-bridge:generated hash=abc -->\n`doc-bridge report --brief`\n<!-- /doc-bridge:generated -->\n')
  const snapshot = discoverRepository({ root })
  const cliRelations = snapshot.relations.filter(relation => relation.metadata?.factKind === 'cli-command' || relation.metadata?.factKind === 'cli-flag')
  expect(cliRelations.some(relation => relation.metadata?.factName === 'doc-bridge report')).toBe(true)
  expect(cliRelations.find(relation => relation.metadata?.factName === '--brief')?.evidence.map(item => item.lineStart)).toEqual([6, 9])
})

it('does not retain a broken shell flag finding after changing to an unrelated executable', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); cli.option('--brief');`)
  writeFileSync(join(root, 'README.md'), '# Guide\n```sh\ndoc-bridge --brief\n```\n')
  const base = discoverRepository({ root })
  writeFileSync(join(root, 'src/cli.ts'), `import { Command } from 'commander'; const cli = new Command(); cli.option('--compact');`)
  const withCitation = discoverRepository({ root })
  expect(diffSnapshots(base, withCitation, { headRoot: root }).findings.some(finding => finding.code === 'BROKEN_REFERENCE' && finding.status === 'conflict')).toBe(true)
  writeFileSync(join(root, 'README.md'), '# Guide\n```sh\nother --brief\n```\n')
  expect(diffSnapshots(base, discoverRepository({ root }), { headRoot: root }).findings.some(finding => finding.code === 'BROKEN_REFERENCE')).toBe(false)
})


it('keeps statically known array defaults, dotted flags and multiple aliases in identity', () => {
  const root = fixture(`import yargs from 'yargs'; yargs().option('db.host', {alias: ['d', 'host'], type: 'string', default: ['local']});`)
  const base = facts(root)
  expect(base.filter(fact => fact.kind === 'cli-flag').map(fact => fact.name).sort()).toEqual(['--db.host', '--host', '-d'])
  writeFileSync(join(root, 'src/cli.ts'), `import yargs from 'yargs'; yargs().option('db.host', {alias: ['d', 'host'], type: 'string', default: ['remote']});`)
  expect(facts(root).find(fact => fact.name === '--db.host')?.valueHash).not.toBe(base.find(fact => fact.name === '--db.host')?.valueHash)
})


it('does not silently complete dynamic registration hidden in an uncontrolled callback', () => {
  const root = fixture(`import { Command } from 'commander'; const cli = new Command(); ['report'].forEach(name => cli.command(name));`)
  expect(discoverRepository({ root }).coverage.find(entry => entry.scope === 'cli-commands')?.status).toBe('partial')
})

it.each([
  ['array table', `const options = [{ name: 'brief', alias: 'b' }];`],
  ['object table', `const options = { brief: {flag: '--brief', alias: '-b'} };`],
  ['switch', `switch (process.argv[2]) { case '--brief': break; case 'report': break; }`],
  ['includes', `if (process.argv.includes('--brief')) console.log('yes');`],
  ['token comparison', `function parse(argv) { const arg = argv[0]; if (arg === '--brief') return true; }`],
  ['dispatch comparison', `const command = process.argv[2]; if (command === 'report') console.log('yes');`],
])('extracts hand-rolled %s declarations', (pattern, source) => {
  const result = facts(fixture(source))
  expect(result.some(fact => fact.name === (pattern === 'dispatch comparison' ? 'doc-bridge report' : '--brief'))).toBe(true)
})

it('uses implementation rather than stale annotated help and names drift', () => {
  const root = fixture('/** @docbridgeCliUsage */\nexport const help = `doc-bridge old [--old]`;\nconst command = process.argv[2]; if(command === "report") {} if(process.argv.includes("--brief")) {}')
  const snapshot = discoverRepository({ root })
  const names = snapshot.entities.filter(entity => ['cli-command', 'cli-flag'].includes(entity.kind)).map(entity => entity.name)
  expect(names).toContain('doc-bridge report')
  expect(names).toContain('--brief')
  expect(names).not.toContain('doc-bridge old')
  expect(names).not.toContain('--old')
  expect(snapshot.coverage.find(entry => entry.scope === 'cli-usage-drift')?.reason).toMatch(/--old.*report|report.*--old/)
})

it('maps declared compiled imports to their source and detects flag removal', () => {
  const root = fixture(`import '../dist/program.js'`)
  writeFileSync(join(root, 'tsconfig.json'), JSON.stringify({compilerOptions: {rootDir: 'src', outDir: 'dist'}}))
  writeFileSync(join(root, 'src/program.ts'), `if (process.argv.includes('--brief')) {}`)
  const base = discoverRepository({root})
  writeFileSync(join(root, 'src/program.ts'), `if (process.argv.includes('--compact')) {}`)
  const delta = diffSnapshots(base, discoverRepository({root})).changeSet
  expect(delta.changes.filter(change => change.kind === 'cli-flag').map(change => [change.op, change.before?.name ?? change.after?.name]).sort()).toEqual([['added', '--compact'], ['removed', '--brief']])
})

it('bounds drift notes to the snapshot reason limit', () => {
  const help = Array.from({length: 70}, (_, i) => `doc-bridge command${i} [--flag${i}]`).join('\n')
  const root = fixture(`/** @docbridgeCliUsage */\nexport const help = ${JSON.stringify(help)};\nif (process.argv.includes('--brief')) {}`)
  expect(discoverRepository({root}).coverage.find(entry => entry.scope === 'cli-usage-drift')?.reason?.length).toBeLessThanOrEqual(1024)
})

it('does not promote interactive commands or nested positionals to root commands', () => {
  const root = fixture(`const line = 'read'; const [command] = line.split(' '); if (command === 'read') {}\nconst positional = process.argv.slice(2); if(positional[1] === 'install') {} if(positional[0] === 'report') {}`)
  const names = facts(root).filter(fact => fact.kind === 'cli-command').map(fact => fact.name)
  expect(names).toEqual(['doc-bridge report', 'doc-bridge'])
})

it('invalidates warm CLI extraction when source mapping configuration changes', () => {
  const root = fixture(`import '../dist/program.js'`)
  writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"rootDir":"src","outDir":"dist"}}')
  writeFileSync(join(root, 'src/program.ts'), `if (process.argv.includes('--brief')) {}`)
  const base = discoverRepository({root})
  expect(base.entities.some(entity => entity.kind === 'cli-flag' && entity.name === '--brief')).toBe(true)
  writeFileSync(join(root, 'tsconfig.json'), '{"compilerOptions":{"rootDir":"src","outDir":"build"}}')
  const warm = discoverRepository({root, previous: base})
  const cold = discoverRepository({root})
  expect(warm.entities).toEqual(cold.entities)
  expect(warm.entities.some(entity => entity.kind === 'cli-flag' && entity.name === '--brief')).toBe(false)
})

it('compares separate usage modules against prior implementation declarations', () => {
  const root = fixture(`import './usage.js'; const command = process.argv[2]; if(command === 'report') {} if(process.argv.includes('--brief')) {}`)
  writeFileSync(join(root, 'src/usage.ts'), '/** @docbridgeCliUsage */\nexport const help = `doc-bridge report [--brief]`;')
  const snapshot = discoverRepository({root})
  expect(snapshot.coverage.some(entry => entry.scope === 'cli-usage-drift')).toBe(false)
  expect(snapshot.entities.find(entity => entity.kind === 'cli-flag' && entity.name === '--brief')?.evidence[0]?.path).toBe('src/cli.ts')
})

it('extracts direct first-argv command dispatch', () => {
  const result = facts(fixture(`export function run(argv: string[]) { if (argv[0] === 'report') return 0; }`))
  expect(result.some(fact => fact.name === 'doc-bridge report')).toBe(true)
})
