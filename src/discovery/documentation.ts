import { parseDocument, type Node as YamlNode } from 'yaml'
import { z } from 'zod'

import { contentHashForArtifactV1 } from '../index-builder/content-hash.js'
import {
  DiscoverySnapshotV1Schema,
  type DiscoverySnapshotV1,
  type Evidence,
  type KnowledgeEntity,
  type KnowledgeRelation,
} from '../schemas/knowledge.js'

export type DocumentationDiagnostic = {
  readonly code: string
  readonly message: string
  readonly path: string
  readonly evidence: Evidence
}

export type DocumentationDeclarationInput = {
  readonly path: string
  readonly content: string
}

export type DocumentationDeclarationOptions = {
  readonly snapshot: Pick<DiscoverySnapshotV1, 'entities'>
  readonly documentId?: string
  /** Agent corpus root used for conservative package/app path inference. */
  readonly agentRoot?: string
  readonly entityLookup?: EntityLookup
}

export type DocumentationDeclarationResult = {
  readonly hasDocbridge: boolean
  readonly entities: readonly KnowledgeEntity[]
  readonly relations: readonly KnowledgeRelation[]
  readonly diagnostics: readonly DocumentationDiagnostic[]
}

export type DocumentationAnalysisResult = {
  readonly snapshot: DiscoverySnapshotV1
  readonly diagnostics: readonly DocumentationDiagnostic[]
}

type RelationFields = {
  from?: string
  to?: string
  kind?: string
  detection?: string
  startLine: number
  endLine: number
  fields: Set<string>
}

type EntityLookup = ReadonlyMap<string, KnowledgeEntity>

const detectionValues = new Set(['static', 'dynamic', 'external'])

const evidence = (path: string, lineStart: number, lineEnd = lineStart): Evidence => ({
  source: 'documentation',
  path,
  lineStart,
  lineEnd,
})

const diagnostic = (
  path: string,
  code: string,
  message: string,
  lineStart: number,
  lineEnd = lineStart,
): DocumentationDiagnostic => ({ code, message, path: 'docbridge', evidence: evidence(path, lineStart, lineEnd) })

const entityLookup = (entities: readonly KnowledgeEntity[]): EntityLookup => {
  const lookup = new Map<string, KnowledgeEntity>()
  for (const entity of entities) {
    if (!lookup.has(entity.id)) lookup.set(entity.id, entity)
    for (const alias of entity.aliases ?? []) if (!lookup.has(alias)) lookup.set(alias, entity)
  }
  return lookup
}

