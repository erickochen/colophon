// Reading MAM's header counters. Other userscripts write into those nodes too,
// so every read of one goes through here.

/** The count a counter opens with: "Bonus: 18,544" gives 18544. Anything past
 * the number stays out of the figure. A number carrying a unit ("18.5k") counts
 * as unreadable rather than as 18.5. Null means the text never said. */
export function counterValue(raw: string | null | undefined): number | null {
  const body = (raw ?? '').replace(/^[^:]*:/, '').trim()
  const head = /^\d[\d,]*(\.\d+)?(?![\d,.]|[a-z])/i.exec(body)
  if (!head) return null
  const n = Number(head[0].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}
