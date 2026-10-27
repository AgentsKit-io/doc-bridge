import fs from 'node:fs'
for (const d of fs.readdirSync('.ak-loop')) if (d !== 'clean.mjs') fs.rmSync(`.ak-loop/${d}`, { recursive: true, force: true })
fs.rmSync('.doc-bridge', { recursive: true, force: true })
