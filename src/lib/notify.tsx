// Live notification counts for the sidebar. MAM serves its header counters
// empty and fills them from a poll, so polling is the only way to show them.
import { useEffect, useState } from 'react'
import { pushCounters } from '@/lib/bonus'
import { requestsUrl } from '@/lib/mam-api'
import { readFeature, subscribeSettings } from '@/lib/settings'
import { toast } from '@/components/ui/toast'
import { mamFetch } from '@/lib/mam-fetch'

/** How often the badges refresh. MAM's own header polls every second. */
const POLL_MS = 60_000

/** The counters MAM's header shows, from /jsonLoad.php?notif. */
export interface NotifCounts {
  pms: number
  topics: number
  tickets: number
  requests: number
}

const COUNTER_KEYS = ['pms', 'topics', 'tickets', 'requests'] as const

/** Last polled counts, kept for the next page. They seed the arrival baseline,
 * and the mailbox needs the PM count: serving it marks the messages read. */
const SNAPSHOT_KEY = 'colophon:pm-snapshot'

/** Oldest snapshot the mailbox page still accepts. */
const PM_SNAPSHOT_TTL_MS = 5 * 60_000

interface NotifSnapshot extends NotifCounts {
  at: number
}

function readSnapshot(): NotifSnapshot | null {
  try {
    const raw = sessionStorage.getItem(SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NotifSnapshot>
    if (typeof parsed.at !== 'number' || COUNTER_KEYS.some((k) => typeof parsed[k] !== 'number')) return null
    return parsed as NotifSnapshot
  } catch {
    return null
  }
}

export function readPmSnapshot(): number | null {
  const snap = readSnapshot()
  if (!snap || Date.now() - snap.at > PM_SNAPSHOT_TTL_MS) return null
  return snap.pms
}

export function clearPmSnapshot(): void {
  try {
    sessionStorage.removeItem(SNAPSHOT_KEY)
  } catch {
    /* nothing stored */
  }
}

function writeSnapshot(counts: NotifCounts): void {
  try {
    sessionStorage.setItem(SNAPSHOT_KEY, JSON.stringify({ ...counts, at: Date.now() } satisfies NotifSnapshot))
  } catch {
    /* private mode: the badges still work on this page */
  }
}

const num = (v: unknown): number => (typeof v === 'number' ? v : 0)

const figure = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Counts from the endpoint MAM's own header polls. The pages behind the
 * counters drop them from the DOM, so this endpoint is the only source. The
 * same answer carries the points plus wedge balances, which go to the counter
 * store on the way past: they are figures there rather than header text. */
export async function fetchNotifCounts(): Promise<NotifCounts | null> {
  try {
    const res = await mamFetch('/jsonLoad.php?notif', { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = (await res.json()) as {
      notifs?: Partial<Record<keyof NotifCounts, unknown>>
      seedbonus?: unknown
      wedges?: unknown
    }
    pushCounters({ bonus: figure(data.seedbonus), wedges: figure(data.wedges) })
    if (!data.notifs) return null
    return {
      pms: num(data.notifs.pms),
      topics: num(data.notifs.topics),
      tickets: num(data.notifs.tickets),
      requests: num(data.notifs.requests),
    }
  } catch {
    return null
  }
}

/** What each counter means and where it leads. */
export const NOTIF_TARGETS: Record<keyof NotifCounts, { href: string; label: string; describe: (n: number) => string }> = {
  pms: {
    href: '/messages.php?action=viewmailbox',
    label: 'Open mailbox',
    describe: (n) => (n === 1 ? 'New private message' : `${n} new private messages`),
  },
  topics: {
    href: '/forums/subscriptions.php/newPosts',
    label: 'View topics',
    describe: (n) => (n === 1 ? 'New posts on a watched topic' : `New posts on ${n} watched topics`),
  },
  tickets: {
    href: '/ticket.php/myTickets',
    label: 'View tickets',
    describe: (n) => (n === 1 ? 'A ticket got an update' : `${n} tickets got updates`),
  },
  requests: {
    // The count covers requests with something new on them, which is what
    // MAM's own "Outstanding Notifications" filter lists.
    href: requestsUrl({ filled: 'either', requester: 'notif' }),
    label: 'View requests',
    describe: (n) => (n === 1 ? 'A request you follow was updated' : `${n} requests you follow were updated`),
  },
}

/** Toasts added while mount effects are still flushing never reach the
 * toaster, so announcements wait a beat. */
function announceArrivals(prev: NotifCounts, next: NotifCounts): void {
  if (!readFeature('notifToasts')) return
  window.setTimeout(() => {
    for (const key of COUNTER_KEYS) {
      if (next[key] <= prev[key]) continue
      const arrival = NOTIF_TARGETS[key]
      toast(arrival.describe(next[key]), {
        description: (
          <a href={arrival.href} className="font-medium text-brand hover:underline">
            {arrival.label}
          </a>
        ),
      })
    }
  }, 0)
}

/** Unread PM prefix on the tab title, mail style. Only the prefix this module
 * wrote gets stripped, so a page title of its own shape stays untouched. */
let appliedTitlePrefix = ''
// Last polled PM count, so a settings flip can redraw the title right away.
let lastPms = 0

function applyTitleBadge(pms: number): void {
  const current = document.title
  const bare =
    appliedTitlePrefix && current.startsWith(appliedTitlePrefix)
      ? current.slice(appliedTitlePrefix.length)
      : current
  appliedTitlePrefix = pms > 0 && readFeature('notifTitle') ? `(${pms}) ` : ''
  const next = appliedTitlePrefix + bare
  if (current !== next) document.title = next
}

/** Header counters, polled while the page is visible. A count rising against
 * the parked baseline gets a toast, so arrivals are announced even when the
 * badge sits out of view. */
export function useNotifCounts(initialPms: number): NotifCounts {
  const [counts, setCounts] = useState<NotifCounts>({ pms: initialPms, topics: 0, tickets: 0, requests: 0 })
  useEffect(() => {
    let alive = true
    // Baseline from the previous page, so a PM landing between navigations is
    // still announced. Absent on a fresh session: badges only.
    let prev: NotifCounts | null = readSnapshot()
    const tick = async () => {
      if (document.hidden) return
      const next = await fetchNotifCounts()
      if (!alive || next == null) return
      if (prev) announceArrivals(prev, next)
      prev = next
      setCounts(next)
      writeSnapshot(next)
      lastPms = next.pms
      applyTitleBadge(next.pms)
    }
    void tick()
    const timer = window.setInterval(() => void tick(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    // Flipping the title switch redraws at once instead of at the next poll.
    const unsubscribe = subscribeSettings(() => applyTitleBadge(lastPms))
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      unsubscribe()
    }
  }, [])
  return counts
}
