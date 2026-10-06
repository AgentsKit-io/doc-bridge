#!/usr/bin/env node
// Benchmark isolated copies; never overwrite the caller's index. Build first.
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, relative } from 'node:path'
import { spawnSync } from 'node:child_process'
import { performance } from 'node:perf_hooks'
const root = resolve(process.argv[2] ?? '.')
const cli = resolve('bin/ak-docs.js')
const files = spawnSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' })
if (files.status !== 0) throw new Error('Benchmark requires a local Git source inventory')
const work = mkdtempSync(join(tmpdir(), 'doc-bridge-io-bench-'))
const source = join(work, 'source')
const samples = []
const median = values => [...values].sort((a,b)=>a-b)[Math.floor(values.length / 2)]
try {
  mkdirSync(source)
  for (const file of files.stdout.split('\0').filter(Boolean)) {
    if (file.startsWith('.doc-bridge/')) continue
    const from = join(root, file)
    if (!existsSync(from) || !statSync(from).isFile()) continue
    mkdirSync(join(source, file, '..'), { recursive: true })
    cpSync(from, join(source, file))
  }
  // Same ignore semantics without touching the source repository.
  for (const args of [['init','-q'], ['add','.']]) {
    if (spawnSync('git', args, {cwd:source}).status !== 0) throw new Error('Inventory setup failed')
  }
  for (const mode of ['cold', 'warm']) {
    for (let run = 0; run < 5; run++) {
      if (mode === 'cold') rmSync(join(source, '.doc-bridge'), {recursive:true,force:true})
      const started = performance.now()
      const measured = spawnSync('/usr/bin/time', process.platform === 'darwin' ? ['-l',process.execPath,cli,'index'] : ['-v',process.execPath,cli,'index'], {cwd:source,encoding:'utf8',maxBuffer:16*1024*1024})
      if (measured.status !== 0) throw new Error(`Index failed: ${measured.stderr.slice(0,2000)}`)
      const rss = process.platform === 'darwin' ? /([0-9]+)\s+maximum resident set size/.exec(measured.stderr) : /Maximum resident set size \(kbytes\):\s*([0-9]+)/.exec(measured.stderr)
      samples.push({mode,run:run+1,wallMs:performance.now()-started,peakRssBytes:Number(rss?.[1])*(process.platform === 'darwin'?1:1024)})
    }
  }
  console.log(JSON.stringify({method:'isolated Git-visible copy; five fresh-process runs per mode; cold removes artifacts, warm retains previous index; OS page cache is not flushed; no prior discovery snapshot is supplied by index',source:relative(process.cwd(),root)||'.',samples,medians:['cold','warm'].map(mode=>({mode,wallMs:median(samples.filter(s=>s.mode===mode).map(s=>s.wallMs)),peakRssBytes:median(samples.filter(s=>s.mode===mode).map(s=>s.peakRssBytes))})),ioCounts:'not instrumented; CLI currently offers no physical I/O counters'},null,2))
} finally { rmSync(work,{recursive:true,force:true}) }
