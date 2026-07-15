import Link from 'next/link'
import { ArrowRight, Braces, FileText, ShieldCheck } from 'lucide-react'

const basePath = process.env.DOCS_BASE_PATH ?? ''

export default function ForAgentsPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-16 lg:px-8 lg:py-24">
      <p className="font-mono text-xs uppercase tracking-[.2em] text-emerald-700 dark:text-emerald-300">Machine-first entry point</p>
      <h1 className="mt-5 max-w-3xl text-5xl font-semibold tracking-[-.05em] sm:text-6xl">Resolve context before editing code.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-neutral-600 dark:text-neutral-300">Doc Bridge gives an agent the exact source, edit boundary, and verification commands for a module—without treating the entire repository as prompt material.</p>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {[[Braces, 'Resolve', 'ak-docs query ownership <id> --agent'], [FileText, 'Read', 'Follow startHere and readBeforeEditing.'], [ShieldCheck, 'Verify', 'Run the returned checks before handoff.']].map(([Icon, title, copy]) => { const C = Icon as typeof Braces; return <article key={String(title)} className="rounded-2xl border p-6"><C className="size-5 text-emerald-600" /><h2 className="mt-8 text-lg font-semibold">{String(title)}</h2><p className="mt-2 break-words text-sm leading-6 text-neutral-600 dark:text-neutral-300">{String(copy)}</p></article> })}
      </div>
      <div className="mt-10 flex flex-wrap gap-3">
        <Link href="/docs/for-agents" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#111714] px-5 py-3 font-medium text-white dark:bg-white dark:text-black">Read the agent guide <ArrowRight className="size-4" /></Link>
        <a href={`${basePath}/llms.txt`} className="inline-flex min-h-11 items-center rounded-full border px-5 py-3 font-medium">llms.txt</a>
        <a href={`${basePath}/llms-full.txt`} className="inline-flex min-h-11 items-center rounded-full border px-5 py-3 font-medium">Full corpus</a>
      </div>
    </main>
  )
}
