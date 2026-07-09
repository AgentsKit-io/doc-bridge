import type { DoctorReport } from './run-doctor.js'

export type DoctorBadgeMetrics = {
  readonly handoffPct: number
  readonly bridgePct: number
  readonly score: number
  readonly grade: DoctorReport['grade']
  readonly packages: number
}

export const doctorBadgeMetrics = (report: DoctorReport): DoctorBadgeMetrics => {
  const { packages } = report.coverage
  const handoffPct =
    packages.total > 0 ? Math.round((packages.withAgentDoc / packages.total) * 100) : 0
  const bridgePct =
    packages.total > 0 ? Math.round((packages.withHumanDoc / packages.total) * 100) : 0

  return {
    handoffPct,
    bridgePct,
    score: report.score,
    grade: report.grade,
    packages: packages.total,
  }
}

const badgeColor = (pct: number): string => {
  if (pct >= 80) return '2ea44f'
  if (pct >= 50) return 'dbab09'
  return 'cb2431'
}

export const formatDoctorBadgeMarkdown = (metrics: DoctorBadgeMetrics): string => {
  const handoff = `handoff_coverage-${metrics.handoffPct}%25-${badgeColor(metrics.handoffPct)}`
  const bridge = `human_bridge-${metrics.bridgePct}%25-${badgeColor(metrics.bridgePct)}`
  return [
    `![handoff coverage](https://img.shields.io/badge/${handoff}?style=flat-square)`,
    `![human bridge](https://img.shields.io/badge/${bridge}?style=flat-square)`,
    `![doc-bridge score](https://img.shields.io/badge/doc--bridge_score-${metrics.score}%2F100-${badgeColor(metrics.score)}?style=flat-square)`,
  ].join(' ')
}

export const formatDoctorBadgeJson = (metrics: DoctorBadgeMetrics): string =>
  JSON.stringify(
    {
      schemaVersion: 1,
      ...metrics,
      markdown: formatDoctorBadgeMarkdown(metrics),
      updatedAt: new Date().toISOString(),
    },
    null,
    2,
  )