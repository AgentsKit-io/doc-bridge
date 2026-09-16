import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

/** Selected fields of a JSON file, ordered by name so the hash is a function of values only. */
const fieldProjection = (root, path, fields) => {
  const json = JSON.parse(readFileSync(join(root, path), 'utf8'))
  return JSON.stringify([...fields].sort().map((field) => [field, json[field] ?? null]))
}

/**
 * The facts a README surface was reviewed against, hashed in a stable order.
 *
 * A source is a path, or `{ path, fields }` to cover only part of a JSON file. `package.json`
 * needs the second form: the whole file records every dependency version, so hashing it made a
 * devDependency bump report "this README has not been reviewed since" — which is not true of any
 * bump, and which re-reviewing does not stop from happening on the next one. Hashing the fields
 * the README actually states about the package keeps what the check is for: a changed
 * description, binary, entry point or engine range still expires the review, a bumped lockfile
 * does not.
 *
 * `version` is deliberately not among those fields. The README carries the version only as a live
 * npm badge, and `ak-docs parity` is what holds a stated version to the package. Hashing it here
 * would put every release back on the same treadmill, for a fact the README never spells out.
 */
export const computeSourceHash = (root, sources) => {
  const hash = createHash('sha256')
  const normalized = sources.map((source) => (typeof source === 'string' ? { path: source } : source))
  for (const source of [...normalized].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0))) {
    const content = source.fields ? Buffer.from(fieldProjection(root, source.path, source.fields), 'utf8') : readFileSync(join(root, source.path))
    hash.update(source.path).update('\0').update(content).update('\0')
  }
  return `sha256:${hash.digest('hex')}`
}

const imagesOf = (readme) => [
  ...readme.matchAll(/!\[([^\]]*)\]\(([^)]+)\)/g),
  ...readme.matchAll(/<img\s+[^>]*alt=["']([^"']*)["'][^>]*src=["']([^"']+)["'][^>]*>/g),
].map((match) => ({ alt: match[1], src: match[2] }))

export const auditReadme = (root, config, now = new Date()) => {
  const failures = []
  if (config.schemaVersion !== 1 || config.standardId !== 'agentskit-readme-standard-v1' || config.status !== 'approved') failures.push('README Standard v1 approval metadata is invalid')
  if (!config.approval?.approvedBy || !config.approval?.approvedOn || !config.approval?.record) failures.push('README Standard v1 approval record is incomplete')
  if (!Array.isArray(config.profiles) || config.profiles.length !== 4) failures.push('README Standard v1 must declare all four approved profiles')
  for (const surface of config.surfaces) {
    const path = join(root, surface.path)
    if (!existsSync(path)) { failures.push(`${surface.id}: README is missing`); continue }
    const readme = readFileSync(path, 'utf8')
    for (const [dimension, markers] of Object.entries(surface.dimensions)) for (const marker of markers) if (!readme.includes(marker)) failures.push(`${surface.id}: ${dimension} evidence missing: ${marker}`)
    const profile = config.profiles.find((candidate) => candidate.id === surface.profileId)
    if (!profile) { failures.push(`${surface.id}: profileId is invalid`); continue }
    const images = imagesOf(readme)
    const contentImages = images.filter((image) => !/^https:\/\/img\.shields\.io\//.test(image.src))
    if (images.some((image) => !image.alt.trim())) failures.push(`${surface.id}: every image needs alt text`)
    if (contentImages.length < profile.budgets.images.min || contentImages.length > profile.budgets.images.max) failures.push(`${surface.id}: content image budget is ${profile.budgets.images.min}–${profile.budgets.images.max}, found ${contentImages.length}`)
    const badges = (readme.match(/https:\/\/img\.shields\.io\//g) ?? []).length
    if (badges > profile.budgets.badges.max) failures.push(`${surface.id}: badge budget exceeded`)
    for (const visual of surface.visuals) {
      if (!existsSync(join(root, visual.src))) failures.push(`${surface.id}: visual does not resolve: ${visual.src}`)
      if (!['neutral', 'paired'].includes(visual.darkMode)) failures.push(`${surface.id}: visual dark-mode strategy is invalid: ${visual.src}`)
    }
    for (const command of surface.commands) {
      if (!readme.includes(command.command)) failures.push(`${surface.id}: primary command is missing: ${command.command}`)
      if (!existsSync(join(root, command.test))) failures.push(`${surface.id}: command test is missing: ${command.test}`)
      if (!command.id || !command.testCommand) failures.push(`${surface.id}: command verification metadata is incomplete`)
    }
    for (const example of surface.examples) {
      const marker = `<!-- readme-example:${example.id} -->`
      const start = readme.indexOf(marker)
      const fenceStart = readme.indexOf('\n```', start)
      const bodyStart = readme.indexOf('\n', fenceStart + 4) + 1
      const fenceEnd = readme.indexOf('\n```', bodyStart)
      const embedded = start >= 0 && fenceStart >= 0 && fenceEnd >= 0 ? `${readme.slice(bodyStart, fenceEnd)}\n` : ''
      const fixture = existsSync(join(root, example.fixture)) ? readFileSync(join(root, example.fixture), 'utf8') : ''
      if (!embedded || embedded !== fixture) failures.push(`${surface.id}: example ${example.id} is not synchronized with ${example.fixture}`)
      if (!example.test || !example.testCommand || !existsSync(join(root, example.test))) failures.push(`${surface.id}: example ${example.id} verification metadata is incomplete`)
    }
    const reviewed = new Date(`${surface.freshness.reviewedOn}T00:00:00Z`)
    const due = new Date(`${surface.freshness.reviewDueOn}T23:59:59Z`)
    if (Number.isNaN(reviewed.valueOf()) || due < now) failures.push(`${surface.id}: README review is expired`)
    if (computeSourceHash(root, surface.freshness.sources) !== surface.freshness.sourceHash) failures.push(`${surface.id}: sourceHash is stale`)
  }
  return { ok: failures.length === 0, failures }
}
