import esbuild from 'esbuild'

await esbuild.build({
  entryPoints: ['main.ts'], bundle: true, external: ['obsidian'],
  format: 'cjs', platform: 'node', target: 'es2022', outfile: 'main.js',
})
