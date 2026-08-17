// Ratio impact of a download: what it costs and how close it brings you to the
// floor. Exact byte totals come from /jsonLoad.php; the torrent size from the
// page.
import { useEffect, useState } from 'react'
import { useFeature, useRatioFloor } from '@/lib/settings'
import { mamFetch } from '@/lib/mam-fetch'

// One line does the work: the minimum ratio the reader set. A download landing
// under it locks. The softer levels sit at a multiple of that same line.
// Slight color change.
export const NOTICE_MARGIN = 3
// Suggest spending a wedge.
export const WARN_MARGIN = 1.5
// A drop of this share of your ratio or less is noise at any ratio.
export const TRIVIAL_SHARE = 0.005

export type RatioLevel = 'none' | 'notice' | 'warn' | 'block'

export interface RatioImpact {
  /** null when the account never downloaded, so the ratio is infinite. */
  current: number | null
  next: number
  /** null when there is no current ratio to drop from. */
  drop: number | null
  /** The drop as a share of the current ratio; null without a current ratio. */
  share: number | null
  level: RatioLevel
}

const SIZE_UNITS: Record<string, number> = {
  b: 1,
  bytes: 1,
  kib: 1024 ** 1,
  mib: 1024 ** 2,
  gib: 1024 ** 3,
  tib: 1024 ** 4,
}

/** "38.87 GiB" to bytes; null when the text does not name a size. */
export function parseSizeBytes(text: string | null | undefined): number | null {
  const m = text?.match(/([\d,.]+)\s*(bytes|[kmgt]?i?b)/i)
  if (!m) return null
  const value = Number(m[1].replace(/,/g, ''))
  const unit = SIZE_UNITS[m[2].toLowerCase()]
  if (!Number.isFinite(value) || unit == null) return null
  return value * unit
}

export function assessRatio(
  uploadedBytes: number,
  downloadedBytes: number,
  sizeBytes: number,
  floor: number | null,
): RatioImpact {
  const current = downloadedBytes > 0 ? uploadedBytes / downloadedBytes : null
  const next = uploadedBytes / (downloadedBytes + sizeBytes)
  const drop = current != null ? current - next : null
  const share = current != null && current > 0 && drop != null ? drop / current : null
  const trivial = share != null && share <= TRIVIAL_SHARE
  let level: RatioLevel = 'none'
  if (current == null) {
    // No real ratio yet: inform, never lock (MAM+ parity).
    level = 'notice'
  } else if (floor == null) {
    // No minimum set, so nothing to warn about. The line still shows.
    level = 'none'
  } else if (next < floor) {
    level = 'block'
  } else if (trivial) {
    // Too small to care about, however close to the line you sit.
    level = 'none'
  } else if (next < floor * WARN_MARGIN) {
    level = 'warn'
  } else if (next < floor * NOTICE_MARGIN) {
    level = 'notice'
  }
  return { current, next, drop, share, level }
}

/** Whether the impact deserves a line of text: anything above noise, plus every
 * level that acts on it. */
export function worthNoting(impact: RatioImpact): boolean {
  return impact.level !== 'none' || impact.share == null || impact.share > TRIVIAL_SHARE
}

interface ByteTotals {
  uploaded: number
  downloaded: number
  wedges: number | null
}

/** Exact transfer totals; null while loading or when the fetch fails. */
function useByteTotals(wanted: boolean): ByteTotals | null {
  const [totals, setTotals] = useState<ByteTotals | null>(null)
  useEffect(() => {
    if (!wanted) return
    let live = true
    mamFetch('/jsonLoad.php', { credentials: 'include' })
      .then((r) => (r.ok ? r.json() : null))
      .then((u: { uploaded_bytes?: number; downloaded_bytes?: number; wedges?: number } | null) => {
        if (!live || u == null) return
        if (typeof u.uploaded_bytes !== 'number' || typeof u.downloaded_bytes !== 'number') return
        setTotals({
          uploaded: u.uploaded_bytes,
          downloaded: u.downloaded_bytes,
          wedges: typeof u.wedges === 'number' ? u.wedges : null,
        })
      })
      .catch(() => {
        // without totals the download button simply stays plain
      })
    return () => {
      live = false
    }
  }, [wanted])
  return totals
}

export interface RatioGuard {
  impact: RatioImpact
  wedges: number | null
  floor: number | null
  enabled: boolean
  setEnabled: (v: boolean) => void
}

/** Ratio guard for one torrent. Pass null size to skip (freeleech, VIP,
 * already snatched); the result stays null until the totals arrive. Switched
 * off it keeps reporting the impact but never escalates past 'none'. */
export function useRatioGuard(sizeText: string | null): RatioGuard | null {
  const sizeBytes = parseSizeBytes(sizeText)
  const totals = useByteTotals(sizeBytes != null)
  const [floor] = useRatioFloor()
  const [enabled, setEnabled] = useFeature('ratioProtect')
  if (sizeBytes == null || totals == null) return null
  const impact = assessRatio(totals.uploaded, totals.downloaded, sizeBytes, floor)
  if (!enabled) impact.level = 'none'
  return { impact, wedges: totals.wedges, floor, enabled, setEnabled }
}
