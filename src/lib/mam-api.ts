// MAM's officially automatable JSON endpoints (see /api/list.php).
// Same-origin fetch with session cookie; CSP allows 'self' only.

export interface SearchQuery {
  text?: string
  srchIn?: Array<'title' | 'author' | 'narrator' | 'series' | 'description' | 'tags' | 'fileTypes' | 'filenames'>
  searchType?: 'all' | 'active' | 'inactive' | 'fl' | 'fl-VIP' | 'VIP' | 'nVIP' | 'nMeta'
  searchIn?: 'torrents' | 'bookmarks' | 'new' | 'mine' | 'allReseed' | 'myReseed'
  mainCat?: number[] // 13 audiobooks, 14 ebooks, 15 musicology, 16 radio
  cat?: number[]
  // Entity filters behind MAM's ?author= / ?narrator= / ?series= links.
  authorID?: number
  narratorID?: number
  seriesID?: number
  browseLang?: number[]
  browseFlagsHideVsShow?: 0 | 1
  browseFlags?: number[]
  startDate?: string
  endDate?: string
  minSize?: number
  maxSize?: number
  unit?: number
  minSeeders?: number
  maxSeeders?: number
  minLeechers?: number
  maxLeechers?: number
  minSnatched?: number
  maxSnatched?: number
  sortType?: string
  startNumber?: number
  perpage?: number
  hash?: string
  id?: number
}

export interface SearchTorrent {
  id: number
  title: string
  author_info: string | null
  narrator_info: string | null
  series_info: string | null
  category: number
  catname: string
  main_cat: number
  mediatype?: number
  lang_code: string | null
  language: number
  filetype: string
  numfiles: number
  size: string
  added: string
  seeders: number
  leechers: number
  times_completed: number
  comments: number
  vip: 0 | 1
  free: 0 | 1
  personal_freeleech: 0 | 1
  fl_vip: 0 | 1
  my_snatched: 0 | 1
  poster_type?: string | null
  bookmarked: number | null
  owner: number
  owner_name: string | null
  tags: string | null
  description?: string
  dl?: string
  isbn?: string | null
  w?: number
  cat?: string
  browseflags?: number
}

export interface SearchResult {
  perpage: number
  start: number
  data: SearchTorrent[]
  found: number
}

/**
 * Parse MAM's people/series JSON maps. Values are either "Name" (authors,
 * narrators) or ["Name", "part", weight] (series).
 */
export function parsePeople(info: string | null | undefined): { id: string; name: string; part?: string }[] {
  if (!info) return []
  try {
    const obj = JSON.parse(info) as Record<string, string | (string | number)[]>
    return Object.entries(obj).map(([id, v]) =>
      Array.isArray(v)
        ? { id, name: String(v[0] ?? ''), part: v[1] != null && v[1] !== '' ? String(v[1]) : undefined }
        : { id, name: String(v) }
    )
  } catch {
    return []
  }
}

