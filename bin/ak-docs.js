#!/usr/bin/env node
import { runCli } from '../dist/cli/program.js'

const code = runCli(process.argv.slice(2))
if (typeof code === 'number') process.exit(code)
if (code) process.exit(await code)
