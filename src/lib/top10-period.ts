// The period a Top 10 list covers. MAM keeps which weeks it has on record in
// top10TorAvailable.php, shaped year -> month -> week -> [start, end, count].

export type Available = Record<string, { all: boolean } & Record<string, { all: boolean } & Record<string, [number, number, number]>>>

export interface Top10Query {
  year: string
  week: string
  metric: string
  mainCat: number[]
  cat: number[]
}

/** The weeks the index holds for one year, in the order a select lists them. */
export function weeksOf(av: Available | null, year: string): string[] {
  const out: string[] = []
  if (!av || year === 'all' || !av[year]) return out
  for (const m of Object.values(av[year])) {
    if (typeof m === 'object' && m) for (const k of Object.keys(m)) if (k !== 'all' && !out.includes(k)) out.push(k)
  }
  return out.sort((a, b) => Number(a) - Number(b))
}

/** A week only becomes a date range through the index, so one the index does not
 * hold reads as the whole year. A year needs no index: its range comes from the
 * number, so a year outside the index still searches. */
export function placed(q: Top10Query, av: Available): Top10Query {
  if (q.year === 'all' || q.week === 'all') return q
  return weeksOf(av, q.year).includes(q.week) ? q : { ...q, week: 'all' }
}
