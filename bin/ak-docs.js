#!/usr/bin/env node
import { runCli } from '../dist/cli/program.js'

const argv = process.argv.slice(2)
if (argv[0] === 'studio' && argv[1] !== 'export') {
  try {
    if (argv.includes('--help') || argv.includes('-h')) {
      process.stdout.write('Usage: ak-docs studio [--config <path>] [--findings <file>] [--sample synthetic|doc-bridge|agentskit]\nInstall @agentskit/doc-bridge-studio alongside the engine.\n')
    } else {
      const values = new Map()
      for (let i = 1; i < argv.length; i += 2) {
        if (!['--config', '--findings', '--sample'].includes(argv[i]) || !argv[i + 1] || argv[i + 1].startsWith('-') || values.has(argv[i])) throw new Error('Usage: ak-docs studio [--config <path>] [--findings <file>] [--sample synthetic|doc-bridge|agentskit]')
        values.set(argv[i], argv[i + 1])
      }
      const packageName = '@agentskit/doc-bridge-studio'
      let studio
      try { studio = await import(packageName) }
      catch (error) {
        if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
        throw new Error('Studio is optional. Install @agentskit/doc-bridge-studio alongside @agentskit/doc-bridge.')
      }
      await studio.startStudio({ cwd: process.cwd(), ...(values.has('--config') ? { configPath: values.get('--config') } : {}), ...(values.has('--findings') ? { findingsPath: values.get('--findings') } : {}), ...(values.has('--sample') ? { sample: values.get('--sample') } : {}) })
    }
  } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : 'Studio startup failed'}\n`); process.exitCode = 1 }
} else {
  const code = runCli(argv)
  if (typeof code === 'number') process.exitCode = code
  if (code) process.exitCode = await code
}