function formEncode(query: SearchQuery, extras: Record<string, string>): URLSearchParams {
  const p = new URLSearchParams()
  const set = (k: string, v: string | number | undefined | null) => {
    if (v !== undefined && v !== null && v !== '') p.set(k, String(v))
  }
  set('tor[text]', query.text)
  for (const f of query.srchIn ?? []) p.set(`tor[srchIn][${f}]`, 'true')
  set('tor[searchType]', query.searchType)
  set('tor[searchIn]', query.searchIn)
  for (const c of query.mainCat ?? []) p.append('tor[main_cat][]', String(c))
  for (const c of query.cat ?? []) p.append('tor[cat][]', String(c))
  set('tor[authorID]', query.authorID)
  set('tor[narratorID]', query.narratorID)
  set('tor[seriesID]', query.seriesID)
  for (const l of query.browseLang ?? []) p.append('tor[browse_lang][]', String(l))
  if (query.browseFlags?.length) {
    set('tor[browseFlagsHideVsShow]', query.browseFlagsHideVsShow ?? 0)
    for (const f of query.browseFlags) p.append('tor[browseFlags][]', String(f))
  }
  set('tor[startDate]', query.startDate)
  set('tor[endDate]', query.endDate)
  set('tor[minSize]', query.minSize)
  set('tor[maxSize]', query.maxSize)
  set('tor[unit]', query.unit)
  set('tor[minSeeders]', query.minSeeders)
  set('tor[maxSeeders]', query.maxSeeders)
  set('tor[minLeechers]', query.minLeechers)
  set('tor[maxLeechers]', query.maxLeechers)
  set('tor[minSnatched]', query.minSnatched)
  set('tor[maxSnatched]', query.maxSnatched)
  set('tor[hash]', query.hash)
  set('tor[id]', query.id)
  set('tor[sortType]', query.sortType ?? 'default')
  set('tor[startNumber]', query.startNumber ?? 0)
  set('perpage', query.perpage ?? 25)
  for (const [k, v] of Object.entries(extras)) p.set(k, v)
  return p
}

export async function searchTorrents(query: SearchQuery, opts: { dlLink?: boolean; description?: boolean } = {}): Promise<SearchResult> {
  const extras: Record<string, string> = {}
  if (opts.dlLink) extras.dlLink = ''
  if (opts.description) extras.description = ''
  const res = await fetch('/tor/js/loadSearchJSONbasic.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode(query, extras).toString(),
  })
  if (!res.ok) throw new Error(`search failed: ${res.status}`)
  const json = await res.json()
  if (!Array.isArray(json.data)) return { perpage: 0, start: 0, data: [], found: 0 }
  return json as SearchResult
}

export interface UserLive {
  username: string
  uid: string
  classname: string
  ratio: string
  uploaded: string
  downloaded: string
  uploaded_bytes?: number
  downloaded_bytes?: number
  seedbonus?: number
  wedges?: number
  notifs?: unknown[]
}

