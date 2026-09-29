import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { parseCanonicalEcosystemContract } from '../src/conformance/ecosystem-contract.js'

type Product = { id: string; navigation: { showInBar: boolean; order?: number; next: string[] } }
type Property = { id: string }
type Manifest = { products: Product[]; properties?: Property[]; [key: string]: unknown }
type Claims = { products: Array<{ productId: string }>; [key: string]: unknown }

const load = (): { manifest: Manifest; claims: Claims } => ({
  manifest: JSON.parse(readFileSync(join(import.meta.dirname, '..', 'ecosystem.json'), 'utf8')) as Manifest,
  claims: JSON.parse(readFileSync(join(import.meta.dirname, '..', 'ecosystem-claims.json'), 'utf8')) as Claims,
})

/** Remove a product from the manifest, its claims, every `next` list and the legacy shim. */
const without = (manifest: Manifest, claims: Claims, id: string): void => {
  manifest.products = manifest.products.filter((product) => product.id !== id)
  for (const product of manifest.products) product.navigation.next = product.navigation.next.filter((next) => next !== id)
  if (manifest.properties) manifest.properties = manifest.properties.filter((property) => property.id !== id)
  claims.products = claims.products.filter((product) => product.productId !== id)
}

describe('canonical ecosystem contract membership comes from the manifest', () => {
  it('accepts the committed canonical snapshot, Harness included', () => {
    const { manifest, claims } = load()
    const contract = parseCanonicalEcosystemContract(manifest, claims)
    expect(contract.manifest.products.map((product) => product.id)).toContain('harness')
  })

  it('does not require a Playbook record, hidden or shown', () => {
    const { manifest, claims } = load()
    without(manifest, claims, 'playbook')
    expect(() => parseCanonicalEcosystemContract(manifest, claims)).not.toThrow()
  })

  it('accepts a manifest without the deprecated properties shim', () => {
    const { manifest, claims } = load()
    delete manifest.properties
    expect(() => parseCanonicalEcosystemContract(manifest, claims)).not.toThrow()
  })

  it('accepts a shim that projects any subset of products, in any size', () => {
    const { manifest, claims } = load()
    const harness = manifest.products.find((product) => product.id === 'harness') as unknown as {
      id: string; name: string; shortName: string; surfaces: { home: string; llms?: string; stats?: string }
      repo: string | null; promise: string; kind: string; accent: string
    }
    manifest.properties = [{
      id: harness.id,
      name: harness.name,
      barLabel: harness.shortName,
      domain: new URL(harness.surfaces.home).host,
      url: harness.surfaces.home,
      repo: harness.repo,
      tagline: harness.promise,
      kind: harness.kind,
      accent: harness.accent,
      ...(harness.surfaces.llms ? { llms: harness.surfaces.llms } : {}),
      ...(harness.surfaces.stats ? { stats: harness.surfaces.stats } : {}),
    } as Property]
    expect(() => parseCanonicalEcosystemContract(manifest, claims)).not.toThrow()
  })

  it('rejects a shim entry that names an unknown or duplicated product', () => {
    const { manifest, claims } = load()
    const [first] = manifest.properties ?? []
    if (!first) throw new Error('Canonical snapshot has no properties shim to mutate')
    manifest.properties = [{ ...first, id: 'not-a-product' }]
    expect(() => parseCanonicalEcosystemContract(manifest, claims)).toThrow(/not-a-product/)

    const fresh = load()
    const [again] = fresh.manifest.properties ?? []
    if (!again) throw new Error('Canonical snapshot has no properties shim to mutate')
    fresh.manifest.properties = [again, again]
    expect(() => parseCanonicalEcosystemContract(fresh.manifest, fresh.claims)).toThrow(/more than once/)
  })

  it('still requires claims for every manifest product', () => {
    const { manifest, claims } = load()
    claims.products = claims.products.filter((product) => product.productId !== 'harness')
    expect(() => parseCanonicalEcosystemContract(manifest, claims)).toThrow(/every manifest product/)
  })
})
