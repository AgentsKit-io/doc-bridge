import { App, FileSystemAdapter, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian'
import { execFile } from 'node:child_process'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'
import { buildGraphQuery, childPath, customStatusText, extractFindings, GRAPH_MAX_FILES, mergeGraphJson, parseCustomJson, parseExportJson, splitCommand, staleToFindings, statusText, type Finding, type Source, type StaleNote } from './src/core'

const execFileAsync = promisify(execFile)
const VIEW = 'doc-bridge-findings'
interface Settings { source: Source; repositoryRoot: string; command: string; customCommand: string; customCwd: string; extraPath: string; findings: boolean; openGraph: boolean }
const DEFAULTS: Settings = { source: 'vault', repositoryRoot: '', command: 'npx ak-docs', customCommand: 'node scripts/refresh-brain.mjs --json', customCwd: '', extraPath: '/opt/homebrew/bin:/usr/local/bin', findings: true, openGraph: true }

export class FindingsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private plugin: DocBridgePlugin) { super(leaf) }
  getViewType(): string { return VIEW }
  getDisplayText(): string { return 'Doc Bridge findings' }
  getIcon(): string { return 'alert-triangle' }
  async onOpen(): Promise<void> { this.render() }
  render(): void {
    const root = this.contentEl; root.empty(); root.createEl('h3', { text: 'Findings' })
    const findings = this.plugin.findings
    if (!findings.length) { root.createEl('p', { text: 'Docs and code agree.' }); return }
    for (const finding of findings) {
      const link = root.createEl('button', { text: finding.title, cls: 'doc-bridge-finding-title' })
      link.onclick = () => { const file = this.app.vault.getAbstractFileByPath(finding.path); if (file instanceof TFile) void this.app.workspace.getLeaf(false).openFile(file) }
      for (const item of finding.items) root.createEl('div', { text: item, cls: 'doc-bridge-finding-item' })
    }
  }
}

