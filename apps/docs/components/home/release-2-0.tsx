import Link from 'next/link'
import { ArrowRight, Bot, GitBranch, ShieldCheck, Zap } from 'lucide-react'

const capabilities = [
  [Zap, 'Deterministic documentation index', 'Known questions resolve locally, and every answer keeps its source.'],
  [ShieldCheck, 'Drift findings with region fixes', 'Stale documentation regions are reported with the fix that brings them back in line.'],
  [GitBranch, 'Advisory PR comments', 'Findings are posted on pull requests as advice for reviewers.'],
  [Bot, 'MCP server for agents', 'Agents query the same repository-backed index through the MCP server.'],
] as const

const installCommand = 'npm i -D @agentskit/doc-bridge'
const firstCommands = [
  'npx ak-docs init',
  'npx ak-docs index',
  'npx ak-docs query package example --agent',
] as const

export function Release2Section() {
  return (
    <section id="doc-bridge-2-0" className="bridge-release" aria-labelledby="release-2-0-title">
      <div className="bridge-release-inner">
        <div className="bridge-section-heading">
          <p className="bridge-eyebrow">DOC BRIDGE 2.0</p>
          <h2 id="release-2-0-title">A deterministic index, drift you can see, and an MCP server for agents.</h2>
          <p>Doc Bridge 2.0 turns the docs you already have into an index that people review and agents query. The deterministic layer needs no API key.</p>
        </div>
        <div className="bridge-release-grid">
          <ul className="bridge-release-list">
            {capabilities.map(([Icon, title, copy]) => (
              <li key={title}>
                <Icon aria-hidden className="bridge-release-icon" />
                <div>
                  <h3>{title}</h3>
                  <p>{copy}</p>
                </div>
              </li>
            ))}
          </ul>
          <div className="bridge-release-start">
            <p className="bridge-eyebrow">INSTALL AND FIRST COMMANDS</p>
            <pre className="bridge-release-code" tabIndex={0} aria-label="Install and first commands"><code>
              <span className="bridge-release-command"><span aria-hidden>$ </span>{installCommand}</span>
              {firstCommands.map((command) => (
                <span className="bridge-release-command" key={command}><span aria-hidden>$ </span>{command}</span>
              ))}
            </code></pre>
            <div className="bridge-release-links">
              <Link href="/docs/getting-started" prefetch={false} className="bridge-text-link">Read the getting-started guide <ArrowRight aria-hidden className="size-4" /></Link>
              <Link href="/docs/spec/config-v1" prefetch={false} className="bridge-text-link">Configuration spec <ArrowRight aria-hidden className="size-4" /></Link>
              <Link href="/for-agents" prefetch={false} className="bridge-text-link">Agent surfaces <ArrowRight aria-hidden className="size-4" /></Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
