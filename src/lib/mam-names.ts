import { mamFetch } from '@/lib/mam-fetch'

// MAM's name lookup behind the author, narrator and series boxes on the upload
// and request forms. It answers from the cdn host, where the session cookie
// does not travel along, so the mbsc cookie rides in the body instead.
const NAMES_URL = 'https://cdn.myanonamouse.net/json/ac_names.php'

/** Shortest term MAM answers on. Below this its own boxes stay quiet too. */
export const MIN_NAME_TERM = 3

export type NameKind = 'author' | 'narrator' | 'series'

export interface NameHit {
  id: number
  name: string
}

/** The cookie sits percent-encoded in document.cookie; the endpoint answers
 * "invalid cookie" unless it arrives decoded. */
function sessionToken(): string {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('mbsc='))?.slice('mbsc='.length) ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}

export async function searchNames(kind: NameKind, term: string, signal?: AbortSignal): Promise<NameHit[]> {
  const res = await mamFetch(NAMES_URL, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
    body: new URLSearchParams({ term, type: kind, mbsc: sessionToken() }).toString(),
    signal,
  })
  if (!res.ok) throw new Error(`Name lookup failed (${res.status})`)
  const rows: unknown = await res.json()
  if (!Array.isArray(rows)) return []
  return rows
    .map((r) => r as { id?: unknown; value?: unknown })
    .filter((r) => typeof r.value === 'string' && r.value)
    .map((r) => ({ id: Number(r.id) || 0, name: String(r.value) }))
}

/** A comma is only allowed in these boxes when the name came out of MAM's own
 * list. Its script drops the comma from the pattern the moment you pick one, so
 * mirror that or a picked name like "Wells, H. G." fails validation on submit. */
export function allowPickedName(el: HTMLInputElement, name: string): void {
  if (!name.includes(',')) return
  const pattern = el.getAttribute('pattern')
  if (pattern?.includes(',')) el.setAttribute('pattern', pattern.replace(',', ''))
}
