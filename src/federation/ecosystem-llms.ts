/**
 * Canonical AgentsKit ecosystem section for llms.txt (and similar machine indexes).
 *
 * All products should render this block with the same heading and line shape so
 * agents can parse the seven-product mesh without per-repo inventiveness.
 */

export type EcosystemLlmsProduct = {
  readonly id: string
  readonly name: string
  readonly role?: string
  readonly promise: string
  readonly maturity?: string
  readonly surfaces: {
    readonly home?: string
    readonly docs?: string
    readonly llms?: string
  }
}

export type FormatEcosystemLlmsBlockOptions = {
  readonly products: readonly EcosystemLlmsProduct[]
  /** When set, marks this product with **(current)**. */
  readonly currentProductId?: string
  /** Heading line without leading hashes — default `AgentsKit ecosystem`. */
  readonly heading?: string
  /**
   * Prefer docs URL when available; otherwise home.
   * Default: home, falling back to docs.
   */
  readonly prefer?: 'home' | 'docs'
}

/**
 * Returns markdown lines for the shared ecosystem block, including a trailing blank line.
 */
export function formatEcosystemLlmsBlock(options: FormatEcosystemLlmsBlockOptions): string[] {
  const heading = options.heading ?? 'AgentsKit ecosystem'
  const prefer = options.prefer ?? 'home'
  const lines: string[] = [`## ${heading}`, '']

  for (const product of options.products) {
    const primary =
      prefer === 'docs'
        ? product.surfaces.docs ?? product.surfaces.home
        : product.surfaces.home ?? product.surfaces.docs
    if (!primary) continue

    const current = product.id === options.currentProductId ? ' **(current)**' : ''
    const role = product.role ? ` Role: \`${product.role}\`.` : ''
    const maturity = product.maturity ? ` Maturity: ${product.maturity}.` : ''
    const machine = product.surfaces.llms ? ` Machine index: ${product.surfaces.llms}` : ''
    lines.push(
      `- [${product.name}](${primary})${current} — ${product.promise}.${role}${maturity}${machine}`,
    )
  }

  lines.push('')
  return lines
}

/** Join the block into a single string ending with a newline. */
export function formatEcosystemLlmsSection(options: FormatEcosystemLlmsBlockOptions): string {
  return `${formatEcosystemLlmsBlock(options).join('\n')}\n`
}