const scalar = (value: string): string => {
  const trimmed = value.trim()
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

const isFieldName = (value: string): boolean => {
  if (!/^[A-Za-z]/.test(value)) return false
  for (const character of value.slice(1)) {
    if (!/[A-Za-z0-9_-]/.test(character)) return false
  }
  return true
}

const parseIndentedField = (raw: string, indentation: number): { readonly key: string; readonly value: string } | undefined => {
  const prefix = ' '.repeat(indentation)
  if (!raw.startsWith(prefix) || raw[indentation] === ' ') return undefined
  const body = raw.slice(indentation)
  const separator = body.indexOf(':')
  if (separator <= 0) return undefined
  const key = body.slice(0, separator).trim()
  return isFieldName(key) ? { key, value: body.slice(separator + 1).trim() } : undefined
}

const parseListItem = (raw: string, indentation: number): string | undefined => {
  const prefix = `${' '.repeat(indentation)}-`
  if (!raw.startsWith(prefix)) return undefined
  const rest = raw.slice(prefix.length)
  if (rest && !/\s/.test(rest[0] ?? '')) return undefined
  return rest.trim()
}

/*
 * The `docbridge` block is real YAML validated by Zod.
 *
 * It used to be read by a hand-written parser for a YAML subset, which meant a quoted list, a
 * multi-line string or an anchor was a syntax error in a file every other tool considered valid.
 * The schema is deliberately structural rather than semantic: it says what shape the block has,
 * while the checks that a relation names all four of its fields and a known detection value stay
 * downstream, where they already produce the aggregated messages this contract promises.
 */
const DocbridgeRelationSchema = z
  .object({
    from: z.string().min(1).optional(),
    to: z.string().min(1).optional(),
    kind: z.string().min(1).optional(),
    detection: z.string().min(1).optional(),
  })
  .strict()

const DocbridgeBlockSchema = z
  .object({
    covers: z.array(z.string().min(1)).optional(),
    relations: z.array(DocbridgeRelationSchema).optional(),
  })
  .strict()

/**
 * Map a schema issue onto the diagnostic code it has always had.
 *
 * The codes are a published contract — a repository may fail its build on one — so adopting a
 * schema must not rename them. Zod says precisely what is wrong and where; this decides which
 * existing code that corresponds to.
 */
const issueCode = (issue: z.core.$ZodIssue): string => {
  const [first, second, third] = issue.path
  if (issue.code === 'unrecognized_keys') return 'DOCBRIDGE_FIELD_UNKNOWN'
  if (first === undefined) return 'DOCBRIDGE_BLOCK_MALFORMED'
  if (first === 'covers') return second === undefined ? 'DOCBRIDGE_COVERS_INVALID' : 'DOCBRIDGE_REFERENCE_MISSING'
  if (first === 'relations') {
    if (second === undefined) return 'DOCBRIDGE_RELATIONS_INVALID'
    return third === undefined ? 'DOCBRIDGE_RELATION_INVALID' : 'DOCBRIDGE_FIELD_UNKNOWN'
  }
  return 'DOCBRIDGE_STRUCTURE_INVALID'
}

const issueMessage = (issue: z.core.$ZodIssue): string => {
  const field = issue.path.length ? `docbridge.${issue.path.join('.')}` : 'docbridge'
  const keys = issue.code === 'unrecognized_keys' ? `: ${issue.keys.join(', ')}` : ''
  return `${field}: ${issue.message}${keys}`
}

/** Absolute file line of an offset inside the frontmatter body. */
const lineResolver = (body: string, frontmatterLine: number) => (offset: number): number => {
  const safe = Math.max(0, Math.min(offset, body.length))
  let line = frontmatterLine + 1
  for (let index = 0; index < safe; index += 1) if (body[index] === '\n') line += 1
  return line
}

type YamlRanged = { readonly range?: readonly [number, number, number] | null }

const nodeStart = (node: unknown): number | undefined => {
  const range = (node as YamlRanged | null | undefined)?.range
  return range ? range[0] : undefined
}

const conventionalPackageReference = (path: string, agentRoot: string): string | undefined => {
  const prefix = `${agentRoot.replace(/\/$/, '')}/`
  if (!path.startsWith(prefix)) return undefined
  const relative = path.slice(prefix.length)
  const [scope, file] = relative.split('/')
  if ((scope !== 'packages' && scope !== 'apps') || !file) return undefined
  return file.replace(/\.mdx?$/, '')
}

const list = (value: string): string[] | undefined => {
  const trimmed = value.trim()
  if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return undefined
  const body = trimmed.slice(1, -1).trim()
  return body ? body.split(',').map(scalar).filter(Boolean) : []
}

const findFrontmatter = (content: string): { readonly lines: readonly string[]; readonly end: number } | undefined => {
  const lines = content.replace(/^\uFEFF/, '').split(/\r?\n/)
  if (lines[0] !== '---') return undefined
  const end = lines.findIndex((line, index) => index > 0 && line === '---')
  return end < 0 ? undefined : { lines, end }
}

const addDiagnostic = (
  diagnostics: DocumentationDiagnostic[],
  input: DocumentationDeclarationInput,
  code: string,
  message: string,
  line: number,
  endLine = line,
): void => {
  diagnostics.push(diagnostic(input.path, code, message, line, endLine))
}

const resolveEntity = (
  reference: string,
  entities: readonly KnowledgeEntity[],
  input: DocumentationDeclarationInput,
  lineStart: number,
  unresolved: Map<string, KnowledgeEntity>,
  lookup: EntityLookup,
): KnowledgeEntity => {
  const direct = lookup.get(reference)
  if (direct) return direct
  const packageReference = reference.replace(/^package:/, '')
  const packageCandidates = entities.filter((entity) => {
    if (entity.kind !== 'package') return false
    const pathName = entity.path?.split('/').pop()
    return entity.name === reference || entity.path === reference || pathName === packageReference || entity.name.endsWith(`/${packageReference}`)
  })
  const resolved = packageCandidates.length === 1 ? packageCandidates[0] : undefined
  if (resolved) return resolved

  /*
   * An ownership id resolves to the area that carries it.
   *
   * Agent documents declare coverage by ownership id (`editRoot: src/query` becomes ownership
   * `doc-bridge-query`), and until areas existed there was nothing in the graph with that
   * identity — every such declaration became an unresolved reference, and the audit reported a
   * documented area as a gap.
   */
  const ownedAreas = entities.filter((entity) => entity.kind === 'area' && entity.metadata?.ownershipId === reference)
  if (ownedAreas.length === 1 && ownedAreas[0]) return ownedAreas[0]
  const id = `unresolved:${reference}`
  const existing = unresolved.get(id)
  if (existing) return existing
  const entity: KnowledgeEntity = {
    id,
    kind: 'unresolved-reference',
    name: reference,
    provenance: 'declared',
    evidence: [evidence(input.path, lineStart)],
  }
  unresolved.set(id, entity)
  return entity
}

const relationKey = (from: string, to: string, kind: string): string => `${from}\u0000${to}\u0000${kind}`

/**
 * Read the `docbridge` block as YAML.
 *
 * Returns `undefined` when YAML cannot read the block at all — a tab in the indentation, a
 * duplicate key, a scalar where a mapping was opened. The lenient line scanner below then takes
 * over, because on a mangled block a per-line diagnostic is more use to the author than a single
 * parser error, and because those diagnostics are the published contract.
 */
const parseDocbridgeYaml = (
  input: DocumentationDeclarationInput,
  lines: readonly string[],
  end: number,
):
  | {
      readonly covers: readonly { value: string; line: number }[]
      readonly relations: readonly RelationFields[]
      readonly diagnostics: readonly DocumentationDiagnostic[]
    }
  | undefined => {
  const body = lines.slice(1, end).join('\n')
  const document = parseDocument(body, { prettyErrors: false })
  if (document.errors.length) return undefined

  let data: unknown
  try {
    data = document.toJS()
  } catch {
    return undefined
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return undefined
  const raw = (data as Record<string, unknown>).docbridge
  const lineAt = lineResolver(body, 1)
  const blockNode = document.get('docbridge', true) as YamlNode | undefined

  const diagnostics: DocumentationDiagnostic[] = []
  // `docbridge:` with nothing under it is empty, not malformed: DOCBRIDGE_CONTENT_MISSING says so
  // downstream, and two diagnostics for one mistake is one too many.
  if (raw === null || raw === undefined) return { covers: [], relations: [], diagnostics }

  const parsed = DocbridgeBlockSchema.safeParse(raw)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const node = issue.path.length ? (document.getIn(['docbridge', ...issue.path], true) as YamlNode | undefined) : blockNode
      diagnostics.push(diagnostic(input.path, issueCode(issue), issueMessage(issue), lineAt(nodeStart(node) ?? nodeStart(blockNode) ?? 0)))
    }
  }

  /*
   * Keep what is individually valid. One unknown key should not discard the declarations around
   * it: the author gets the precise error and the graph still gets the edges they did declare.
   */
  const covers: { value: string; line: number }[] = []
  const relations: RelationFields[] = []
  const record = typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? (raw as Record<string, unknown>) : undefined

  if (Array.isArray(record?.covers)) {
    for (const [index, entry] of record.covers.entries()) {
      if (typeof entry !== 'string' || !entry.trim()) continue
      const node = document.getIn(['docbridge', 'covers', index], true) as YamlNode | undefined
      covers.push({ value: entry.trim(), line: lineAt(nodeStart(node) ?? nodeStart(blockNode) ?? 0) })
    }
  }

  if (Array.isArray(record?.relations)) {
    for (const [index, entry] of record.relations.entries()) {
      if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) continue
      const node = document.getIn(['docbridge', 'relations', index], true) as YamlNode | undefined
      const startLine = lineAt(nodeStart(node) ?? nodeStart(blockNode) ?? 0)
      const relation: RelationFields = { startLine, endLine: startLine, fields: new Set() }
      for (const field of ['from', 'to', 'kind', 'detection'] as const) {
        const value = (entry as Record<string, unknown>)[field]
        if (typeof value !== 'string' || !value.trim()) continue
        relation.fields.add(field)
        relation[field] = value.trim()
        const valueNode = document.getIn(['docbridge', 'relations', index, field], true) as YamlNode | undefined
        relation.endLine = Math.max(relation.endLine, lineAt(nodeStart(valueNode) ?? nodeStart(node) ?? 0))
      }
      relations.push(relation)
    }
  }

  return { covers, relations, diagnostics }
}

