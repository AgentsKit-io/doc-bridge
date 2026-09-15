import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import type { DocBridgeConfigV1 } from '../config/schema.js'
import { discoverRepository } from '../discovery/repository.js'
import { buildDocBridgeIndex } from '../index-builder/build-index.js'
import { renderLlmsTxt } from '../index-builder/llms-txt.js'
import { toPosix } from '../lib/paths.js'
import type { DocBridgeIndexV1 } from '../schemas/doc-bridge-index.js'
import type { ReconciliationReportV1 } from '../schemas/knowledge.js'
import { parseDiscoverySnapshot, parseDocBridgeIndex, parseReconciliationReport } from '../validate.js'
import { loadWorkflowStepOutput } from '../workflow/engine.js'
import type { TemplateVariables } from './engine.js'
import {
  areaPagesView,
  changeDigestView,
  overlayReviewView,
  ownershipPagesView,
  pageFileName,
  type OverlayReviewInput,
  type RenderedPage,
  type SnapshotForDigest,
} from './data.js'
import { GENERATED_REGION_CLOSE, generatedRegionHash, generatedRegionOpen, trimRegionBlankLines } from './generated.js'
import { renderNamedTemplate, resolveTemplateSource } from './template-source.js'
import { RENDER_TEMPLATES, type RenderTemplateName } from './templates.js'

/**
 * `ak-docs render`: the canonical artifacts, rendered as Markdown a person can read.
 *
 * Rendering never calls an agent and never reads the Registry: its inputs are the index (built
 * in memory from the working tree, or the artifact `--data` names), the workflow's last
 * reconciliation report and snapshot, and an overlay file. Equal inputs, equal bytes.
 */

export type RenderArtifactOptions = {
  readonly root: string
  readonly config: DocBridgeConfigV1
  readonly template: RenderTemplateName
  /** An artifact to render instead of the default source for the template. Relative to `root`. */
  readonly dataPath?: string
}

export type RenderArtifactResult = {
  readonly template: RenderTemplateName
  /** `bundled`, or the project override path. */
  readonly origin: string
  readonly pages: readonly RenderedPage[]
}

/*
 * A template says where its generated region begins and ends with `{{ region.open }}` and
 * `{{ region.close }}`. The hash in the opening marker is over the text between them, which is
 * not known until the template has rendered — so the template prints placeholders, and the
 * markers replace them afterwards. A template that prints neither is wrapped whole.
 */
const OPEN_PLACEHOLDER = '@@doc-bridge:generated-open@@'
const CLOSE_PLACEHOLDER = '@@doc-bridge:generated-close@@'

export const REGION_VARIABLES = { open: OPEN_PLACEHOLDER, close: CLOSE_PLACEHOLDER } as const

const trimRegionBody = trimRegionBlankLines

export const applyGeneratedRegions = (output: string, name: string): string => {
  if (!output.includes(OPEN_PLACEHOLDER)) {
    if (output.includes(CLOSE_PLACEHOLDER)) throw new Error(`template "${name}" prints region.close without region.open`)
    const body = trimRegionBody(output)
    return `${generatedRegionOpen(generatedRegionHash(body))}\n${body}\n${GENERATED_REGION_CLOSE}\n`
  }
  let result = output
  for (;;) {
    const open = result.indexOf(OPEN_PLACEHOLDER)
    if (open === -1) break
    const close = result.indexOf(CLOSE_PLACEHOLDER, open)
    if (close === -1) throw new Error(`template "${name}" prints region.open without a matching region.close`)
    const body = trimRegionBody(result.slice(open + OPEN_PLACEHOLDER.length, close))
    const replacement = `${generatedRegionOpen(generatedRegionHash(body))}\n${body}\n${GENERATED_REGION_CLOSE}`
    result = result.slice(0, open) + replacement + result.slice(close + CLOSE_PLACEHOLDER.length)
  }
  if (result.includes(CLOSE_PLACEHOLDER)) throw new Error(`template "${name}" prints region.close without region.open`)
  return result
}

const renderPage = (name: RenderTemplateName, variables: TemplateVariables, config: DocBridgeConfigV1, root: string): string => {
  const output = renderNamedTemplate(name, { ...variables, region: REGION_VARIABLES }, config, root)
  return RENDER_TEMPLATES[name].generatedRegion ? applyGeneratedRegions(output, name) : output
}

const readJson = (root: string, path: string): unknown => JSON.parse(readFileSync(resolve(root, path), 'utf8')) as unknown

const stateDirOf = (root: string, config: DocBridgeConfigV1): string => resolve(root, config.workflow?.stateDir ?? '.doc-bridge/workflow')

