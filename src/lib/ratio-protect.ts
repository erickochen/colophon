// Ratio impact of a download, following the MAM+ ratioProtect thresholds.
// Exact byte totals come from /jsonLoad.php; the torrent size from the page.
import { useEffect, useState } from 'react'
import { useFeature, useRatioFloor } from '@/lib/settings'

// Drops at or under this are noise (MAM+ trivial threshold).
export const TRIVIAL_DROP = 0.009
// Slight color change.
export const NOTICE_DROP = 0.5
// Suggest spending a wedge.
export const WARN_DROP = 1
// Plain download locks; freeleech only.
export const BLOCK_DROP = 2
// Power User requires ratio 2, so never let a download cross it.
export const HARD_FLOOR = 2

export type RatioLevel = 'none' | 'notice' | 'warn' | 'block'

export interface RatioImpact {
  /** null when the account never downloaded, so the ratio is infinite. */
  current: number | null
  next: number
  /** null when there is no current ratio to drop from. */
  drop: number | null
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
  let level: RatioLevel = 'none'
  if (current == null) {
    // No real ratio yet: inform, never lock (MAM+ parity).
    level = 'notice'
  } else if (drop != null && drop > TRIVIAL_DROP) {
    if (drop > BLOCK_DROP || next < HARD_FLOOR || (floor != null && next < floor)) level = 'block'
    else if (drop > WARN_DROP) level = 'warn'
    else if (drop > NOTICE_DROP) level = 'notice'
  }
  return { current, next, drop, level }
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
    fetch('/jsonLoad.php', { credentials: 'include' })
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
  setFloor: (v: number | null) => void
  enabled: boolean
  setEnabled: (v: boolean) => void
}

/** Ratio guard for one torrent. Pass null size to skip (freeleech, VIP,
 * already snatched); the result stays null until the totals arrive. Switched
 * off it keeps reporting the impact but never escalates past 'none'. */
export function useRatioGuard(sizeText: string | null): RatioGuard | null {
  const sizeBytes = parseSizeBytes(sizeText)
  const totals = useByteTotals(sizeBytes != null)
  const [floor, setFloor] = useRatioFloor()
  const [enabled, setEnabled] = useFeature('ratioProtect')
  if (sizeBytes == null || totals == null) return null
  const impact = assessRatio(totals.uploaded, totals.downloaded, sizeBytes, floor)
  if (!enabled) impact.level = 'none'
  return { impact, wedges: totals.wedges, floor, setFloor, enabled, setEnabled }
}
