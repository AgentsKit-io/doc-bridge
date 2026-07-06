#!/usr/bin/env node
import { runCli } from '../dist/cli/program.js'

const code = runCli(process.argv.slice(2))
process.exit(code)