export default class DocBridgePlugin extends Plugin {
  settings: Settings = DEFAULTS
  findings: Finding[] = []
  stale?: StaleNote[]
  status?: HTMLElement
  async onload(): Promise<void> {
    this.settings = { ...DEFAULTS, ...await this.loadData() }
    this.registerView(VIEW, leaf => new FindingsView(leaf, this))
    this.status = this.addStatusBarItem()
    this.addSettingTab(new SettingsTab(this.app, this))
    this.addCommand({ id: 'refresh', name: 'Refresh from doc-bridge', callback: () => void this.refresh() })
    this.addCommand({ id: 'findings', name: 'Open findings', callback: () => void this.openFindings() })
    this.addCommand({ id: 'graph', name: 'Show graph', callback: () => void this.showGraph() })
    this.addRibbonIcon('refresh-cw', 'Refresh from doc-bridge', () => void this.refresh())
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.updateFindings()))
    this.registerEvent(this.app.metadataCache.on('changed', () => this.updateFindings()))
    this.app.workspace.onLayoutReady(() => void this.updateFindings())
    this.updateFindings()
  }
  onunload(): void { this.app.workspace.detachLeavesOfType(VIEW) }
  async saveSettings(): Promise<void> { await this.saveData(this.settings) }
  async updateFindings(): Promise<void> {
    if (this.settings.source === 'custom') { this.findings = staleToFindings(this.stale ?? []); this.render(); return }
    const found: Finding[] = []
    for (const file of this.app.vault.getMarkdownFiles()) {
      const cache = this.app.metadataCache.getFileCache(file)
      if (!cache) continue
      const tags = [...(cache.frontmatter?.tags ?? []), ...(cache.tags ?? []).map(t => t.tag)].filter((tag): tag is string => typeof tag === 'string')
      if (!tags.some(tag => tag.startsWith('drift/'))) continue
      const content = await this.app.vault.cachedRead(file)
      const note = extractFindings(file.path, String(cache.frontmatter?.title ?? file.basename), tags, content)
      if (note) found.push(note)
    }
    this.findings = found
    this.render()
  }
  private render(): void {
    if (this.status) this.status.setText(this.settings.source === 'custom' ? customStatusText(this.stale?.length) : statusText(this.findings.length))
    const view = this.app.workspace.getLeavesOfType(VIEW)[0]?.view
    if (view instanceof FindingsView) view.render()
    this.decorateExplorer()
  }
  private decorateExplorer(): void {
    const drifted = new Set(this.findings.map(item => item.path))
    document.querySelectorAll<HTMLElement>('.nav-file-title[data-path]').forEach(el => {
      el.classList.toggle('doc-bridge-drift', drifted.has(el.dataset.path ?? ''))
    })
  }
  async openFindings(): Promise<void> { const leaf = this.app.workspace.getRightLeaf(false); if (leaf) { await leaf.setViewState({ type: VIEW, active: true }); this.app.workspace.revealLeaf(leaf) } }
  async showGraph(): Promise<void> { const leaf = this.app.workspace.getLeaf('tab'); await leaf.setViewState({ type: 'graph', active: true }) }
  private childEnv(): NodeJS.ProcessEnv { return { ...process.env, PATH: childPath(process.env.PATH, this.settings.extraPath, process.platform === 'win32' ? ';' : ':') } }
  private vaultBase(): string {
    const adapter = this.app.vault.adapter
    if (!(adapter instanceof FileSystemAdapter)) throw new Error('Custom command mode needs a desktop vault')
    return adapter.getBasePath()
  }
  async refresh(): Promise<void> { await (this.settings.source === 'custom' ? this.refreshCustom() : this.refreshVault()) }
  /** Runs the custom command and shows drift; it never edits notes, only its own graph colour group. */
  private async refreshCustom(): Promise<void> {
    try {
      const command = splitCommand(this.settings.customCommand)
      const cwd = this.settings.customCwd.trim() || this.vaultBase()
      let stdout: string
      try { stdout = (await execFileAsync(command[0], command.slice(1), { cwd, env: this.childEnv(), windowsHide: true, maxBuffer: 10 * 1024 * 1024 })).stdout }
      catch (error) {
        // A failing command may still explain itself with `{ ok: false, error }` on stdout.
        const out = (error as { stdout?: unknown }).stdout
        if (typeof out !== 'string' || !out.trim()) throw error
        stdout = out
      }
      const parsed = parseCustomJson(stdout)
      this.stale = parsed.stale
      await this.updateFindings()
      const truncated = await this.writeGraphGroup(parsed.stale.map(note => note.file))
      new Notice(`Doc Bridge checked: ${parsed.notes} notes, ${parsed.stale.length} stale`)
      if (truncated) new Notice(`Doc Bridge: the graph colours only the first ${GRAPH_MAX_FILES} of ${parsed.stale.length} stale notes`)
      if (this.settings.openGraph) await this.showGraph()
    } catch (error) { new Notice(`Doc Bridge: ${String(error).split(/\r?\n/)[0]}`) }
  }
  /** Returns true when the stale list was capped. */
  private async writeGraphGroup(files: string[]): Promise<boolean> {
    const file = join(this.vaultBase(), this.app.vault.configDir, 'graph.json')
    let existing: string | undefined
    try { existing = await readFile(file, 'utf8') } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
    const next = mergeGraphJson(existing, files)
    if (next !== undefined && next !== existing) {
      await mkdir(dirname(file), { recursive: true })
      const temp = `${file}.doc-bridge.tmp`
      await writeFile(temp, next, 'utf8')
      await rename(temp, file)
      await this.reopenGraphViews()
    }
    return buildGraphQuery(files).truncated
  }
  /** The graph view only reads graph.json when it opens, so reopen any that are showing. */
  private async reopenGraphViews(): Promise<void> {
    for (const leaf of this.app.workspace.getLeavesOfType('graph')) {
      const state = leaf.getViewState()
      await leaf.setViewState({ type: 'empty' })
      await leaf.setViewState(state)
    }
  }
  private async refreshVault(): Promise<void> {
    try {
      if (!this.settings.repositoryRoot) throw new Error('Set the repository root in Doc Bridge settings')
      const command = splitCommand(this.settings.command)
      const env = this.childEnv()
      // Only the vault export: it discovers the repository itself, and `ak-docs index` deliberately fails
      // while the publication gate blocks drift, which is exactly when the graph must show it.
      const args = [...command.slice(1), 'vault', 'export', ...(this.settings.findings ? ['--findings'] : []), '--json']
      const result = await execFileAsync(command[0], args, { cwd: this.settings.repositoryRoot, env, windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
      const parsed = parseExportJson(result.stdout)
      await this.updateFindings()
      new Notice(`Doc Bridge refreshed: ${parsed.notes} notes, ${parsed.findings} findings`)
      if (this.settings.openGraph) await this.showGraph()
    } catch (error) { new Notice(`Doc Bridge: ${String(error).split(/\r?\n/)[0]}`) }
  }
}

class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: DocBridgePlugin) { super(app, plugin) }
  display(): void {
    const { containerEl } = this; containerEl.empty(); containerEl.createEl('h2', { text: 'Doc Bridge' })
    new Setting(containerEl).setName('Source').setDesc('doc-bridge vault exports a generated vault; custom command only reports stale notes in a hand-written vault and never edits notes.').addDropdown(drop => drop.addOption('vault', 'doc-bridge vault').addOption('custom', 'custom command').setValue(this.plugin.settings.source).onChange(async value => { this.plugin.settings.source = value === 'custom' ? 'custom' : 'vault'; await this.plugin.saveSettings(); void this.plugin.updateFindings(); this.display() }))
    if (this.plugin.settings.source === 'custom') {
      new Setting(containerEl).setName('Command').setDesc('Executable and arguments, without shell syntax. Prints { ok, notes, findings, stale: [{ file, paths, repo?, recorded?, current? }] } as JSON.').addText(text => text.setValue(this.plugin.settings.customCommand).onChange(async value => { this.plugin.settings.customCommand = value; await this.plugin.saveSettings() }))
      new Setting(containerEl).setName('Working directory').setDesc('Defaults to the vault root when empty.').addText(text => text.setPlaceholder('vault root').setValue(this.plugin.settings.customCwd).onChange(async value => { this.plugin.settings.customCwd = value; await this.plugin.saveSettings() }))
    } else {
      new Setting(containerEl).setName('Repository root').setDesc('Absolute path to the doc-bridge repository.').addText(text => text.setPlaceholder('/path/to/repository').setValue(this.plugin.settings.repositoryRoot).onChange(async value => { this.plugin.settings.repositoryRoot = value; await this.plugin.saveSettings() }))
      new Setting(containerEl).setName('ak-docs command').setDesc('Executable and arguments, without shell syntax.').addText(text => text.setValue(this.plugin.settings.command).onChange(async value => { this.plugin.settings.command = value; await this.plugin.saveSettings() }))
    }
    new Setting(containerEl).setName('Extra PATH').setDesc('Folders searched first for node and npx; apps opened from the Dock do not see your shell PATH.').addText(text => text.setValue(this.plugin.settings.extraPath).onChange(async value => { this.plugin.settings.extraPath = value; await this.plugin.saveSettings() }))
    if (this.plugin.settings.source === 'vault') new Setting(containerEl).setName('Export with findings').addToggle(toggle => toggle.setValue(this.plugin.settings.findings).onChange(async value => { this.plugin.settings.findings = value; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Open Graph view after refresh').addToggle(toggle => toggle.setValue(this.plugin.settings.openGraph).onChange(async value => { this.plugin.settings.openGraph = value; await this.plugin.saveSettings() }))
  }
}
