import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as yaml from 'yaml'
import type { ScanIO } from '../src/discovery/scan-io.js'
import { npmPurl, npmNameFromPurl, npmRangeToVers, versToNpmRange, mapNpmRelease, npmVersionHooks } from '../src/discovery/plugins/npm-versions.js'
import { extractNpmPackages, lockedNpmVersion } from '../src/discovery/plugins/npm-packages.js'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { diffSnapshots, parseChangeSet } from '../src/diff/change-set.js'
import { stampChangeSet, changeSetEligibility, type DocumentTarget } from '../src/diff/version-routing.js'
import { parseDocumentationDeclarations } from '../src/discovery/documentation.js'
import { resolveDocumentTargets } from '../src/discovery/document-targets.js'
import { packageFactFromEntity } from '../src/storage/facts.js'
import { toySourcePlugin, toyLimits } from './toy-plugin.js'
import { createLocalRepositoryRead, contentRef } from '../src/storage/local.js'
vi.mock('yaml', { spy: true })
const roots: string[] = []
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })))
const fixture = () => { const root = mkdtempSync(join(tmpdir(), 'doc-bridge-version-')); roots.push(root); return root }
const write = (root: string, path: string, value: string) => { mkdirSync(dirname(join(root,path)), {recursive:true}); writeFileSync(join(root,path),value) }
const proof = { source: 'documentation' as const, path: 'docs/api.md' }
const adapter = { normalizeRange: npmVersionHooks.normalizeRange! }
const owner = { id: 'package:fixture', purl: 'pkg:npm/fixture', version: '0.4.1', dependencies: [{ purl: 'pkg:npm/dependency', range: 'vers:npm/>=0.4.1|<0.5.0-0', lockedVersion: '0.4.2' }], evidence: [proof] }
const target = (range: string): DocumentTarget => ({ purl: 'pkg:npm/fixture', state: 'resolved', range: npmRangeToVers(range).status === 'resolved' ? (npmRangeToVers(range) as any).value : range, source:'frontmatter', evidence: [] })
const snapshot = () => { const root = fixture(); write(root,'package.json', '{"name":"fixture","version":"0.4.1"}'); write(root,'api.ts','export const api = 1'); write(root,'docs/api.md','# API\nUse `api`.'); return discoverRepository({root}) }
const delta = () => { const base = snapshot(); return diffSnapshots(base,base).changeSet }
const event = { eventId:'release-1', tag:'v0.4.2', revision:'head', evidence:[] }

