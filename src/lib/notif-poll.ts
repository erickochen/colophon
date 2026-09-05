// The counters in MAM's header come from its shoutbox poll. A browser session
// gets them from that endpoint only, so the badges poll it too.

/** MAM's shoutbox poll. It carries the counters next to any new shouts. */
export const NOTIF_POLL_URL = 'https://cdn.myanonamouse.net/shoutbox/load.php'

/** Past every shout id, so the answer holds the counters and no shouts. */
const BEYOND_NEWEST_SHOUT = 9_999_999_999

/** The counters MAM's header shows. */
export interface NotifCounts {
  pms: number
  topics: number
  tickets: number
  requests: number
}

export const COUNTER_KEYS = ['pms', 'topics', 'tickets', 'requests'] as const

/** The form body MAM's own poll sends. The shoutbox version has to match the
 * server's. Otherwise the answer is a reload notice instead of counters. */
export function notifPollBody(shoutboxVersion: number): URLSearchParams {
  const beyond = String(BEYOND_NEWEST_SHOUT)
  return new URLSearchParams({ loadFrom: beyond, maxID: beyond, minID: beyond, vid: String(shoutboxVersion) })
}

export type NotifPoll = { counts: NotifCounts } | { refused: true } | null

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

/** Counters out of a poll answer. A failure text means the server refuses
 * this page's poll; an answer without counters reads as nothing. */
export function parseNotifPoll(data: unknown): NotifPoll {
  if (data == null || typeof data !== 'object') return null
  const { failure, notifs } = data as { failure?: unknown; notifs?: unknown }
  if (typeof failure === 'string' && failure !== '') return { refused: true }
  if (notifs == null || typeof notifs !== 'object') return null
  const n = notifs as Partial<Record<keyof NotifCounts, unknown>>
  return { counts: { pms: num(n.pms), topics: num(n.topics), tickets: num(n.tickets), requests: num(n.requests) } }
}
