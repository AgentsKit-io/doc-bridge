import { z } from 'zod'

const NonEmptyStringSchema = z.string().refine((value) => value.trim().length > 0, 'must be non-empty')
const HttpsUrlSchema = z.string().url().refine((value) => value.startsWith('https://'), 'must use https')
const RepoSchema = z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)
const SlugSchema = z.string().regex(/^[a-z][a-z0-9-]*$/)

const SurfaceSchema = z.object({
  home: HttpsUrlSchema.optional(),
  docs: HttpsUrlSchema.optional(),
  llms: HttpsUrlSchema.optional(),
  stats: HttpsUrlSchema.optional(),
  documentation: z.enum(['fumadocs', 'repository']),
  chat: z.enum(['agentschat', 'custom', 'none']),
}).passthrough()

const ProductSchema = z.object({
  id: SlugSchema,
  name: NonEmptyStringSchema,
  shortName: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  role: NonEmptyStringSchema,
  promise: NonEmptyStringSchema,
  maturity: z.enum(['planning', 'alpha', 'beta', 'stable', 'deprecated']),
  repo: RepoSchema,
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  surfaces: SurfaceSchema,
  navigation: z.object({
    showInBar: z.boolean(),
    order: z.number().int().nonnegative().optional(),
    next: z.array(SlugSchema),
  }).passthrough(),
}).passthrough()

const LegacyPropertySchema = z.object({
  id: SlugSchema,
  name: NonEmptyStringSchema,
  barLabel: NonEmptyStringSchema,
  domain: NonEmptyStringSchema,
  url: HttpsUrlSchema,
  repo: RepoSchema,
  tagline: NonEmptyStringSchema,
  kind: NonEmptyStringSchema,
  accent: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  llms: HttpsUrlSchema.optional(),
  stats: HttpsUrlSchema.optional(),
}).passthrough()

const ManifestSchema = z.object({
  schemaVersion: z.literal(2),
  parentBrand: z.object({ id: NonEmptyStringSchema, name: NonEmptyStringSchema }).passthrough(),
  products: z.array(ProductSchema).min(1),
  properties: z.array(LegacyPropertySchema).length(4),
  builder: z.object({ id: NonEmptyStringSchema, name: NonEmptyStringSchema, url: HttpsUrlSchema }).passthrough().optional(),
}).passthrough()

const EvidenceSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('repository-derivation'),
    repo: RepoSchema,
    path: NonEmptyStringSchema,
    summary: NonEmptyStringSchema,
  }).passthrough(),
  z.object({ type: z.literal('endpoint'), url: HttpsUrlSchema, summary: NonEmptyStringSchema }).passthrough(),
])

const ClaimSchema = z.object({
  id: NonEmptyStringSchema,
  value: z.number().finite().nonnegative(),
  noun: NonEmptyStringSchema,
  conservativeFloor: z.number().int().nonnegative().optional(),
  evidence: EvidenceSchema,
}).passthrough()

const ClaimProductSchema = z.object({
  productId: SlugSchema,
  source: z.discriminatedUnion('type', [
    z.object({ type: z.literal('endpoint'), url: HttpsUrlSchema }).passthrough(),
    z.object({ type: z.literal('repository'), repo: RepoSchema }).passthrough(),
  ]),
  verification: z.enum(['verified', 'declared']),
  claims: z.array(ClaimSchema),
}).passthrough()

const ClaimsSchema = z.object({
  schemaVersion: z.literal(1),
  manifestSchemaVersion: z.literal(2),
  products: z.array(ClaimProductSchema),
}).passthrough()

const LEGACY_PRODUCT_IDS = ['agentskit', 'akos', 'playbook', 'registry'] as const

export const parseCanonicalEcosystemContract = (
  manifestInput: unknown,
  claimsInput: unknown,
): { readonly manifest: z.infer<typeof ManifestSchema>; readonly claims: z.infer<typeof ClaimsSchema> } => {
  const manifest = ManifestSchema.parse(manifestInput)
  const claims = ClaimsSchema.parse(claimsInput)
  const products = new Map(manifest.products.map((product) => [product.id, product]))
  if (products.size !== manifest.products.length) throw new Error('Manifest product IDs must be unique.')

  const navigationOrders = new Set<number>()
  for (const product of manifest.products) {
    if (product.surfaces.documentation === 'fumadocs' && !product.surfaces.docs) {
      throw new Error(`Product ${product.id} requires a docs surface for Fumadocs.`)
    }
    if (product.navigation.showInBar) {
      if (!product.surfaces.home || product.navigation.order === undefined) {
        throw new Error(`Product ${product.id} requires home and order for shared navigation.`)
      }
      if (navigationOrders.has(product.navigation.order)) throw new Error('Navigation orders must be unique.')
      navigationOrders.add(product.navigation.order)
    }
    const next = new Set(product.navigation.next)
    if (next.size !== product.navigation.next.length || next.has(product.id)) {
      throw new Error(`Product ${product.id} has duplicate or self-referential navigation.`)
    }
    for (const nextId of next) {
      if (!products.has(nextId)) throw new Error(`Product ${product.id} references unknown product ${nextId}.`)
    }
  }

  for (const [index, id] of LEGACY_PRODUCT_IDS.entries()) {
    const legacy = manifest.properties[index]
    const product = products.get(id)
    if (!legacy || !product || legacy.id !== id || !product.surfaces.home) {
      throw new Error(`Legacy property ${index} must project product ${id}.`)
    }
    const expected = {
      name: product.name,
      barLabel: product.shortName,
      domain: new URL(product.surfaces.home).host,
      url: product.surfaces.home,
      repo: product.repo,
      tagline: product.promise,
      kind: product.kind,
      accent: product.accent,
      llms: product.surfaces.llms,
      stats: product.surfaces.stats,
    }
    for (const [key, value] of Object.entries(expected)) {
      if (legacy[key as keyof typeof legacy] !== value) throw new Error(`Legacy ${id}.${key} must match v2.`)
    }
  }

  const claimProducts = new Map(claims.products.map((product) => [product.productId, product]))
  if (claimProducts.size !== claims.products.length || claimProducts.size !== products.size) {
    throw new Error('Claims must include every manifest product exactly once.')
  }
  for (const [productId, product] of products) {
    const claimProduct = claimProducts.get(productId)
    if (!claimProduct) throw new Error(`Claims are missing product ${productId}.`)
    if (claimProduct.source.type === 'endpoint') {
      if (claimProduct.source.url !== product.surfaces.stats) throw new Error(`Claims source for ${productId} must match stats.`)
    } else if (claimProduct.source.repo !== product.repo) {
      throw new Error(`Claims source for ${productId} must match repo.`)
    }
    if (claimProduct.verification === 'declared' && claimProduct.claims.length > 0) {
      throw new Error(`Declared product ${productId} cannot publish claims.`)
    }
    const claimIds = new Set<string>()
    for (const claim of claimProduct.claims) {
      if (claimIds.has(claim.id)) throw new Error(`Product ${productId} has duplicate claim ${claim.id}.`)
      claimIds.add(claim.id)
      if (claim.conservativeFloor !== undefined && claim.conservativeFloor > claim.value) {
        throw new Error(`Claim ${productId}:${claim.id} has a floor above its value.`)
      }
      if (claim.evidence.type === 'repository-derivation' && claim.evidence.repo !== product.repo) {
        throw new Error(`Claim ${productId}:${claim.id} evidence must match the product repo.`)
      }
    }
  }

  return { manifest, claims }
}