const parseBlock = (
  input: DocumentationDeclarationInput,
  options: Pick<DocumentationDeclarationOptions, 'agentRoot'> = {},
): { readonly covers: readonly { value: string; line: number }[]; readonly relations: readonly RelationFields[]; readonly diagnostics: readonly DocumentationDiagnostic[]; readonly hasDocbridge: boolean } => {
  const conventionalPath = conventionalPackageReference(input.path, options.agentRoot ?? 'docs/for-agents')
  const frontmatter = findFrontmatter(input.content)
  if (!frontmatter) {
    if (conventionalPath && !input.content.replace(/^\uFEFF/, '').startsWith('---')) {
      return { covers: [{ value: conventionalPath, line: 1 }], relations: [], diagnostics: [], hasDocbridge: true }
    }
    if (input.content.replace(/^\uFEFF/, '').startsWith('---')) {
      return {
        covers: [],
        relations: [],
        hasDocbridge: true,
        diagnostics: [diagnostic(input.path, 'DOCBRIDGE_FRONTMATTER_MALFORMED', 'Frontmatter must close with a line containing only ---.', 1)],
      }
    }
    return { covers: [], relations: [], diagnostics: [], hasDocbridge: false }
  }

  const { lines, end } = frontmatter
  let docbridgeLine = -1
  let typeLine = -1
  let packageLine = -1
  let humanDocLine = -1
  let editRootLine = -1
  let idLine = -1
  for (let index = 1; index < end; index += 1) {
    const line = lines[index] ?? ''
    if (docbridgeLine < 0 && /^docbridge\s*:/.test(line)) docbridgeLine = index
    if (typeLine < 0 && /^type\s*:/.test(line)) typeLine = index
    if (packageLine < 0 && /^package\s*:/.test(line)) packageLine = index
    if (humanDocLine < 0 && /^humanDoc\s*:/.test(line)) humanDocLine = index
    if (editRootLine < 0 && /^editRoot\s*:/.test(line)) editRootLine = index
    if (idLine < 0 && /^id\s*:/.test(line)) idLine = index
  }
  if (docbridgeLine < 0) {
    const type = typeLine >= 0 ? scalar(lines[typeLine]?.slice('type:'.length) ?? '') : ''
    const packageReference = packageLine >= 0 ? scalar(lines[packageLine]?.slice('package:'.length) ?? '') : conventionalPath ?? ''
    if (type === 'package' && packageReference) return { covers: [{ value: packageReference, line: packageLine >= 0 ? packageLine + 1 : typeLine + 1 }], relations: [], diagnostics: [], hasDocbridge: true }
    if (conventionalPath) return { covers: [{ value: packageReference, line: humanDocLine >= 0 ? humanDocLine + 1 : 1 }], relations: [], diagnostics: [], hasDocbridge: true }

    /*
     * `id` plus `editRoot` is a coverage declaration.
     *
     * The corpus already uses this pair to own a directory — it is what fills the ownership map
     * and the handoff — but discovery never read it, so the graph had no edge from the sidecar to
     * the unit it owns. With areas in the graph the reference resolves, and a documented area
     * stops being reported as a gap.
     */
    const editRoot = editRootLine >= 0 ? scalar(lines[editRootLine]?.slice('editRoot:'.length) ?? '') : ''
    const identifier = idLine >= 0 ? scalar(lines[idLine]?.slice('id:'.length) ?? '') : ''
    if (editRoot && identifier) {
      return { covers: [{ value: identifier, line: editRootLine + 1 }], relations: [], diagnostics: [], hasDocbridge: true }
    }
    return { covers: [], relations: [], diagnostics: [], hasDocbridge: false }
  }

  const fromYaml = parseDocbridgeYaml(input, lines, end)
  if (fromYaml) return { ...fromYaml, hasDocbridge: true }

  const diagnostics: DocumentationDiagnostic[] = []
  const covers: { value: string; line: number }[] = []
  const relations: RelationFields[] = []
  const inline = lines[docbridgeLine]?.slice('docbridge:'.length).trim() ?? ''
  if (inline && inline !== '{}') addDiagnostic(diagnostics, input, 'DOCBRIDGE_BLOCK_MALFORMED', 'docbridge must be a nested frontmatter object.', docbridgeLine + 1)

  let section: 'covers' | 'relations' | undefined
  let current: RelationFields | undefined
  const finishRelation = (): void => {
    if (current) relations.push(current)
    current = undefined
  }

  for (let index = docbridgeLine + 1; index < end; index += 1) {
    const raw = lines[index] ?? ''
    const trimmed = raw.trim()
    const line = index + 1
    if (!trimmed || trimmed.startsWith('#')) continue
    if (/\t/.test(raw)) {
      addDiagnostic(diagnostics, input, 'DOCBRIDGE_INDENTATION_INVALID', 'docbridge indentation must use spaces.', line)
      continue
    }
    if (!raw.startsWith(' ')) {
      finishRelation()
      section = undefined
      continue
    }
    const sectionField = parseIndentedField(raw, 2)
    if (sectionField) {
      finishRelation()
      const { key, value } = sectionField
      if (key !== 'covers' && key !== 'relations') {
        addDiagnostic(diagnostics, input, 'DOCBRIDGE_FIELD_UNKNOWN', `Unknown docbridge field: ${key ?? '(missing)'}.`, line)
        section = undefined
      } else if (key === 'covers') {
        section = 'covers'
        if (value) {
          const values = list(value)
          if (!values) addDiagnostic(diagnostics, input, 'DOCBRIDGE_COVERS_INVALID', 'covers must be a list of entity references.', line)
          else values.forEach((item) => covers.push({ value: item, line }))
        }
      } else {
        section = 'relations'
        if (value) addDiagnostic(diagnostics, input, 'DOCBRIDGE_RELATIONS_INVALID', 'relations must be a list of relation objects.', line)
      }
      continue
    }
    const listValue = parseListItem(raw, 4)
    if (section === 'covers' && listValue !== undefined) {
      const value = scalar(listValue)
      if (!value) addDiagnostic(diagnostics, input, 'DOCBRIDGE_REFERENCE_MISSING', 'covers entries must not be empty.', line)
      else covers.push({ value, line })
      continue
    }
    if (section === 'relations' && listValue !== undefined) {
      finishRelation()
      const firstField = parseIndentedField(`    ${listValue}`, 4)
      current = { startLine: line, endLine: line, fields: new Set() }
      if (firstField?.key) {
        current.fields.add(firstField.key)
        current[firstField.key as 'from' | 'to' | 'kind' | 'detection'] = scalar(firstField.value)
      } else if (listValue) {
        addDiagnostic(diagnostics, input, 'DOCBRIDGE_RELATION_INVALID', 'Relation entries must be field mappings.', line)
      }
      continue
    }
    const field = parseIndentedField(raw, 6)
    if (section === 'relations' && current && field) {
      const { key, value } = field
      current.endLine = line
      if (!['from', 'to', 'kind', 'detection'].includes(key)) {
        addDiagnostic(diagnostics, input, 'DOCBRIDGE_FIELD_UNKNOWN', `Unknown relation field: ${key}.`, line)
      } else if (current.fields.has(key)) {
        addDiagnostic(diagnostics, input, 'DOCBRIDGE_FIELD_DUPLICATE', `Duplicate relation field: ${key}.`, line)
      } else {
        current.fields.add(key)
        current[key as 'from' | 'to' | 'kind' | 'detection'] = scalar(value)
      }
      continue
    }
    addDiagnostic(diagnostics, input, 'DOCBRIDGE_STRUCTURE_INVALID', `Invalid docbridge structure at line ${line}.`, line)
  }
  finishRelation()
  return { covers, relations, diagnostics, hasDocbridge: true }
}

