// MAM's officially automatable JSON endpoints (see /api/list.php).
// Same-origin fetch with session cookie; CSP allows 'self' only.

export interface SearchQuery {
  text?: string
  srchIn?: Array<'title' | 'author' | 'narrator' | 'series' | 'description' | 'tags' | 'fileTypes' | 'filenames'>
  searchType?: 'all' | 'active' | 'inactive' | 'fl' | 'fl-VIP' | 'VIP' | 'nVIP' | 'nMeta'
  searchIn?: 'torrents' | 'bookmarks' | 'new' | 'mine' | 'allReseed' | 'myReseed'
  mainCat?: number[] // 13 audiobooks, 14 ebooks, 15 musicology, 16 radio
  cat?: number[]
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
  seedbonus?: number
  wedges?: number
  notifs?: unknown[]
}

export async function loadUserData(withNotifs = true): Promise<UserLive> {
  const res = await fetch(`/jsonLoad.php${withNotifs ? '?notif' : ''}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`jsonLoad failed: ${res.status}`)
  return res.json()
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
