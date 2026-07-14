import { execFileSync } from 'node:child_process'

execFileSync(process.execPath, ['bin/ak-docs.js', 'demo', '--text'], {
  stdio: 'inherit',
})
