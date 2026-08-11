// Spending a wedge to download a torrent for free. MAM offers its own FL link
// (#tddlfl) only where a wedge helps, so we follow that rule. The spend goes
// through the store call, which refuses out loud when the stash is empty.
import { buyPersonalFreeleech, downloadUrl, type BonusBuyResult } from '@/lib/mam-api'

/** The coverage flags a search row carries. `fl_vip` is set for both site
 * freeleech and VIP, matching the rows where MAM omits its own FL link. */
export interface WedgeSubject {
  free: 0 | 1
  personal_freeleech: 0 | 1
  vip: 0 | 1
  fl_vip: 0 | 1
}

/** Whether a wedge buys you anything here. Free, VIP and personal-freeleech
 * torrents cost no ratio already; a snatch in the past does not make a new
 * download free, so history plays no part. */
export function wedgeHelps(t: WedgeSubject): boolean {
  return t.free === 0 && t.personal_freeleech === 0 && t.vip === 0 && t.fl_vip === 0
}

/** Pull a file without leaving the page. MAM answers download.php with an
 * attachment header, so the click never becomes a navigation. */
function pullFile(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.append(a)
  a.click()
  a.remove()
}

/** Apply a wedge, then take the file. The download waits for the store to
 * confirm: once the torrent is personal freeleech the plain URL is already free,
 * so no second wedge is at risk. */
export async function spendWedgeAndDownload(id: number, href?: string | null): Promise<BonusBuyResult> {
  const result = await buyPersonalFreeleech(id)
  pullFile(href ?? downloadUrl(id))
  return result
}
