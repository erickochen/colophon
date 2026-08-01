// Own VIP expiration is only printed on the profile page, so fetch and parse
// it from there. One fetch per tab session; the outcome lands in sessionStorage.

import { useEffect, useState } from 'react'

const CACHE_PREFIX = 'muisstil:vip-until:'

/** undefined = never fetched this session, null = fetched and no VIP row. */
function readCache(uid: number): string | null | undefined {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + uid)
    if (raw == null) return undefined
    return (JSON.parse(raw) as { date: string | null }).date
  } catch {
    return undefined
  }
}

function writeCache(uid: number, date: string | null) {
  try {
    sessionStorage.setItem(CACHE_PREFIX + uid, JSON.stringify({ date }))
  } catch {
    // storage may be unavailable
  }
}

/** "VIP expiration" row on /u/<uid>; null when the account has none. */
export async function fetchVipUntil(uid: number): Promise<string | null> {
  const res = await fetch(`/u/${uid}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`profile failed: ${res.status}`)
  const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
  for (const td of doc.querySelectorAll('td.rowhead')) {
    if (/^VIP expiration/i.test(td.textContent?.trim() ?? '')) {
      return td.nextElementSibling?.textContent?.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? null
    }
  }
  return null
}

/** VIP expiration date, fetched once `wanted` turns true. */
export function useVipUntil(uid: number | null, wanted: boolean): string | null {
  const [date, setDate] = useState<string | null>(() => (uid == null ? null : readCache(uid) ?? null))
  useEffect(() => {
    if (!wanted || uid == null || readCache(uid) !== undefined) return
    let live = true
    fetchVipUntil(uid)
      .then((d) => {
        writeCache(uid, d)
        if (live) setDate(d)
      })
      .catch(() => {
        // menu simply shows no VIP line
      })
    return () => {
      live = false
    }
  }, [wanted, uid])
  return date
}
