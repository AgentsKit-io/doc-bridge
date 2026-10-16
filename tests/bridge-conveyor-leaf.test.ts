import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// The drawbridge leaf of the bridge-conveyor figure: the build draws its down pose and the page redraws it per frame.
import { leafPose, leafSvg } from '../scripts/figures/bridge-conveyor/leaf.mjs'

const page = readFileSync('apps/docs/public/figures/bridge-conveyor.html', 'utf8')
const data = JSON.parse(page.match(/const DATA = (\{[\s\S]*?\});\n/)![1])
const radians = (degrees: number) => (degrees * Math.PI) / 180

describe('bridge conveyor drawbridge leaf', () => {
  it('draws finite shapes at every angle', () => {
    for (const degrees of [0, 12, 30, 45, 65]) {
      const svg = leafSvg(data.leaf.spec, radians(degrees), data.P, 'back', 3) + leafSvg(data.leaf.spec, radians(degrees), data.P, 'front', 3)
      expect(svg).not.toMatch(/NaN|Infinity/)
      expect(svg).toContain('iso-solid')
    }
  })

  it('turns about the hinge in the x-z plane: the free end rises, the hinge point stays', () => {
    const { x, z } = data.leaf.spec.hinge
    const pose = leafPose(data.leaf.spec, radians(65), data.P)
    expect(pose.place([x, 3, z])).toEqual([x, 3, z])
    const [px, py, pz] = pose.place([data.leaf.x1, 3, z])
    expect(py).toBe(3)
    expect(pz).toBeGreaterThan(z + 0.8 * (data.leaf.x1 - x))
    expect(px).toBeLessThan(x + 0.5 * (data.leaf.x1 - x))
  })

  it('shows the amber bands on the end face only once the leaf is up', () => {
    const bands = (degrees: number) => leafSvg(data.leaf.spec, radians(degrees), data.P, 'back', 0).match(/<g data-part="leaf-hazard">(.*?)<\/g>/)![1]
    // Down, only the top bands are in view; raised, the end face joins them.
    const down = (bands(0).match(/M/g) ?? []).length
    const up = (bands(65).match(/M/g) ?? []).length
    expect(up).toBeGreaterThan(down)
  })

  it('starts the page with the leaf down, no amber and no card on it', () => {
    expect(page).toContain('data-part="leaf-back"')
    expect(page).toContain('data-part="leaf-hazard" style="opacity:0"')
    expect(page).not.toMatch(/gate-hazard|data-part="gate"|gate\.panel/)
    // A held card plus the leaf fits between two cards, so the leaf is clear whenever it is raised.
    const { stop, half, pitch } = data.belt
    expect(stop + half).toBeLessThan(data.leaf.x0)
    expect(stop + pitch - half).toBeGreaterThan(data.leaf.x1)
  })

  it('inlines a script that parses', () => {
    const script = page.match(/<script type="module">([\s\S]*)<\/script>/)![1]
    expect(() => new Function(script)).not.toThrow()
  })
})