export const parseDocumentationDeclarations = (
  input: DocumentationDeclarationInput,
  options: DocumentationDeclarationOptions,
): DocumentationDeclarationResult => {
  const parsed = parseBlock(input, options)
  if (!parsed.hasDocbridge) return { hasDocbridge: false, entities: [], relations: [], diagnostics: [] }
  const diagnostics = [...parsed.diagnostics]
  const unresolved = new Map<string, KnowledgeEntity>()
  const relations: KnowledgeRelation[] = []
  const documentId = options.documentId ?? `document:${input.path}`
  const relationClaims = new Map<string, string>()
  const lookup = options.entityLookup ?? entityLookup(options.snapshot.entities)

  if (!parsed.covers.length && !parsed.relations.length) {
    addDiagnostic(diagnostics, input, 'DOCBRIDGE_CONTENT_MISSING', 'docbridge must declare covers or relations.', 1)
  }

  for (const [index, cover] of parsed.covers.entries()) {
    const target = resolveEntity(cover.value, options.snapshot.entities, input, cover.line, unresolved, lookup)
    relations.push({
      id: `relation:declared:${input.path}:covers:${index}`,
      kind: 'covers',
      from: documentId,
      to: target.id,
      provenance: 'declared',
      evidence: [evidence(input.path, cover.line)],
    })
  }

  for (const [index, declaration] of parsed.relations.entries()) {
    const basePath = `relations[${index}]`
    const missing = (['from', 'to', 'kind', 'detection'] as const).filter((field) => !declaration[field])
    if (missing.length) {
      addDiagnostic(diagnostics, input, 'DOCBRIDGE_RELATION_FIELD_MISSING', `Relation is missing required field(s): ${missing.join(', ')}.`, declaration.startLine, declaration.endLine)
      continue
    }
    const from = declaration.from as string
    const to = declaration.to as string
    const kind = declaration.kind as string
    const detection = declaration.detection as string
    if (!detectionValues.has(detection)) {
      addDiagnostic(diagnostics, input, 'DOCBRIDGE_DETECTION_INVALID', `Invalid relation detection: ${detection}.`, declaration.startLine, declaration.endLine)
      continue
    }
    const fromEntity = resolveEntity(from, options.snapshot.entities, input, declaration.startLine, unresolved, lookup)
    const toEntity = resolveEntity(to, options.snapshot.entities, input, declaration.startLine, unresolved, lookup)
    const key = relationKey(fromEntity.id, toEntity.id, kind)
    const previousDetection = relationClaims.get(key)
    if (previousDetection === detection) addDiagnostic(diagnostics, input, 'DOCBRIDGE_DECLARATION_DUPLICATE', 'Duplicate relation declaration.', declaration.startLine, declaration.endLine)
    if (previousDetection && previousDetection !== detection) addDiagnostic(diagnostics, input, 'DOCBRIDGE_DECLARATION_CONFLICT', 'Conflicting relation declarations use different detection values.', declaration.startLine, declaration.endLine)
    relationClaims.set(key, previousDetection ?? detection)
    relations.push({
      id: `relation:declared:${input.path}:${basePath}`,
      kind,
      from: fromEntity.id,
      to: toEntity.id,
      discriminator: detection,
      provenance: 'declared',
      evidence: [evidence(input.path, declaration.startLine, declaration.endLine)],
      metadata: { detection },
    })
  }

  return {
    hasDocbridge: true,
    entities: [...unresolved.values()].sort((a, b) => a.id.localeCompare(b.id)),
    relations,
    diagnostics,
  }
}

export const applyDocumentationDeclarations = (
  snapshot: DiscoverySnapshotV1,
  documents: readonly DocumentationDeclarationInput[],
  options: Pick<DocumentationDeclarationOptions, 'agentRoot'> = {},
): DocumentationAnalysisResult => {
  const entities = new Map(snapshot.entities.map((entity) => [entity.id, entity]))
  const relations = new Map(snapshot.relations.map((relation) => [relation.id, relation]))
  const diagnostics: DocumentationDiagnostic[] = []
  const lookup = entityLookup(snapshot.entities)

  for (const document of documents) {
    const result = parseDocumentationDeclarations(document, { snapshot, ...options, entityLookup: lookup })
    diagnostics.push(...result.diagnostics)
    for (const entity of result.entities) entities.set(entity.id, entity)
    for (const relation of result.relations) relations.set(relation.id, relation)
  }

  const base = { ...snapshot, contentHash: '0'.repeat(64), entities: [...entities.values()], relations: [...relations.values()] }
  return {
    snapshot: DiscoverySnapshotV1Schema.parse({ ...base, contentHash: contentHashForArtifactV1(base) }),
    diagnostics,
  }
}
