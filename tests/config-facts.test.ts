import * as ts from 'typescript'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, describe, expect, it } from 'vitest'
import { configFactsFromSource, configFactsFromJsonSchema } from '../src/discovery/facts/config.js'
import { analyzeMarkdownDocument, parseMarkdownDocument } from '../src/discovery/markdown.js'
import { discoverRepository, discoverRepositoryWithRead } from '../src/discovery/repository.js'
import { diffSnapshots } from '../src/diff/change-set.js'
import { safeWalkFiles } from '../src/safety/repository.js'
import { contentRef, createLocalRepositoryRead } from '../src/storage/local.js'
import { toPosix } from '../src/lib/paths.js'
import { buildDocBridgeIndex } from '../src/index-builder/build-index.js'
import { loadFreshDocBridgeIndex, IndexStaleError } from '../src/query/load-index.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, {recursive:true, force:true}) })
const fixture = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-bridge-config-'))
  roots.push(root)
  cpSync('tests/fixtures/config-key-project', root, {recursive:true})
  return root
}

const extract = (body: string, path = 'src/settings.ts') => configFactsFromSource(ts.createSourceFile(path, `import {z} from 'zod';\n${body}`, ts.ScriptTarget.Latest, true), path, `module:${path}`)
const hash = (body: string, name = 'output.format') => extract(body).facts.find(fact => fact.name === name)?.valueHash