const loadIndex = (options: RenderArtifactOptions): DocBridgeIndexV1 =>
  options.dataPath
    ? parseDocBridgeIndex(readJson(options.root, options.dataPath))
    : buildDocBridgeIndex({ root: options.root, config: options.config, write: false }).index

/** The last reconciliation report the workflow wrote, when there is one. Findings are optional on a page; a missing report is not an error. */
const loadReconciliation = (root: string, config: DocBridgeConfigV1): ReconciliationReportV1 | undefined => {
  try {
    const value = loadWorkflowStepOutput(stateDirOf(root, config), 'reconcile')
    return value ? parseReconciliationReport(value) : undefined
  } catch {
    return undefined
  }
}

/**
 * The snapshot the digest compares against: the one `--data` names, otherwise the last
 * `ak-docs scan` (the workflow's `normalize` output). Rendering does not move that baseline —
 * only a scan does — so the digest can be rendered repeatedly while a change is being reviewed.
 */
const loadPreviousSnapshot = (options: RenderArtifactOptions): SnapshotForDigest => {
  if (options.dataPath) return parseDiscoverySnapshot(readJson(options.root, options.dataPath))
  let value: unknown
  try {
    value = loadWorkflowStepOutput(stateDirOf(options.root, options.config), 'normalize')
  } catch {
    value = undefined
  }
  if (!value) throw new Error('No previous snapshot to compare against. Run `ak-docs scan` to record one, or pass --data <snapshot.json>.')
  return parseDiscoverySnapshot(value)
}

const DEFAULT_OVERLAY_PATH = '.doc-bridge/enrich/overlay.json'

const loadOverlay = (options: RenderArtifactOptions): { readonly overlay: OverlayReviewInput | undefined; readonly source?: string } => {
  const path = options.dataPath ?? (existsSync(resolve(options.root, DEFAULT_OVERLAY_PATH)) ? DEFAULT_OVERLAY_PATH : undefined)
  if (!path) return { overlay: undefined }
  const value = readJson(options.root, path)
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} is not an overlay object.`)
  const pending = (value as { pending?: unknown }).pending
  if (pending !== undefined && !Array.isArray(pending)) throw new Error(`${path}: "pending" must be an array of proposals.`)
  return { overlay: value as OverlayReviewInput, source: toPosix(path) }
}

export const renderArtifact = (options: RenderArtifactOptions): RenderArtifactResult => {
  const { root, config, template } = options
  const origin = resolveTemplateSource(template, config, root).origin
  const page = (path: string, variables: TemplateVariables): RenderedPage => ({ path, content: renderPage(template, variables, config, root) })

  switch (template) {
    case 'llms.txt': {
      const index = loadIndex(options)
      return {
        template,
        origin,
        pages: [{ path: toPosix(config.index?.llmsTxt?.outFile ?? 'llms.txt'), content: renderLlmsTxt(config, index.knowledge, index.project?.name ?? 'project', { root }) }],
      }
    }
    case 'area': {
      const index = loadIndex(options)
      const reconciliation = loadReconciliation(root, config)
      return {
        template,
        origin,
        pages: areaPagesView(index, config, { root, ...(reconciliation ? { reconciliation } : {}) }).map((area) => page(pageFileName(area.path), { area })),
      }
    }
    case 'ownership': {
      const index = loadIndex(options)
      return { template, origin, pages: ownershipPagesView(index, config, { root }).map((owner) => page(pageFileName(owner.id), { owner })) }
    }
    case 'change-digest': {
      const previous = loadPreviousSnapshot(options)
      const current = discoverRepository({ root, config })
      return { template, origin, pages: [page('change-digest.md', { digest: changeDigestView(previous, current) })] }
    }
    case 'overlay-review': {
      const { overlay, source } = loadOverlay(options)
      return { template, origin, pages: [page('overlay-review.md', { overlay: overlayReviewView(overlay, source) })] }
    }
    default:
      throw new Error(`Unknown template "${String(template)}".`)
  }
}

/**
 * Write the pages. A single page goes to `target` itself unless `target` is an existing
 * directory; several pages go under `target` as a directory. Returns what was written, relative
 * to `root`, in page order.
 */
export const writeRenderedPages = (result: RenderArtifactResult, target: string, root: string): string[] => {
  const single = result.pages.length === 1 && !RENDER_TEMPLATES[result.template].multiPage
  // One stat, not exists-then-stat: the answer must describe a single moment on disk.
  const isDirectory = statSync(target, { throwIfNoEntry: false })?.isDirectory() === true
  const written: string[] = []
  for (const page of result.pages) {
    const path = single && !isDirectory ? target : join(target, page.path)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, page.content, 'utf8')
    written.push(toPosix(relative(root, path)))
  }
  return written
}