it('builds and parses canonical npm purls and rejects malformed/foreign/versioned identities', () => {
  for (const name of ['fixture','@scope/name']) expect(npmNameFromPurl(npmPurl(name))).toBe(name)
  expect(npmPurl('@scope/name')).toBe('pkg:npm/%40scope/name')
  for (const purl of ['pkg:generic/fixture','pkg:npm/fixture@1.0.0','pkg:npm/@scope/name','pkg:npm/fixture?x=y']) expect(() => npmNameFromPurl(purl)).toThrow()
  expect(() => npmPurl('../invalid')).toThrow()
})
it('translates npm ranges to canonical vers intervals and back without putting semver in core', () => {
  for (const [input, output] of [['0.4.1','vers:npm/0.4.1'],['^0.4.1','vers:npm/>=0.4.1|<0.5.0-0'],['*','vers:npm/*'],['1.0.0 || >=2.0.0 <3.0.0','vers:npm/1.0.0|>=2.0.0|<3.0.0']]) {
    expect(npmRangeToVers(input!)).toMatchObject({status:'resolved',value:output})
    const converted = versToNpmRange(output!)
    expect(converted.status).toBe('resolved')
    if (converted.status === 'resolved') for (const version of ['0.4.1','0.4.2','0.5.0','1.0.0','2.0.0','3.0.0']) expect(npmVersionHooks.satisfiesRange!('pkg:npm/fixture',version,output!)).toEqual(npmVersionHooks.satisfiesRange!('pkg:npm/fixture',version,(npmRangeToVers(converted.value) as any).value))
  }
  for (const input of ['latest','>2.0.0 <1.0.0','^1.0.0 || ^1.2.0']) expect(npmRangeToVers(input).status).toBe('unresolved')
  for (const input of ['vers:npm/<2.0.0|>=1.0.0','vers:npm/>=1.0.0|>=2.0.0','vers:npm/1.0.0|1.0.0','vers:npm/^1.0.0']) expect(versToNpmRange(input).status).toBe('unresolved')
})
it('resolves pnpm importers and npm workspace locks without selecting sibling package versions', () => {
  const pnpm = 'importers:\n  .:\n    dependencies:\n      dependency:\n        specifier: ^0.4.1\n        version: 0.4.2(peer@1.0.0)\n  packages/other:\n    dependencies:\n      dependency:\n        version: 0.5.0\n'
  expect(lockedNpmVersion('pnpm-lock.yaml',pnpm,'.','dependency','dependencies')).toBe('0.4.2')
  expect(lockedNpmVersion('pnpm-lock.yaml',pnpm,'packages/other','dependency','dependencies')).toBe('0.5.0')
  expect(lockedNpmVersion('pnpm-lock.yaml',pnpm,'packages/missing','dependency','dependencies')).toBeUndefined()
  const npm = JSON.stringify({packages:{'node_modules/dependency':{version:'0.4.2'},'packages/other/node_modules/dependency':{version:'0.5.0'}}})
  expect(lockedNpmVersion('package-lock.json',npm,'packages/other','dependency','dependencies')).toBe('0.5.0')
})
it('parses shared lockfiles once per extraction and retries repaired locks on the next scan', () => {
  const root = join(tmpdir(), 'doc-bridge-version-cache')
  let text = 'invalid: ['
  const io = { readText: (path: string) => path.endsWith('pnpm-lock.yaml') ? text : '{}', exists: (path: string) => path === join(root, 'pnpm-lock.yaml') } as ScanIO
  const packages = ['.', 'packages/other'].map(path => ({ id: path, name: path === '.' ? 'fixture' : 'other', path, absPath: join(root, path), manifestPath: join(root, path, 'package.json'), manifest: { dependencies: { dependency: '^0.4.1', second: '^0.4.1' } } }))
  const parse = vi.mocked(yaml.parse)
  parse.mockClear()
  try {
    expect(extractNpmPackages(root, io, packages).packages[0]?.dependencies[0]?.lockedVersion).toBe('unresolved')
    expect(parse).toHaveBeenCalledTimes(1)
    text = 'importers:\n  .:\n    dependencies:\n      dependency: {version: 0.4.2}\n  packages/other:\n    dependencies:\n      dependency: {version: 0.4.3}\n'
    const result = extractNpmPackages(root, io, packages)
    expect(parse).toHaveBeenCalledTimes(2)
    expect(result.packages.map(pkg => pkg.dependencies[0]?.lockedVersion)).toEqual(['0.4.2', '0.4.3'])
  } finally { parse.mockClear() }
})
it('resolves independent frontmatter > lock > manifest targets with no invalid fallback', () => {
  expect(resolveDocumentTargets('docbridge:\n  targets:\n    pkg:npm/dependency: 0.4.1',proof,owner,adapter)).toMatchObject([{state:'resolved',range:'vers:npm/0.4.1',source:'frontmatter'}])
  const block = 'docbridge:\n  targets:\n    pkg:npm/dependency: null'
  expect(resolveDocumentTargets(block,proof,owner,adapter)).toMatchObject([{state:'resolved',range:'vers:npm/0.4.2',source:'lockfile'}])
  expect(resolveDocumentTargets(block,proof,{...owner,dependencies:[{purl:'pkg:npm/dependency',range:'vers:npm/>=0.4.1|<0.5.0-0'}]},adapter)).toMatchObject([{state:'resolved',source:'manifest'}])
  expect(resolveDocumentTargets('docbridge:\n  targets:\n    pkg:npm/dependency: invalid\n    pkg:npm/fixture: 0.4.1',proof,owner,adapter)).toMatchObject([{state:'unresolved',source:'frontmatter'},{state:'resolved'}])
  expect(resolveDocumentTargets(block,proof,{...owner,dependencies:[{...owner.dependencies[0]!,lockedVersion:'unresolved'}]},adapter)).toMatchObject([{state:'unresolved',source:'lockfile'}])
  for (const block of ['docbridge: {targets: false}','docbridge: {targets: {pkg:npm/dependency: false}}','docbridge: {targets: {pkg:npm/dependency: ""}}','docbridge: [']) expect(resolveDocumentTargets(block,proof,owner,adapter)[0]?.state).toBe('unresolved')
  expect(resolveDocumentTargets(undefined,proof,owner,adapter)[0]?.state).toBe('latest-released')
})
it('emits package facts, bounded targets and invalidates warm targets when the lock changes', () => {
  const root = fixture()
  write(root,'package.json',JSON.stringify({name:'fixture',version:'0.4.1',dependencies:{dependency:'^0.4.1'}}))
  write(root,'docs/api.md','---\ndocbridge:\n  targets:\n    pkg:npm/dependency: null\n---\n# API')
  write(root,'pnpm-lock.yaml','importers:\n  .:\n    dependencies:\n      dependency:\n        version: 0.4.2\n')
  const base = discoverRepository({root})
  expect(packageFactFromEntity(base.entities.find(entity=>entity.kind==='package')!)).toMatchObject({purl:'pkg:npm/fixture',version:'0.4.1',dependencies:[{range:'vers:npm/>=0.4.1|<0.5.0-0',lockedVersion:'0.4.2'}]})
  expect(base.entities.find(e=>e.kind==='document')?.metadata?.targets).toMatchObject([{range:'vers:npm/0.4.2',source:'lockfile'}])
  expect(parseDocumentationDeclarations({path:'docs/api.md',content:readFileSync(join(root,'docs/api.md'),'utf8')},{snapshot:base}).diagnostics).toEqual([])
  write(root,'pnpm-lock.yaml','importers:\n  .:\n    dependencies:\n      dependency:\n        version: 0.4.3\n')
  const warm = discoverRepository({root,previous:base}), cold = discoverRepository({root})
  expect(warm.entities).toEqual(cold.entities)
  expect(warm.entities.find(e=>e.kind==='document')?.metadata?.targets).toMatchObject([{range:'vers:npm/0.4.3'}])
  write(root,'pnpm-lock.yaml','invalid: [')
  expect(discoverRepository({root}).entities.find(e=>e.kind==='document')?.metadata?.targets).toMatchObject([{state:'unresolved',source:'lockfile'}])
  rmSync(join(root,'pnpm-lock.yaml')); write(root,'yarn.lock','# unsupported')
  expect(discoverRepository({root}).coverage).toContainEqual(expect.objectContaining({scope:'lockfile',status:'partial'}))
})
it('maps matched, scoped, unmatched and ambiguous tags and stamps idempotently without overwriting conflicts', () => {
  const original = delta(), release = {...event,revision:original.headRevision}
  expect(mapNpmRelease(release,original.packages)).toMatchObject({status:'resolved',value:[{purl:'pkg:npm/fixture',version:'0.4.2'}]})
  expect(mapNpmRelease({...release,tag:'@scope/name@1.2.3'},[{purl:'pkg:npm/%40scope/name'}])).toMatchObject({status:'resolved'})
  expect(mapNpmRelease({...release,tag:'unknown'},original.packages).status).toBe('unresolved')
  expect(mapNpmRelease(release,[...original.packages,{purl:'pkg:npm/other'}]).status).toBe('ambiguous')
  const mapping = mapNpmRelease(release,original.packages), result = stampChangeSet(original,release,mapping)
  expect(result.status).toBe('resolved')
  if (result.status !== 'resolved') throw new Error('stamp failed')
  expect(result.value.contentHash).not.toBe(original.contentHash)
  expect(parseChangeSet(result.value)).toEqual(result.value)
  expect(stampChangeSet(result.value,release,mapping)).toEqual(result)
  expect(() => stampChangeSet(result.value,{...release,eventId:'release-2'},mapping)).toThrow(/CONFLICT/)
  expect(stampChangeSet(original,event,mapping).status).toBe('unresolved')
  expect(original.release.state).toBe('unreleased')
})
it('routes pinned/ranged/latest/workspace/default-branch documents with the adapter comparator', () => {
  const original = delta(), release = {...event,revision:original.headRevision}
  const stamp = (version: string) => { const result = stampChangeSet(original,release,{status:'resolved',value:[{purl:'pkg:npm/fixture',version}],evidence:[]}); if(result.status!=='resolved') throw new Error('stamp'); return result.value }
  expect(changeSetEligibility(stamp('0.5.0'),target('0.4.1'),npmVersionHooks)).toMatchObject({value:false})
  expect(changeSetEligibility(stamp('0.4.2'),target('^0.4.1'),npmVersionHooks)).toMatchObject({value:true})
  const latest: DocumentTarget = {state:'latest-released',source:'implicit',evidence:[]}
  expect(changeSetEligibility(original,latest)).toMatchObject({value:false})
  expect(changeSetEligibility(stamp('0.4.2'),latest)).toMatchObject({value:true})
  expect(changeSetEligibility(original,{...target('*'),range:'workspace:*'})).toMatchObject({value:true})
  expect(changeSetEligibility(original,{...latest,state:'default-branch'})).toMatchObject({value:true})
  expect(changeSetEligibility(original,target('0.4.1'))).toMatchObject({value:false})
  expect(changeSetEligibility(stamp('0.4.2'),target('^0.4.1')).status).toBe('unsupported')
  expect(changeSetEligibility(original,{...latest,state:'unresolved'}).status).toBe('unresolved')
})
it('runs toy snapshot → diff → stamp → eligibility with numeric 2 < 10', async () => {
  const root=fixture(); write(root,'toy.manifest','package fixture 2\nrequires dependency vers:toy/>=2|<10\n');write(root,'toy.lock','locked dependency 2\n');write(root,'api.toy','symbol api\n');write(root,'docs/api.md','---\ndocbridge:\n  targets:\n    pkg:generic/dependency: \"2\"\n---\n# API\nUse `api`.')
  const read = await createLocalRepositoryRead({ root, partition:{repositoryId:'fixture',revision:'head'}, limits:toyLimits, inventory:Object.fromEntries(['toy.manifest','toy.lock','api.toy','docs/api.md'].map(path=>[path,contentRef(readFileSync(join(root,path)))])) })
  const {snapshot:base} = await discoverRepositoryWithRead(read,{plugins:[toySourcePlugin],replaceSourcePlugins:true})
  expect(base.entities.find(e=>e.kind==='document')?.metadata?.targets).toMatchObject([{purl:'pkg:generic/dependency',range:'vers:toy/=2',state:'resolved',source:'frontmatter'}])
  const changeSet=diffSnapshots(base,base).changeSet
  const release={...event,tag:'fixture-v2',revision:changeSet.headRevision}
  const mapping=await toySourcePlugin.mapRelease!({event:release,packages:base.entities.filter(e=>e.kind==='package').map(packageFactFromEntity),read,signal:new AbortController().signal})
  const stamped=stampChangeSet(changeSet,release,mapping)
  expect(stamped.status).toBe('resolved');if(stamped.status!=='resolved')throw new Error('toy stamp')
  expect(changeSetEligibility(stamped.value,{...target('*'),purl:'pkg:generic/fixture',range:'vers:toy/>=2|<10'},toySourcePlugin)).toMatchObject({value:true})
  expect(toySourcePlugin.compareVersions!('pkg:generic/fixture','2','10')).toMatchObject({value:-1})
})

