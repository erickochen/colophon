// Ordering a series. MAM ships the sort key with every row: series_info is
// {id: [name, part, weight]} where weight is the first number of the part plus
// -1 for a row with no part at all.
import type { SearchTorrent } from '@/lib/mam-api'

/** MAM's flag for a row that names no part. */
const NO_PART = -1

export interface SeriesEntry {
  name: string
  part: string
  weight: number
}

export type SeriesGroupKind = 'single' | 'range' | 'none'

export interface SeriesGroup {
  key: string
  /** As MAM writes it, so "10" or "1-41". Null where there is no part. */
  part: string | null
  weight: number
  kind: SeriesGroupKind
  rows: SearchTorrent[]
}

/** The entry for one series, out of the several a torrent can belong to. */
export function seriesEntry(t: SearchTorrent, seriesId: number): SeriesEntry | null {
  if (!t.series_info) return null
  try {
    const all = JSON.parse(t.series_info) as Record<string, [string, string, number]>
    const hit = all[String(seriesId)]
    if (!hit) return null
    return { name: String(hit[0] ?? ''), part: String(hit[1] ?? ''), weight: Number(hit[2]) }
  } catch {
    return null
  }
}

function kindOf(part: string, weight: number): SeriesGroupKind {
  if (weight === NO_PART || part === '') return 'none'
  return /[-\s]/.test(part) ? 'range' : 'single'
}

/** Single parts in numeric order, then boxsets, then the unnumbered. Rows that
 * name no entry for this series ride along at the end. */
export function groupBySeries(rows: SearchTorrent[], seriesId: number): SeriesGroup[] {
  const byKey = new Map<string, SeriesGroup>()
  for (const t of rows) {
    const entry = seriesEntry(t, seriesId)
    const part = entry?.part ?? ''
    const weight = entry ? entry.weight : NO_PART
    const kind = kindOf(part, weight)
    const key = kind === 'none' ? 'none' : part
    const group = byKey.get(key)
    if (group) group.rows.push(t)
    else byKey.set(key, { key, part: kind === 'none' ? null : part, weight, kind, rows: [t] })
  }
  const order: Record<SeriesGroupKind, number> = { single: 0, range: 1, none: 2 }
  return [...byKey.values()].sort((a, b) =>
    order[a.kind] - order[b.kind] || a.weight - b.weight || a.key.localeCompare(b.key)
  )
}

export interface SeriesProgress {
  /** Single-numbered parts MAM holds. Boxsets plus unnumbered rows stay out. */
  parts: number
  snatched: number
  highest: number
  /** Numbers below the highest that MAM holds no torrent for, folded to
   * ranges: "3", "7-12". */
  gaps: string[]
  /** How many part numbers those gaps cover. */
  missingCount: number
}

/** A part counts as snatched when any edition of it is snatched. Consecutive
 * missing numbers fold to one range, so a sparse series stays readable. */
export function seriesProgress(groups: SeriesGroup[]): SeriesProgress {
  const singles = groups.filter((g) => g.kind === 'single')
  const present = new Set(singles.map((g) => g.weight))
  const highest = singles.reduce((max, g) => Math.max(max, g.weight), 0)
  const gaps: string[] = []
  let missingCount = 0
  let runStart = 0
  for (let n = 1; n <= highest; n += 1) {
    const missing = n < highest && !present.has(n)
    if (missing) missingCount += 1
    if (missing && runStart === 0) runStart = n
    if (!missing && runStart > 0) {
      gaps.push(runStart === n - 1 ? String(runStart) : `${runStart}-${n - 1}`)
      runStart = 0
    }
  }
  return {
    parts: singles.length,
    snatched: singles.filter((g) => g.rows.some((t) => t.my_snatched === 1)).length,
    highest,
    gaps,
    missingCount,
  }
}