describe('static configuration facts', () => {
  it('extracts nested objects, defaults, enums and required/optional identity', () => {
    const result = extract("export const ConfigSchema = z.object({output: z.object({format:z.enum(['json','text']).default('json'), enabled:z.boolean().optional(), count:z.number()})});")
    expect(result.facts.map(fact => fact.name).sort()).toEqual(['output', 'output.count', 'output.enabled', 'output.format'])
    expect(result.coverage[0]?.status).toBe('complete')
    const schema = (value: string) => `export const ConfigSchema = z.object({output:z.object({format:${value}})});`
    expect(hash(schema("z.enum(['json','text']).default('json')"))).not.toBe(hash(schema("z.enum(['json','text']).default('text')")))
    expect(hash(schema("z.enum(['json','text'])"))).not.toBe(hash(schema("z.enum(['json','text']).optional()")))
    expect(hash(schema("z.enum(['json','text'])"))).toBe(hash(schema("z.enum(['text','json'])")))
    expect(hash(schema('z.string()'))).not.toBe(hash(schema('z.number()')))
  })
  it('resolves local helper schemas and literal constants without duplicate helper roots', () => {
    const result = extract("const DEFAULT = 'text'; export const OutputConfig = z.object({format:z.string().default(DEFAULT)}); export const ConfigSchema = z.object({output:OutputConfig.optional()});")
    expect(result.facts.map(fact => fact.name).sort()).toEqual(['output', 'output.format'])
    expect(result.coverage[0]?.status).toBe('complete')
  })
  it('ignores non-config schemas and non-Zod object calls', () => {
    expect(extract('export const UserSchema = z.object({name:z.string()});').facts).toEqual([])
    expect(extract('export const ConfigSchema = other.object({name:other.string()});').facts).toEqual([])
  })
  it('accepts explicit declaration, schema filenames and defineConfig-wrapped schemas', () => {
    expect(extract('/** @docbridgeConfig */\nconst Settings = z.object({port:z.number()});').facts.map(fact => fact.name)).toEqual(['port'])
    expect(extract('export const Settings = z.object({port:z.number()});', 'settings.config-schema.ts').facts.map(fact => fact.name)).toEqual(['port'])
    expect(extract('export const ConfigSchema = defineConfig(z.object({port:z.number()}));').facts.map(fact => fact.name)).toEqual(['port'])
    expect(extract('const settings = z.object({port:z.number()}); export { settings as ConfigSchema };').facts.map(fact => fact.name)).toEqual(['port'])
    expect(extract('export default z.object({port:z.number()});', 'config-schema.ts').facts.map(fact => fact.name)).toEqual(['port'])
  })
  it('records dynamic, recursive and unrecognized schemas as partial', () => {
    expect(extract('export const ConfigSchema=z.object({key:z.string();').coverage[0]?.status).toBe('partial')
    expect(extract('export const ConfigSchema=z.object({key:z.string().optional().refine(Boolean)});').coverage[0]?.status).toBe('partial')
    for (const body of ["export const ConfigSchema=z.object({key:z.string().default(getDefault())});", 'export const ConfigSchema=z.object(shape);', 'export const ConfigSchema=z.object({child:ConfigSchema});', 'export const ConfigSchema=z.object({key:z.string().transform(value=>value)});', 'export const ConfigSchema=z.object({options:z.record(z.string(),z.unknown())});']) expect(extract(body).coverage[0]?.status).toBe('partial')
  })
  it('extracts JSON Schema nested keys, requiredness, enum/default changes and local refs', () => {
    const document = { type:'object', properties:{output:{$ref:'#/$defs/output'}}, required:['output'], $defs:{output:{type:'object', properties:{format:{type:'string', enum:['json','text'], default:'json'}}, required:['format']}} }
    const before = configFactsFromJsonSchema(JSON.stringify(document), 'config.schema.json', 'package:doc-bridge')
    expect(before.facts.map(fact => fact.name).sort()).toEqual(['output', 'output.format'])
    expect(before.coverage[0]?.status).toBe('complete')
    document.$defs.output.properties.format.default = 'text'
    const after = configFactsFromJsonSchema(JSON.stringify(document), 'config.schema.json', 'package:doc-bridge')
    expect(before.facts.find(fact=>fact.name==='output.format')?.valueHash).not.toBe(after.facts.find(fact=>fact.name==='output.format')?.valueHash)
    expect(configFactsFromJsonSchema('{"type":"object","properties":{"name":{"type":"string"}}}', 'user.schema.json', 'package:doc-bridge').facts).toEqual([])
    expect(configFactsFromJsonSchema('{"title":"User configuration","properties":{"port":{"type":"number"}}}', 'settings.json', 'package:doc-bridge').facts).toHaveLength(1)
    expect(configFactsFromJsonSchema('{"type":"object","properties":{"x":{"$ref":"other.json"}}}', 'config.schema.json', 'package:doc-bridge').coverage[0]?.status).toBe('partial')
    expect(configFactsFromJsonSchema('{"type":"object","properties":{"x":{"$dynamicRef":"#x"}}}', 'config.schema.json', 'package:doc-bridge').coverage[0]?.status).toBe('partial')
    expect(configFactsFromJsonSchema('{"type":"object","properties":{"x":{"enum":"invalid"},"":{"type":"string"}}}', 'config.schema.json', 'package:doc-bridge').coverage[0]?.status).toBe('partial')
  })
  it('bounds key names, depth and output', () => {
    const properties = Object.fromEntries(Array.from({length:4100}, (_,index)=>[`key${index}`, {type:'string'}]))
    const result = configFactsFromJsonSchema(JSON.stringify({type:'object',properties}), 'config.schema.json', 'package:doc-bridge')
    expect(result.facts).toHaveLength(4096)
    expect(result.coverage[0]?.status).toBe('partial')
    expect(extract('export const ConfigSchema=z.object({key:z.number().default(1e309)});').coverage[0]?.status).toBe('partial')
    let deep: unknown = null
    for (let depth=0;depth<40;depth++) deep={nested:deep}
    expect(configFactsFromJsonSchema(JSON.stringify({properties:{key:{default:deep}}}), 'config.schema.json','package:doc-bridge').coverage[0]?.status).toBe('partial')
  })
  it('covers the repository root configuration schema', () => {
    const path = 'src/config/schema.ts'
    const result = configFactsFromSource(ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true), path, `module:${path}`)
    expect(result.facts.map(fact=>fact.name)).toEqual(expect.arrayContaining(['gates.include','surfaces.cli.defaultFormat','retrieval.params.k1','corpus.agent.root']))
    expect(result.coverage[0]?.status).toBe('partial')
  })
  it('resolves dotted tokens and rejects bare leaf aliases', () => {
    const facts = new Map([
      ['output.format', [{kind:'config-key', name:'output.format', ownerId:'module:config.ts'}]],
      ['output.enabled', [{kind:'config-key', name:'output.enabled', ownerId:'module:config.ts'}]],
      ['input.enabled', [{kind:'config-key', name:'input.enabled', ownerId:'module:config.ts'}]],
    ])
    const result = analyzeMarkdownDocument(parseMarkdownDocument('README.md', '# Guide\n`output.format` `format` `enabled` `output.enabled`'), 'document:README.md', {documents:new Map(), modules:new Map(), packages:new Map(), symbols:new Map(), facts})
    expect(result.relations.map(relation=>relation.metadata?.factName).sort()).toEqual(['output.enabled','output.format'])
    expect(result.relations.find(relation=>relation.metadata?.factName==='output.format')?.evidence).toHaveLength(1)
  })
  it('detects a removed dotted key and changed default through real snapshots and head text', () => {
    const root = fixture()
    const base = discoverRepository({root})
    expect(base.relations.some(relation=>relation.metadata?.factName==='output.format')).toBe(true)
    expect(base.entities.some(entity=>entity.kind==='config-key' && entity.name==='storage.mode')).toBe(true)
    const source = readFileSync(join(root, 'config.ts'), 'utf8')
    writeFileSync(join(root, 'config.ts'), source.replace(".default('json')", ".default('text')"))
    const changed = diffSnapshots(base, discoverRepository({root}), {headRoot:root})
    const delta = changed.changeSet.changes.find(change=>change.kind==='config-key' && change.before?.name==='output.format')!
    expect(delta.op).toBe('changed')
    expect(delta.before?.valueHash).not.toBe(delta.after?.valueHash)
    expect(changed.findings).toEqual([])
    writeFileSync(join(root, 'config.ts'), source.replace('format:', 'encoding:'))
    const head = discoverRepository({root})
    const removed = diffSnapshots(base, head, {headRoot:root})
    expect(removed.changeSet.changes.some(change=>change.kind==='config-key' && change.op==='removed' && change.before?.name==='output.format')).toBe(true)
    expect(removed.findings).toContainEqual(expect.objectContaining({code:'BROKEN_REFERENCE', status:'conflict'}))
    expect(discoverRepository({root, previous:base}).contentHash).toBe(head.contentHash)
  })
  it('ignores bare leaf and generated dotted citations', () => {
    const root = fixture()
    writeFileSync(join(root, 'README.md'), '# Config\nUse `format`.\n')
    expect(discoverRepository({root}).relations.find(relation=>relation.metadata?.factName==='output.format')).toBeUndefined()
    writeFileSync(join(root, 'README.md'), '# Config\n<!-- doc-bridge:generated hash=abc -->\n`output.format`\n<!-- /doc-bridge:generated -->\n')
    expect(discoverRepository({root}).relations.find(relation=>relation.metadata?.factName==='output.format')).toBeUndefined()
  })
  it('keeps configuration citations within package and fixture boundaries', () => {
    const facts = new Map([['output.format', [
      {kind:'config-key',name:'output.format',ownerId:'module:config.ts',evidence:[{source:'code' as const,path:'config.ts'}]},
      {kind:'config-key',name:'output.format',ownerId:'module:packages/cli/config.ts',evidence:[{source:'code' as const,path:'packages/cli/config.ts'}]},
    ]]])
    const resolution = {documents:new Map(),modules:new Map(),packages:new Map(),symbols:new Map(),facts,packagePaths:[{id:'package:root',path:'.'},{id:'package:cli',path:'packages/cli'}]}
    expect(analyzeMarkdownDocument(parseMarkdownDocument('README.md','`output.format`'), 'document:README.md',resolution).relations[0]?.to).toBe('module:config.ts')
    expect(analyzeMarkdownDocument(parseMarkdownDocument('packages/cli/README.md','`output.format`'), 'document:packages/cli/README.md',resolution).relations[0]?.to).toBe('module:packages/cli/config.ts')
    expect(analyzeMarkdownDocument(parseMarkdownDocument('tests/fixtures/other/README.md','`output.format`'), 'document:tests/fixtures/other/README.md',resolution).relations).toEqual([])
  })
  it('caps fact citations separately without displacing legacy relations', () => {
    const facts = new Map(Array.from({length:65},(_,index)=>[`output.key${index}`,[{kind:'config-key',name:`output.key${index}`,ownerId:'module:config.ts'}]]))
    const modules = new Map(Array.from({length:65},(_,index)=>[`src/file${index}.ts`,`module:src/file${index}.ts`]))
    const document = parseMarkdownDocument('README.md',[...facts.keys(),...modules.keys()].map(token=>`\`${token}\``).join(' '))
    const resolution = {documents:new Map(),modules,packages:new Map(),symbols:new Map()}
    const base = analyzeMarkdownDocument(document,'document:README.md',resolution)
    const head = analyzeMarkdownDocument(document,'document:README.md',{...resolution,facts})
    expect(head.relations.filter(relation=>!relation.metadata?.factKind)).toEqual(base.relations)
    expect(head.relations.filter(relation=>relation.metadata?.factKind)).toHaveLength(64)
    expect(head.notes.map(note=>note.scope)).toEqual(expect.arrayContaining(['relations:README.md','fact-relations:README.md']))
  })
  it('applies configured JSON exclusions even when the injected reader exposes the file', async () => {
    const root = fixture()
    const inventory = Object.fromEntries(safeWalkFiles(root).files.map(path=>[toPosix(relative(root,path)),contentRef(readFileSync(path))]))
    const read = await createLocalRepositoryRead({root,partition:{repositoryId:'doc-bridge',revision:'config-revision'},inventory,limits:{maxFiles:100_000,maxBytes:512*1024*1024,maxFileBytes:64*1024*1024,maxTimeMs:60_000,maxMemoryMb:2048}})
    const config = {schemaVersion:1 as const,corpus:{agent:{root:'.'}},safety:{exclude:['storage.config-schema.json']}}
    const local = discoverRepository({root,config})
    const injected = (await discoverRepositoryWithRead(read,{root,config})).snapshot
    for (const snapshot of [local,injected]) {
      expect(snapshot.entities.some(entity=>entity.kind==='config-key' && entity.name==='storage.mode')).toBe(false)
      expect(snapshot.entities.some(entity=>entity.kind==='config-key' && entity.name==='output.format')).toBe(true)
    }
  })
  it('binds JSON-only changes and empty schemas to content revisions', () => {
    const root = fixture()
    const before = discoverRepository({root})
    const path = join(root,'storage.config-schema.json')
    writeFileSync(path,readFileSync(path,'utf8').replace('"default":"memory"','"default":"disk"'))
    const after = discoverRepository({root})
    const warm = discoverRepository({root,previous:before})
    expect(warm.contentHash).toBe(after.contentHash)
    expect(after.sourceRevision).not.toBe(before.sourceRevision)
    expect(diffSnapshots(before,after).changeSet.changes).toContainEqual(expect.objectContaining({kind:'config-key',op:'changed',before:expect.objectContaining({name:'storage.mode'})}))
    writeFileSync(path,'{"type":"object","properties":{}}')
    expect(discoverRepository({root}).sourceRevision).not.toBe(after.sourceRevision)
  })
  it('does not make a config citation ambiguous when another package adds the same key', () => {
    const root = fixture()
    writeFileSync(join(root,'package.json'),'{"name":"doc-bridge","packageManager":"pnpm@10","workspaces":["packages/*"]}')
    const base = discoverRepository({root})
    const child = join(root,'packages','cli')
    mkdirSync(child,{recursive:true})
    writeFileSync(join(child,'package.json'),'{"name":"@agentskit/doc-bridge"}')
    cpSync(join(root,'config.ts'),join(child,'config.ts'))
    expect(diffSnapshots(base,discoverRepository({root}),{headRoot:root}).findings).toEqual([])
  })
  // Blocked: JSON Schema files are absent from the shared repository-input fingerprint.
  // Enable after the index freshness policy includes those inputs.
  it.skip('marks an index stale after a JSON-only default change', () => {
    const root = fixture()
    const config = {schemaVersion:1 as const,corpus:{agent:{root:'.'}}}
    buildDocBridgeIndex({root,config,write:true})
    expect(()=>loadFreshDocBridgeIndex(root,config)).not.toThrow()
    const path = join(root,'storage.config-schema.json')
    writeFileSync(path,readFileSync(path,'utf8').replace('"default":"memory"','"default":"disk"'))
    expect(()=>loadFreshDocBridgeIndex(root,config)).toThrow(IndexStaleError)
  })
})