export async function loadUserData(withNotifs = true): Promise<UserLive> {
  const res = await fetch(`/jsonLoad.php${withNotifs ? '?notif' : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`jsonLoad failed: ${res.status}`)
  return res.json()
}

/** Single bookmark toggle. Answers {success:true,action:"add"} and is idempotent. */
export async function bookmarkOne(id: number, action: 'add' | 'delete'): Promise<void> {
  const res = await fetch(`/tor/json/bookmark.php?action=${action}&tid=${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`bookmark failed: ${res.status}`)
  const json = await res.json()
  if (!json?.success) throw new Error(String(json?.error ?? 'bookmark failed'))
}

// Server bounds for a single bonus-point gift; MAM refuses anything outside.
export const MIN_GIFT = 5
export const MAX_GIFT = 1000
// Prefill when the GiftMAM widget offers no usable default.
export const DEFAULT_GIFT = 100
// Same ceiling site.js puts on its own store calls.
const BONUS_BUY_TIMEOUT_MS = 20_000

/** What the store endpoint reports back. The counters feed MAM's own header
 * updater, so keep the field names it looks for. */
export interface BonusBuyResult {
  success?: boolean
  error?: unknown
  seedbonus?: number | string
  FLleft?: number | string
  cheese?: number | string
  ratio?: string
  toName?: string
  amount?: number | string
}

async function bonusBuy(params: URLSearchParams): Promise<BonusBuyResult> {
  let res: Response
  try {
    res = await fetch(`/json/bonusBuy.php?${params}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(BONUS_BUY_TIMEOUT_MS),
    })
  } catch (e) {
    throw new Error(e instanceof Error && e.name === 'TimeoutError' ? 'MyAnonaMouse did not answer in time.' : 'Could not reach MyAnonaMouse.')
  }
  if (!res.ok) throw new Error(`bonusBuy failed: ${res.status}`)
  const json = (await res.json()) as BonusBuyResult
  if (!json?.success) throw new Error(String(json?.error ?? 'bonusBuy failed'))
  return json
}

/** Gift bonus points to another member. */
export function giftPoints(uid: string, amount: number): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'gift', amount: String(amount), giftTo: uid }))
}

/** Send one freeleech wedge to another member. */
export function sendWedgeTo(uid: string): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'sendWedge', giftTo: uid }))
}

/** Spend one wedge to make a torrent personal freeleech, the same call MAM's own
 * "Buy as FL" button makes. Rejects when the store refuses, so a caller can hold
 * off the download instead of letting it hit the ratio. */
export function buyPersonalFreeleech(id: number): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'personalFL', torrentid: String(id) }))
}

// The ids ride along in the query string, so batches stay well inside the
// header limits of a typical nginx.
const BOOKMARK_BATCH_MAX = 100

/** Carries the ids that did land, so a caller can keep those and revert the rest. */
export class BookmarkMassError extends Error {
  constructor(message: string, readonly applied: number[]) {
    super(message)
    this.name = 'BookmarkMassError'
  }
}

/** Bulk bookmark toggle. Answers with the affected ids for add and a change
 * count for remove, so the error key is the only part worth reading. */
export async function bookmarkMass(ids: number[], action: 'add' | 'remove'): Promise<void> {
  const applied: number[] = []
  for (let i = 0; i < ids.length; i += BOOKMARK_BATCH_MAX) {
    const batch = ids.slice(i, i + BOOKMARK_BATCH_MAX)
    const p = new URLSearchParams()
    for (const id of batch) p.append(`${action}[]`, String(id))
    const res = await fetch(`/tor/json/bookmarkMass.php?${p}`, { credentials: 'include' })
    if (!res.ok) throw new BookmarkMassError(`bookmark failed: ${res.status}`, applied)
    const json = await res.json()
    if (json && !Array.isArray(json) && 'error' in json) throw new BookmarkMassError(String(json.error), applied)
    applied.push(...batch)
  }
}

export type BookmarkCleanup = 'seedCom' | 'seedAll' | 'dl' | 'all'

/** Cleanup over the whole bookmark list rather than a set of ids. Answers
 * {"changes":n} for a known type and plain text for anything else. */
export async function bookmarkCleanup(type: BookmarkCleanup): Promise<number> {
  const res = await fetch(`/tor/json/bookmarkMass.php?remove=${type}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`cleanup failed: ${res.status}`)
  const text = await res.text()
  let json: { changes?: number; error?: unknown }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(text.trim() || 'cleanup failed')
  }
  if (json?.error != null) throw new Error(String(json.error))
  return typeof json?.changes === 'number' ? json.changes : 0
}

/** Zip of every bookmark, whatever the current search shows. */
export const BOOKMARKS_ZIP_URL = 'https://cdn.myanonamouse.net/DownloadZips.php?type=bookmarks'

// MAM's own browse pages hold at most 100 rows, so that is the largest batch
// the zip endpoint is known to take.
export const ZIP_BATCH_MAX = 100

/** Bulk .torrent zip. The endpoint replies with an attachment, so this needs a
 * real form post: a fetch response cannot be handed to the browser as a file. */
export function downloadZipOf(ids: number[]): void {
  const form = document.createElement('form')
  form.method = 'post'
  form.action = 'https://cdn.myanonamouse.net/DownloadZips.php?type=batch'
  for (const id of ids.slice(0, ZIP_BATCH_MAX)) {
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'tids[]'
    input.value = String(id)
    form.append(input)
  }
  document.documentElement.append(form)
  form.submit()
  form.remove()
}

export function torrentUrl(id: number) {
  return `/t/${id}`
}

export function downloadUrl(id: number, useWedge = false) {
  return `/tor/download.php?tid=${id}${useWedge ? '&fl' : ''}`
}

// Poster CDN accepts the path without the cache-buster segment (verified live).
export function coverUrl(id: number) {
  return `https://cdn.myanonamouse.net/t/p/large/${id}.jpeg`
}
