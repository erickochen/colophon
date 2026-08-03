// Live unread count for the sidebar. MAM serves its header counters empty
// and fills them from a poll, so polling is the only way to show one.
import { useEffect, useState } from 'react'
import { fetchUnreadCount } from '@/lib/extract/messages'

/** How often the badge refreshes. MAM's own header polls every second. */
const POLL_MS = 60_000

/** Last polled count, kept for the next page. Serving the mailbox marks the
 * delivered messages read, so the mailbox page reads this instead of asking. */
const PM_SNAPSHOT_KEY = 'colophon:pm-snapshot'

/** Oldest snapshot the mailbox page still accepts. */
const PM_SNAPSHOT_TTL_MS = 5 * 60_000

interface PmSnapshot {
  pms: number
  at: number
}

export function readPmSnapshot(): number | null {
  try {
    const raw = sessionStorage.getItem(PM_SNAPSHOT_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<PmSnapshot>
    if (typeof parsed.pms !== 'number' || typeof parsed.at !== 'number') return null
    if (Date.now() - parsed.at > PM_SNAPSHOT_TTL_MS) return null
    return parsed.pms
  } catch {
    return null
  }
}

export function clearPmSnapshot(): void {
  try {
    sessionStorage.removeItem(PM_SNAPSHOT_KEY)
  } catch {
    /* nothing stored */
  }
}

function writePmSnapshot(pms: number): void {
  try {
    sessionStorage.setItem(PM_SNAPSHOT_KEY, JSON.stringify({ pms, at: Date.now() } satisfies PmSnapshot))
  } catch {
    /* private mode: the badge still works on this page */
  }
}

/** Unread private messages, polled while the page is visible. */
export function usePmCount(initial: number): number {
  const [count, setCount] = useState(initial)
  useEffect(() => {
    let alive = true
    const tick = async () => {
      if (document.hidden) return
      const n = await fetchUnreadCount()
      if (!alive || n == null) return
      setCount(n)
      writePmSnapshot(n)
    }
    void tick()
    const timer = window.setInterval(() => void tick(), POLL_MS)
    const onVisible = () => {
      if (!document.hidden) void tick()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])
  return count
}
