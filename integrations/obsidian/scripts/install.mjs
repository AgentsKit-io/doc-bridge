import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'

const vault = process.argv[2]
if (!vault) throw new Error('Usage: node scripts/install.mjs <vault-path>')
const source = resolve(import.meta.dirname, '..')
const target = join(resolve(vault), '.obsidian', 'plugins', 'doc-bridge')
await mkdir(target, { recursive: true })
for (const file of ['main.js', 'manifest.json', 'styles.css']) await copyFile(join(source, file), join(target, file))
const pluginsFile = join(resolve(vault), '.obsidian', 'community-plugins.json')
let enabled = []
try { enabled = JSON.parse(await readFile(pluginsFile, 'utf8')) } catch (error) { if (error.code !== 'ENOENT') throw error }
if (!Array.isArray(enabled)) throw new Error('community-plugins.json must contain an array')
if (!enabled.includes('doc-bridge')) enabled.push('doc-bridge')
await writeFile(pluginsFile, `${JSON.stringify(enabled, null, 2)}\n`)
