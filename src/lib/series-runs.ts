// Which rows of a result list belong to the same series. Importing nothing
// keeps the module reachable from node --test; series.ts wraps it with the
// parsing plus the name decoding.

/** MAM's flag for a row that names no part. */
export const NO_PART = -1

/** Below this a series is not a run. A heading over one row is noise plus most
 * of a wide search is single titles. */
const RUN_MIN = 2

/** One series a row belongs to: name, part as MAM writes it plus the sort
 * weight, which is the first number of the part. */
export type SeriesTuple = [string, string, number]

/** Every series a row names, keyed by series id. */
export type SeriesMap = Record<string, SeriesTuple>

export interface RunPlan {
  /** The series these rows share, null for titles standing on their own. */
  id: string | null
  /** Positions in the list handed in, in the order they should be drawn. */
  rows: number[]
}

/** Numbered parts first, then boxsets, then whatever names no part. */
function partRank(hit: SeriesTuple | undefined): [number, number] {
  if (!hit) return [2, 0]
  const part = String(hit[1] ?? '')
  const weight = Number(hit[2])
  if (part === '' || weight === NO_PART) return [2, 0]
  return [/[-\s]/.test(part) ? 1 : 0, weight]
}

/** Plans the runs of one result list without disturbing the order it came in:
 * a run takes the place of its first member, so the reader's sort still decides
 * where it sits. A row belongs to one run only, since the same title twice
 * reads as a duplicate. */
export function planRuns(maps: SeriesMap[]): RunPlan[] {
  const seen = new Map<string, number>()
  for (const map of maps) {
    for (const id of Object.keys(map)) seen.set(id, (seen.get(id) ?? 0) + 1)
  }
  // A row naming several series joins the one this list holds the most of, so
  // it lands where there is the most to see. Ties keep the id order.
  const picked = maps.map((map) => {
    const shared = Object.keys(map).filter((id) => (seen.get(id) ?? 0) >= RUN_MIN)
    if (shared.length === 0) return null
    return shared.reduce((best, id) => ((seen.get(id) ?? 0) > (seen.get(best) ?? 0) ? id : best))
  })
  // A series can lose members to a series named before it, so the count that
  // decides is the one left after every row has picked.
  const held = new Map<string, number>()
  for (const id of picked) if (id) held.set(id, (held.get(id) ?? 0) + 1)

  const plans: RunPlan[] = []
  const byId = new Map<string, RunPlan>()
  maps.forEach((_, i) => {
    const id = picked[i]
    if (!id || (held.get(id) ?? 0) < RUN_MIN) {
      // Singles that follow each other stay one stretch, so a gallery keeps
      // filling its rows instead of breaking after every title.
      const last = plans[plans.length - 1]
      if (last && last.id === null) last.rows.push(i)
      else plans.push({ id: null, rows: [i] })
      return
    }
    const plan = byId.get(id)
    if (plan) {
      plan.rows.push(i)
      return
    }
    const fresh: RunPlan = { id, rows: [i] }
    byId.set(id, fresh)
    plans.push(fresh)
  })

  for (const [id, plan] of byId) {
    plan.rows = plan.rows
      .map((i) => ({ i, rank: partRank(maps[i][id]) }))
      .sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.i - b.i)
      .map((x) => x.i)
  }
  return plans
}
