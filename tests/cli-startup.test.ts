import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

// Plain runs (agents, CI, scripts) must never evaluate Ink: the rich views live in their own chunk
// and are loaded with a dynamic import only when a person is at a terminal.
describe('CLI startup', () => {
  it('keeps the tsup build split so the Ink views stay out of the CLI entry', () => {
    const config = readFileSync(fileURLToPath(new URL('../tsup.config.ts', import.meta.url)), 'utf8')
    expect(config).toMatch(/splitting:\s*true/)
  })

  it('imports the Ink views only through a dynamic import in program.ts', () => {
    const program = readFileSync(fileURLToPath(new URL('../src/cli/program.ts', import.meta.url)), 'utf8')
    expect(program).not.toMatch(/^import[^\n]*from ['"](?:ink|react|@agentskit\/ink|\.\/ui\/index\.js|\.\/ui\/render\.js|\.\/ui\/app\.js)['"]/m)
    expect(program).toContain("import('./ui/index.js')")
  })
})
