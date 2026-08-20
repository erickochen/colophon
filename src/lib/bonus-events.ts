import { mamFetch } from './mam-fetch'

/** One row of MAM's bonus log. A gift names the member on the other side, a
 * wedge the torrent it landed on. */
export interface BonusEvent {
  timestamp: number; amount: number; type: string
  tid: number | null; title: string | null
  other_userid: number | null; other_name: string | null
}

// The most rows the endpoint answers with, whichever filters ride along.
export const BONUS_EVENT_CAP = 50

/** The log, narrowed on the server. Both filters run before the cap, so a
 * narrow question reaches further back than a wide one. */
export function fetchBonusEvents(
  opts: { types?: string[]; otherUserId?: string } = {}
): Promise<BonusEvent[] | 'failed'> {
  const parts = opts.otherUserId ? [`other_userid=${opts.otherUserId}`] : []
  for (const type of opts.types ?? []) parts.push(`type[]=${type}`)
  const query = parts.length ? `?${parts.join('&')}` : ''
  return mamFetch(`/json/userBonusHistory.php${query}`, { credentials: 'include' })
    .then((r) => r.json())
    .then((rows: BonusEvent[]) => (Array.isArray(rows) ? rows : 'failed' as const))
    .catch(() => 'failed' as const)
}
