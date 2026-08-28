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
): KnowledgeEntity => {
  const direct = entities.find((entity) => entity.id === reference || entity.aliases?.includes(reference))
  if (direct) return direct
  const packageReference = reference.replace(/^package:/, '')
  const packageCandidates = entities.filter((entity) => {
    if (entity.kind !== 'package') return false
    const pathName = entity.path?.split('/').pop()
    return entity.name === reference || entity.path === reference || pathName === packageReference || entity.name.endsWith(`/${packageReference}`)
  })
  const resolved = packageCandidates.length === 1 ? packageCandidates[0] : undefined
  if (resolved) return resolved
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
  for (let index = 1; index < end; index += 1) {
    const line = lines[index] ?? ''
    if (docbridgeLine < 0 && /^docbridge\s*:/.test(line)) docbridgeLine = index
    if (typeLine < 0 && /^type\s*:/.test(line)) typeLine = index
    if (packageLine < 0 && /^package\s*:/.test(line)) packageLine = index
    if (humanDocLine < 0 && /^humanDoc\s*:/.test(line)) humanDocLine = index
  }
  if (docbridgeLine < 0) {
    const type = typeLine >= 0 ? scalar(lines[typeLine]?.slice('type:'.length) ?? '') : ''
    const packageReference = packageLine >= 0 ? scalar(lines[packageLine]?.slice('package:'.length) ?? '') : conventionalPath ?? ''
    if (type === 'package' && packageReference) return { covers: [{ value: packageReference, line: packageLine >= 0 ? packageLine + 1 : typeLine + 1 }], relations: [], diagnostics: [], hasDocbridge: true }
    if (conventionalPath) return { covers: [{ value: packageReference, line: humanDocLine >= 0 ? humanDocLine + 1 : 1 }], relations: [], diagnostics: [], hasDocbridge: true }
    return { covers: [], relations: [], diagnostics: [], hasDocbridge: false }
  }

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

  if (!parsed.covers.length && !parsed.relations.length) {
    addDiagnostic(diagnostics, input, 'DOCBRIDGE_CONTENT_MISSING', 'docbridge must declare covers or relations.', 1)
  }

  for (const [index, cover] of parsed.covers.entries()) {
    const target = resolveEntity(cover.value, options.snapshot.entities, input, cover.line, unresolved)
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
    const fromEntity = resolveEntity(from, options.snapshot.entities, input, declaration.startLine, unresolved)
    const toEntity = resolveEntity(to, options.snapshot.entities, input, declaration.startLine, unresolved)
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

  for (const document of documents) {
    const result = parseDocumentationDeclarations(document, { snapshot, ...options })
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
