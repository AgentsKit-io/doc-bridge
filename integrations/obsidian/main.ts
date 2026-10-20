import { App, ItemView, Notice, Plugin, PluginSettingTab, Setting, TFile, WorkspaceLeaf } from 'obsidian'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { extractFindings, parseExportJson, splitCommand, statusText, type Finding } from './src/core'

const execFileAsync = promisify(execFile)
const VIEW = 'doc-bridge-findings'
interface Settings { repositoryRoot: string; command: string; findings: boolean; openGraph: boolean }
const DEFAULTS: Settings = { repositoryRoot: '', command: 'npx ak-docs', findings: true, openGraph: true }

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
    this.registerEvent(this.app.workspace.on('layout-ready', () => this.updateFindings()))
    this.updateFindings()
  }
  onunload(): void { this.app.workspace.detachLeavesOfType(VIEW) }
  async saveSettings(): Promise<void> { await this.saveData(this.settings) }
  async updateFindings(): Promise<void> {
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
    if (this.status) this.status.setText(statusText(found.length))
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
  async refresh(): Promise<void> {
    try {
      if (!this.settings.repositoryRoot) throw new Error('Set the repository root in Doc Bridge settings')
      const command = splitCommand(this.settings.command)
      await execFileAsync(command[0], [...command.slice(1), 'index'], { cwd: this.settings.repositoryRoot, windowsHide: true })
      const args = [...command.slice(1), 'vault', 'export', ...(this.settings.findings ? ['--findings'] : []), '--json']
      const result = await execFileAsync(command[0], args, { cwd: this.settings.repositoryRoot, windowsHide: true, maxBuffer: 10 * 1024 * 1024 })
      const parsed = parseExportJson(result.stdout)
      this.updateFindings()
      new Notice(`Doc Bridge refreshed: ${parsed.notes} notes, ${parsed.findings} findings`)
      if (this.settings.openGraph) await this.showGraph()
    } catch (error) { new Notice(`Doc Bridge: ${String(error).split(/\r?\n/)[0]}`) }
  }
}

class SettingsTab extends PluginSettingTab {
  constructor(app: App, private plugin: DocBridgePlugin) { super(app, plugin) }
  display(): void {
    const { containerEl } = this; containerEl.empty(); containerEl.createEl('h2', { text: 'Doc Bridge' })
    new Setting(containerEl).setName('Repository root').setDesc('Absolute path to the doc-bridge repository.').addText(text => text.setPlaceholder('/path/to/repository').setValue(this.plugin.settings.repositoryRoot).onChange(async value => { this.plugin.settings.repositoryRoot = value; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('ak-docs command').setDesc('Executable and arguments, without shell syntax.').addText(text => text.setValue(this.plugin.settings.command).onChange(async value => { this.plugin.settings.command = value; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Export with findings').addToggle(toggle => toggle.setValue(this.plugin.settings.findings).onChange(async value => { this.plugin.settings.findings = value; await this.plugin.saveSettings() }))
    new Setting(containerEl).setName('Open Graph view after refresh').addToggle(toggle => toggle.setValue(this.plugin.settings.openGraph).onChange(async value => { this.plugin.settings.openGraph = value; await this.plugin.saveSettings() }))
  }
}
