import { z } from 'zod'
import { EvidenceSchema, EntitySchema, type KnowledgeEntity } from '../schemas/knowledge.js'
import { entityId } from '../discovery/identity.js'
import { StorageHashSchema } from './contract.js'

export const SurfaceFactKindSchema = z.enum(['symbol', 'cli-command', 'cli-flag', 'config-key', 'signature'])
const TypeTokensSchema = z.array(z.string()).max(4096)
export const CallableSignatureSchema = z.object({
  parameters: z.array(z.object({ name: TypeTokensSchema, optional: z.boolean(), rest: z.boolean(), default: z.boolean(), type: TypeTokensSchema.nullable() }).strict()).max(256),
  typeParameters: z.array(TypeTokensSchema).max(64),
  returnType: TypeTokensSchema.nullable(),
}).strict()
export const SignatureProofSchema = z.object({
  codec: z.literal('typescript-callable-v1'),
  overloads: z.array(CallableSignatureSchema).min(1).max(64),
  types: z.record(z.string(), z.string()),
}).strict().refine(value => Buffer.byteLength(JSON.stringify(value)) <= 16_384, 'Signature proof exceeds 16 KiB.')
export const SurfaceFactSchema = z.object({ kind: SurfaceFactKindSchema, id: z.string().min(1).max(256), ownerId: z.string().min(1).max(256), name: z.string().min(1).max(256), valueHash: StorageHashSchema, signature: SignatureProofSchema.optional(), ownValueHash: StorageHashSchema.optional(), evidence: z.array(EvidenceSchema).min(1).max(64) }).strict()
export type SurfaceFact = Readonly<z.infer<typeof SurfaceFactSchema>>
const PurlSchema = z.string().min(5).max(512).regex(/^pkg:[a-z][a-z0-9.+-]*\/[^\s]+$/)
export const PackageFactSchema = z.object({ id: z.string().min(1).max(256), purl: PurlSchema, version: z.string().min(1).max(256).optional(), dependencies: z.array(z.object({ purl: PurlSchema, range: z.string().min(1).max(512), lockedVersion: z.string().min(1).max(256).optional() }).strict()).max(10_000), evidence: z.array(EvidenceSchema).min(1).max(64) }).strict()
export type PackageFact = Readonly<z.infer<typeof PackageFactSchema>>
const SurfaceMetadataSchema = z.object({ factCodecVersion: z.literal(1), fact: SurfaceFactSchema.omit({ evidence: true }) }).strict()
const PackageMetadataSchema = z.object({ factCodecVersion: z.literal(1), package: PackageFactSchema.omit({ id: true, evidence: true }) }).strict()
export const surfaceFactEntityId = (kind: SurfaceFact['kind'], ownerId: string, name: string): string => entityId(kind, `${ownerId}:${name}`)
export const surfaceFactToEntity = (input: SurfaceFact): KnowledgeEntity => {
  const fact = SurfaceFactSchema.parse(input)
  const { evidence, ...metadata } = fact
  if (fact.id !== surfaceFactEntityId(fact.kind, fact.ownerId, fact.name)) throw new Error('INVALID_FACT_ID')
  return EntitySchema.parse({ id: fact.id, kind: fact.kind, name: fact.name, provenance: 'observed', evidence, metadata: { factCodecVersion: 1, fact: metadata } })
}
export const surfaceFactFromEntity = (input: KnowledgeEntity): SurfaceFact => {
  const entity = EntitySchema.parse(input)
  const metadata = SurfaceMetadataSchema.parse(entity.metadata)
  const fact = SurfaceFactSchema.parse({ ...metadata.fact, evidence: entity.evidence })
  if (entity.kind !== fact.kind || entity.id !== fact.id || entity.name !== fact.name || fact.id !== surfaceFactEntityId(fact.kind, fact.ownerId, fact.name)) throw new Error('INVALID_FACT_ID')
  return fact
}
export const packageFactToEntity = (input: PackageFact, existing?: KnowledgeEntity): KnowledgeEntity => {
  const fact = PackageFactSchema.parse(input)
  if (existing && (existing.kind !== 'package' || existing.id !== fact.id)) throw new Error('INVALID_PACKAGE_OWNER')
  const { id, evidence, ...metadata } = fact
  // Preserve unrelated package metadata; only the versioned codec namespace is owned here.
  return EntitySchema.parse({ ...(existing ?? { id, kind: 'package', name: fact.purl, provenance: 'observed' }), evidence: existing ? [...existing.evidence, ...evidence.filter(item => !existing.evidence.some(prior => prior.path === item.path && prior.contentHash === item.contentHash))].slice(0, 64) : evidence, metadata: { ...existing?.metadata, factCodecVersion: 1, package: metadata } })
}
export const packageFactFromEntity = (input: KnowledgeEntity): PackageFact => {
  const entity = EntitySchema.parse(input)
  if (entity.kind !== 'package') throw new Error('INVALID_PACKAGE_OWNER')
  const { factCodecVersion, package: packageValue } = entity.metadata ?? {}
  const metadata = PackageMetadataSchema.parse({ factCodecVersion, package: packageValue })
  return PackageFactSchema.parse({ id: entity.id, ...metadata.package, evidence: entity.evidence })
}