it('uses the nearest workspace owner and isolates independent package targets', () => {
  const root=fixture()
  write(root,'package.json',JSON.stringify({name:'fixture',workspaces:['packages/*'],dependencies:{dependency:'^0.4.1'}}))
  write(root,'packages/other/package.json',JSON.stringify({name:'other',version:'1.0.0',dependencies:{dependency:'^0.5.0'}}))
  write(root,'pnpm-lock.yaml','importers:\n  .:\n    dependencies:\n      dependency:\n        version: 0.4.2\n  packages/other:\n    dependencies:\n      dependency:\n        version: 0.5.1\n')
  const content='---\ndocbridge:\n  targets:\n    pkg:npm/dependency: null\n    pkg:npm/missing: null\n---\n# API'
  write(root,'docs/api.md',content);write(root,'packages/other/docs/api.md',content)
  const snapshot=discoverRepository({root})
  expect(snapshot.entities.find(e=>e.path==='docs/api.md')?.metadata?.targets).toMatchObject([{range:'vers:npm/0.4.2'}, {state:'unresolved'}])
  expect(snapshot.entities.find(e=>e.path==='packages/other/docs/api.md')?.metadata?.targets).toMatchObject([{range:'vers:npm/0.5.1'}, {state:'unresolved'}])
})
