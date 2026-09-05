// MAM's officially automatable JSON endpoints (see /api/list.php).
// Same-origin fetch with session cookie; CSP allows 'self' only.
import { decodeEntities, MS_PER_SECOND } from '@/lib/format'
import { mamFetch } from '@/lib/mam-fetch'
import { submitNative } from '@/lib/form-submit'

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
  /** Unix seconds of the reseed request standing on this torrent, absent where
   * none does. */
  radded?: number
  /** Only present once this member hid that reseed request. The value carries
   * no meaning, its presence is the flag. */
  rri?: unknown
  owner: number
  owner_name: string | null
  /** Free text, except a digits-only field arrives as a JSON number. */
  tags: string | number | null
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
 * narrators) or ["Name", "part", weight] (series). Both search endpoints hand
 * back the series name HTML-escaped, so name and part are decoded here. Author
 * and narrator names arrive clean, where decoding is a no-op.
 */
export function parsePeople(info: string | null | undefined): { id: string; name: string; part?: string }[] {
  if (!info) return []
  try {
    const obj = JSON.parse(info) as Record<string, string | (string | number)[]>
    return Object.entries(obj).map(([id, v]) =>
      Array.isArray(v)
        ? { id, name: decodeEntities(String(v[0] ?? '')), part: v[1] != null && v[1] !== '' ? decodeEntities(String(v[1])) : undefined }
        : { id, name: decodeEntities(String(v)) }
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
  const res = await mamFetch('/tor/js/loadSearchJSONbasic.php', {
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

// The largest page /tor/js/loadSearchJSONbasic.php serves in one answer.
export const SERIES_PAGE = 100
// Ceiling on a single series run. The largest series hold a few hundred
// torrents, so this leaves room without letting a runaway filter page forever.
export const SERIES_FETCH_MAX = 1000

// Ceiling when a plain list is read whole to group it. That runs on searches of
// any width, so it stays well under the series ceiling: five pages reach far
// enough to cluster an author while asking the endpoint far less.
export const GROUP_FETCH_MAX = 500

/** Every row of a query, paged. Stops at the cap and reports the server's own
 * total, so a caller can say how much was left out. */
export async function searchAllTorrents(query: SearchQuery, cap = SERIES_FETCH_MAX): Promise<SearchResult> {
  const first = await searchTorrents({ ...query, startNumber: 0, perpage: SERIES_PAGE })
  const rows = [...first.data]
  const target = Math.min(first.found, cap)
  while (rows.length < target && first.data.length > 0) {
    const next = await searchTorrents({ ...query, startNumber: rows.length, perpage: SERIES_PAGE })
    if (next.data.length === 0) break
    rows.push(...next.data)
  }
  return { ...first, data: rows.slice(0, cap), start: 0 }
}

// Requests live on the shared search endpoint. The page URL carries one JSON
// blob (s={"com":{…},"req":{…}}) and the POST body is that blob flattened.
export const REQUEST_FILL_STATES = [
  { value: 'unfil', label: 'Unfulfilled' },
  { value: 'filled', label: 'Filled' },
  { value: 'either', label: 'All' },
] as const

export const REQUESTERS = [
  { value: 'any', label: 'From anyone' },
  { value: 'notMe', label: 'From anyone but me' },
  { value: 'me', label: 'From me' },
  { value: 'voted', label: 'I voted for' },
  // MAM calls this one "Outstanding Notifications": the requests behind the
  // header count, so the notification badge has somewhere to land.
  { value: 'notif', label: 'With updates for me' },
] as const

// The endpoint answers to date, votes and fillDesc. Title, release and fillAsc
// come back in default order, so they are left out.
export const REQUEST_SORTS = [
  { value: 'dateDesc', label: 'Newest first' },
  { value: 'dateAsc', label: 'Oldest first' },
  { value: 'votesDesc', label: 'Most votes' },
  { value: 'votesAsc', label: 'Fewest votes' },
  { value: 'fillDesc', label: 'Recently filled' },
] as const

export const REQUEST_DEFAULTS = { filled: 'unfil', requester: 'any', sortType: 'dateDesc' }

export const REQUESTS_PER_PAGE = 50

/** Fields MAM ticks by default in its own request search. */
const REQUEST_SEARCH_FIELDS = ['title', 'author']

export interface RequestQuery {
  text?: string
  filled?: string
  requester?: string
  sortType?: string
  start?: number
  /** Blob fields the view has no control for, carried through untouched so a
   * link from MAM's own advanced search keeps filtering. */
  extra?: { com?: Record<string, unknown>; req?: Record<string, unknown> }
}

export interface RequestRow {
  /** Creation time in unix seconds with a fraction; doubles as the request's key. */
  requesttime: number
  title: string
  cat_name: string
  lang_code: string | null
  votes: number
  filled: number
  author_info: string | null
  narrator_info: string | null
  series_info: string | null
  releasedate: string | null
  /** 0 with an empty pubusername when the requester hides their name. */
  pubuid: number
  pubusername: string
}

export interface RequestResult {
  perpage: number
  start: number
  data: RequestRow[]
  found: number
}

interface RequestSearchJson {
  com?: Record<string, unknown>
  req?: Record<string, unknown>
  perPage?: number
  searchType?: string
  start?: string | number
}

/** Keys the view owns; anything else in the blob is somebody else's filter. */
const OWNED_COM_KEYS = ['text', 'searchIn', 'sortType']
const OWNED_REQ_KEYS = ['filled', 'requester']

function requestSearchJson(q: RequestQuery): RequestSearchJson {
  const com: Record<string, unknown> = { ...q.extra?.com }
  if (q.text) {
    com.text = q.text
    com.searchIn = REQUEST_SEARCH_FIELDS
  }
  if (q.sortType && q.sortType !== REQUEST_DEFAULTS.sortType) com.sortType = q.sortType
  const req: Record<string, unknown> = { ...q.extra?.req }
  if (q.filled && q.filled !== REQUEST_DEFAULTS.filled) req.filled = q.filled
  if (q.requester && q.requester !== REQUEST_DEFAULTS.requester) req.requester = q.requester
  const json: RequestSearchJson = {}
  if (Object.keys(com).length) json.com = com
  if (Object.keys(req).length) json.req = req
  if (q.start) json.start = String(q.start)
  json.perPage = REQUESTS_PER_PAGE
  json.searchType = 'Requests'
  return json
}

/** PHP array notation for one blob branch: com[cat][]=13. */
function appendParam(body: URLSearchParams, key: string, value: unknown): void {
  if (value == null) return
  if (Array.isArray(value)) {
    for (const v of value) appendParam(body, `${key}[]`, v)
    return
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) appendParam(body, `${key}[${k}]`, v)
    return
  }
  body.append(key, String(value))
}

/** Page URL in MAM's own shape, so the link still works with the script off. */
export function requestsUrl(q: RequestQuery = {}): string {
  return `/tor/search.php?s=${encodeURIComponent(JSON.stringify(requestSearchJson(q)))}`
}

const omit = (source: Record<string, unknown> | undefined, owned: string[]): Record<string, unknown> =>
  Object.fromEntries(Object.entries(source ?? {}).filter(([k]) => !owned.includes(k)))

export function requestQueryFromUrl(loc: { search: string } = location): Required<RequestQuery> {
  const raw = new URLSearchParams(loc.search).get('s')
  let s: RequestSearchJson = {}
  if (raw) {
    try {
      s = JSON.parse(raw) as RequestSearchJson
    } catch {
      s = {}
    }
  }
  const str = (v: unknown) => (typeof v === 'string' ? v : undefined)
  const pick = (options: readonly { value: string }[], v: unknown, fallback: string) =>
    options.some((o) => o.value === v) ? (v as string) : fallback
  return {
    text: str(s.com?.text) ?? '',
    filled: pick(REQUEST_FILL_STATES, s.req?.filled, REQUEST_DEFAULTS.filled),
    requester: pick(REQUESTERS, s.req?.requester, REQUEST_DEFAULTS.requester),
    sortType: pick(REQUEST_SORTS, s.com?.sortType, REQUEST_DEFAULTS.sortType),
    start: Number(s.start) || 0,
    extra: { com: omit(s.com, OWNED_COM_KEYS), req: omit(s.req, OWNED_REQ_KEYS) },
  }
}

/** True when this search page is showing requests rather than torrents. */
export function isRequestSearch(loc: { search: string } = location): boolean {
  const raw = new URLSearchParams(loc.search).get('s')
  if (!raw) return false
  try {
    return (JSON.parse(raw) as RequestSearchJson).searchType === 'Requests'
  } catch {
    // MAM repairs a malformed blob only after the page loads, so read the text.
    return /"searchType"\s*:\s*"Requests"/.test(raw)
  }
}

export async function searchRequests(q: RequestQuery): Promise<RequestResult> {
  const json = requestSearchJson(q)
  const body = new URLSearchParams()
  appendParam(body, 'com', json.com)
  appendParam(body, 'req', json.req)
  // The blob leaves defaults out, the POST states them.
  body.set('com[sortType]', q.sortType ?? REQUEST_DEFAULTS.sortType)
  body.set('req[filled]', q.filled ?? REQUEST_DEFAULTS.filled)
  body.set('req[requester]', q.requester ?? REQUEST_DEFAULTS.requester)
  if (q.start) body.set('start', String(q.start))
  body.set('perPage', String(REQUESTS_PER_PAGE))
  body.set('searchType', 'Requests')
  const res = await mamFetch('/tor/json/search.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (!res.ok) throw new Error(`request search failed: ${res.status}`)
  const parsed = await res.json()
  if (!Array.isArray(parsed.data)) return { perpage: REQUESTS_PER_PAGE, start: 0, data: [], found: 0 }
  // Older answers carried the creation time as "id"; keep reading those.
  const data = (parsed.data as (RequestRow & { id?: number })[]).map((r) =>
    r.requesttime != null ? r : { ...r, requesttime: r.id ?? 0 }
  )
  return { ...parsed, data } as RequestResult
}

const BYTES_PER_UNIT = 1024
const IEC_UNITS = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const
// Two decimals with trailing zeros dropped, matching the classic API's size
// strings ("1.5 MiB" for 1572824 bytes).
const SIZE_ROUNDING = 100

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B'
  let v = n
  let unit = 0
  while (v >= BYTES_PER_UNIT && unit < IEC_UNITS.length - 1) {
    v /= BYTES_PER_UNIT
    unit += 1
  }
  const rounded = unit === 0 ? Math.round(v) : Math.round(v * SIZE_ROUNDING) / SIZE_ROUNDING
  return `${rounded} ${IEC_UNITS[unit]}`
}

/** Where the newer endpoint's rows differ from the classic ones: bytes for
 * size, unix seconds for added, the category name under `cat` plus both owner
 * fields folded into one JSON string. */
interface NewSearchRow extends Omit<SearchTorrent, 'size' | 'added' | 'catname' | 'owner' | 'owner_name'> {
  size: number
  added: number
  cat?: string
  ownership?: string
}

function fromNewRow(d: NewSearchRow): SearchTorrent {
  let owner = 0
  let ownerName: string | null = null
  try {
    const pair = JSON.parse(String(d.ownership ?? '')) as [number, string]
    owner = Number(pair[0]) || 0
    ownerName = pair[1] != null ? String(pair[1]) : null
  } catch {
    // A row without ownership keeps the placeholder owner.
  }
  return {
    ...d,
    catname: String(d.cat ?? ''),
    size: fmtBytes(Number(d.size) || 0),
    added: requestedAt(Number(d.added) || 0),
    owner,
    owner_name: ownerName,
  }
}

// The full torrent query for the newer endpoint. One object covers text, the
// new taxonomy, size and date bounds plus every torrent-state slot.
export interface Search2Query {
  text?: string
  /** com.searchIn values: title, author, narrator, series, description, tags, fileTypes, filenames. */
  srchIn?: string[]
  sortType?: string
  /** New media-type schema: 1 audiobook through 8 periodical audiobook. */
  mediaType?: number[]
  /** Genre ids from categories.php, a taxonomy separate from media types. */
  categories?: number[]
  browseLang?: number[]
  /** Whether browseLang lists wanted or unwanted languages. */
  ble?: 'has' | 'not'
  minSize?: number
  maxSize?: number
  /** Size unit: 1 KiB, 2 MiB, 3 GiB. */
  unit?: number
  dateRange?: 'day' | 'week' | 'month' | 'custom'
  /** YYYY-MM-DD, read only with dateRange custom. */
  startDate?: string
  endDate?: string
  authorID?: number
  narratorID?: number
  seriesID?: number
  /** MAM's own link values: 'me', 'else' or u<uid> from a profile. */
  uploader?: string
  state?: 'seeded' | 'unseeded'
  fl?: 'gfl' | 'pfl' | 'fl' | 'not'
  vip?: 'vip' | 'not' | 'temp' | 'perm'
  bookmarked?: 'only' | 'not'
  /** MAM's own Snatched slot. `only` keeps what you have had before; `not`
   * leaves it out. It answers off the same record as my_snatched. MAM's own
   * pages drop the neutral `all`, so it only travels where a caller writes it
   * down on purpose. */
  downloaded?: 'all' | 'only' | 'not'
  rr?: 'reseed' | 'myReseeds'
  /** 0 hides the listed flags, 1 shows only torrents carrying them. */
  flagsMode?: 0 | 1
  flags?: number[]
  start?: number
  perPage?: number
  /** Blob fields with no control here, carried through untouched so a link
   * from MAM's own advanced search keeps filtering. */
  extra?: { com?: Record<string, unknown>; tor?: Record<string, unknown> }
}

const TORRENTS_PER_PAGE = 25

/** The query as the s= blob object, in the exact shape MAM's page writes. */
export function search2Json(q: Search2Query): Record<string, unknown> {
  const com: Record<string, unknown> = { ...q.extra?.com }
  const tor: Record<string, unknown> = { ...q.extra?.tor }
  if (q.text) {
    com.text = q.text
    com.searchIn = q.srchIn?.length ? q.srchIn : REQUEST_SEARCH_FIELDS
  }
  if (q.sortType && q.sortType !== 'default') com.sortType = q.sortType
  if (q.mediaType?.length) com.mediaType = q.mediaType
  if (q.categories?.length) com.categories = q.categories
  if (q.browseLang?.length) {
    com.browse_lang = q.browseLang
    if (q.ble === 'not') com.ble = 'not'
  }
  if (q.dateRange) com.date_range = q.dateRange
  if (q.dateRange === 'custom') {
    if (q.startDate) com.startDate = q.startDate
    if (q.endDate) com.endDate = q.endDate
  }
  if (q.flags?.length) com[q.flagsMode === 1 ? 'browseFlags' : 'browseFlagsExclude'] = q.flags
  if (q.authorID) com.author = { id: [q.authorID] }
  if (q.narratorID) com.narrator = { id: [q.narratorID] }
  if (q.seriesID) com.series = { id: [q.seriesID] }
  if (q.minSize) tor.minSize = q.minSize
  if (q.maxSize) tor.maxSize = q.maxSize
  if ((q.minSize || q.maxSize) && q.unit) tor.unit = q.unit
  if (q.state) tor.state = q.state
  if (q.fl) tor.fl = q.fl
  if (q.vip) tor.vip = q.vip
  if (q.bookmarked) tor.bookmarked = q.bookmarked
  if (q.downloaded) tor.downloaded = q.downloaded
  if (q.rr) tor.rr = q.rr
  if (q.uploader) tor.uploader = q.uploader
  const s: Record<string, unknown> = { searchType: 'Torrents' }
  if (Object.keys(com).length) s.com = com
  if (Object.keys(tor).length) s.tor = tor
  if (q.start) s.start = String(q.start)
  if (q.perPage) s.perPage = q.perPage
  return s
}

/** Page URL in MAM's own blob shape, so the link works with the script off. */
export function search2Url(q: Search2Query): string {
  return `/tor/search.php?s=${encodeURIComponent(JSON.stringify(search2Json(q)))}`
}

/** Torrent search via the newer endpoint, answered as classic rows. */
export async function searchTorrents2(q: Search2Query): Promise<SearchResult> {
  const s = search2Json(q)
  const body = new URLSearchParams()
  appendParam(body, 'com', s.com)
  appendParam(body, 'tor', s.tor)
  // The blob leaves defaults out, the POST states them. A sort riding in via
  // the passthrough (a column-header value like cateogryAsc) stays as sent.
  if (!body.has('com[sortType]')) body.set('com[sortType]', q.sortType ?? 'default')
  if (q.start) body.set('start', String(q.start))
  body.set('perPage', String(q.perPage ?? TORRENTS_PER_PAGE))
  body.set('searchType', 'Torrents')
  const res = await mamFetch('/tor/json/search.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  // The endpoint refuses a query with readable text, sometimes behind a 403
  // (rapid searches), so the body beats the status code as a message.
  const text = await res.text()
  let json: { data?: unknown; found?: number; perpage?: number; start?: number }
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error(text.trim() || `search failed: ${res.status}`)
  }
  if (!res.ok) throw new Error(`search failed: ${res.status}`)
  if (!Array.isArray(json.data)) return { perpage: 0, start: 0, data: [], found: 0 }
  return {
    perpage: Number(json.perpage) || (q.perPage ?? TORRENTS_PER_PAGE),
    start: Number(json.start) || 0,
    found: Number(json.found) || 0,
    data: (json.data as NewSearchRow[]).map(fromNewRow),
  }
}

/** The endpoint answers 403 to searches that follow each other too closely.
 * Keeping that up costs the whole session, so pages are spaced out. */
const PAGE_GAP_MS = 700

const pause = (ms: number) => new Promise((done) => setTimeout(done, ms))

/** Every row of a query, paged. Stops at the cap and reports the server's own
 * total, so a caller can say how much was left out. A page that fails ends the
 * run with whatever the earlier ones brought, since a long list is worth more
 * than the tail it is missing. */
export async function searchAllTorrents2(q: Search2Query, cap = SERIES_FETCH_MAX): Promise<SearchResult> {
  const first = await searchTorrents2({ ...q, start: 0, perPage: SERIES_PAGE })
  const rows = [...first.data]
  const target = Math.min(first.found, cap)
  while (rows.length < target && first.data.length > 0) {
    await pause(PAGE_GAP_MS)
    let next: SearchResult
    try {
      next = await searchTorrents2({ ...q, start: rows.length, perPage: SERIES_PAGE })
    } catch {
      break
    }
    if (next.data.length === 0) break
    rows.push(...next.data)
  }
  return { ...first, data: rows.slice(0, cap), start: 0 }
}

/** Single bookmark toggle. Answers {success:true,action:"add"} and is idempotent. */
export async function bookmarkOne(id: number, action: 'add' | 'delete'): Promise<void> {
  const res = await mamFetch(`/tor/json/bookmark.php?action=${action}&tid=${id}`, { credentials: 'include' })
  if (!res.ok) throw new Error(`bookmark failed: ${res.status}`)
  const json = await res.json()
  if (!json?.success) throw new Error(String(json?.error ?? 'bookmark failed'))
}

// Server bounds for a single bonus-point gift; MAM refuses anything outside.
export const MIN_GIFT = 5
export const MAX_GIFT = 1000
// The bounds MAM's own thank box enforces on torrent pages. The store refuses
// an amount that is not a whole number of steps.
export const THANK_MAX = 5000
export const THANK_STEP = 50
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
    res = await mamFetch(`/json/bonusBuy.php?${params}`, {
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

/** Bonus points into upload credit. The amount is one of the store's own steps,
 * "Max Affordable " included, since the server prices per step. */
export function buyUploadCredit(amount: string): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'upload', amount }))
}

/** VIP time in weeks. "max" takes whatever the balance reaches. */
export function buyVip(duration: string): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'VIP', duration }))
}

/** One freeleech wedge, paid in cheese or in points. */
export function buyWedge(source: string): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'wedges', source }))
}

/** Another 72 hours of seed time on one torrent. */
export function buySeedtime(tid: string): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'seedtime', tid }))
}

/** Ask staff for a custom title. Nothing is charged until they approve it. The
 * timestamp is MAM's own cache buster on this one call. */
export function buyTitle(title: string, timestamp: number): Promise<BonusBuyResult> {
  return bonusBuy(new URLSearchParams({ spendtype: 'title', title, timestamp: String(timestamp) }))
}

/** Thank an uploader, with bonus points when an amount rides along. Same call
 * MAM's own thanks form makes, so the points land as a gift. */
export function thankUploader(tid: string, points: number): Promise<BonusBuyResult> {
  const params = new URLSearchParams({ spendtype: 'thanks', tid })
  if (points > 0) params.set('points', String(points))
  return bonusBuy(params)
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
    const res = await mamFetch(`/tor/json/bookmarkMass.php?${p}`, { credentials: 'include' })
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
  const res = await mamFetch(`/tor/json/bookmarkMass.php?remove=${type}`, { credentials: 'include' })
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

/** What /jsonPostTest.php answers: rendered HTML or its own error text. */
export type PostPreviewResult = { ok: true; html: string } | { ok: false; message: string }

// Same ceiling site.js puts on its own store calls.
const POST_PREVIEW_TIMEOUT_MS = 20_000

/** Server-side render of a post body, through the same endpoint MAM's own
 * preview button uses. Stores nothing. */
export async function postPreview(source: string, signal?: AbortSignal): Promise<PostPreviewResult> {
  const timeout = AbortSignal.timeout(POST_PREVIEW_TIMEOUT_MS)
  const res = await mamFetch('/jsonPostTest.php', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ messageToTest: source }).toString(),
    signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
  })
  if (!res.ok) throw new Error(`postTest failed: ${res.status}`)
  const json = (await res.json()) as { message?: string; Error?: string }
  if (json.Error != null) return { ok: false, message: String(json.Error) }
  return { ok: true, html: String(json.message ?? '') }
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
  submitNative(form)
  form.remove()
}

export function torrentUrl(id: number) {
  return `/t/${id}`
}

// A request is addressed by its creation time: unix seconds carrying a
// fraction. The detail URL uses that number as-is.
export function requestUrl(requesttime: number) {
  return `/t/r/${requesttime}`
}

const STAMP_LENGTH = 'YYYY-MM-DD HH:MM:SS'.length

/** Request time read back as the UTC stamp it encodes. */
export function requestedAt(requesttime: number): string {
  if (!Number.isFinite(requesttime)) return ''
  return new Date(requesttime * MS_PER_SECOND).toISOString().replace('T', ' ').slice(0, STAMP_LENGTH)
}

/** The timeout MAM's own handler for this GET carries. */
const CLEAR_TAG_TIMEOUT_MS = 20000

/** MAM's own mark for the NEW tag, in milliseconds. Its search page carries the
 * last clear as a hidden field in unix seconds, which torSearch.js compares
 * against each row's added stamp. The server only writes that field when the
 * "Show new tag" preference is on, so null means there is nothing to read. */
export function siteNewSince(doc: Document = document): number | null {
  const field = doc.getElementById('showNewIcon')
  const seconds = Number(field instanceof HTMLInputElement ? field.value : NaN)
  return Number.isFinite(seconds) && seconds > 0 ? seconds * MS_PER_SECOND : null
}

/** Clears MAM's own NEW tag for this account. Its browse page does the same GET
 * from its "Clear NEW tag" button, then drops every new.gif on the page. The
 * answer carries the fresh mark in unix seconds, which MAM writes back into its
 * own hidden field. */
export async function clearNewFlag(): Promise<number | null> {
  const res = await mamFetch('/tor/json/resetNewFlag.php', {
    credentials: 'include',
    signal: AbortSignal.timeout(CLEAR_TAG_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`Could not clear the tag (${res.status})`)
  // The body is what tells an answer from a page: a dead session answers 200
  // with the login page. The content type says nothing here, since MAM's own
  // caller asks for json plus never reads the header back.
  const text = (await res.text()).trim()
  if (text.startsWith('<')) throw new Error('Could not clear the tag')
  if (!text) return null
  let body: { success?: unknown; error?: unknown; ts?: unknown } | null = null
  try {
    body = JSON.parse(text) as { success?: unknown; error?: unknown; ts?: unknown }
  } catch {
    // Not JSON plus not a page. MAM's own handler reads no field off it either.
    return null
  }
  if (body?.success === false) throw new Error(String(body.error ?? 'Could not clear the tag'))
  const ts = Number(body?.ts)
  return Number.isFinite(ts) && ts > 0 ? ts * MS_PER_SECOND : null
}

export function downloadUrl(id: number, useWedge = false) {
  return `/tor/download.php?tid=${id}${useWedge ? '&fl' : ''}`
}

/** Takes a reseed request off your own lists. MAM hands this out as a page, so
 * it stays a link rather than a fetch. */
export function hideReseedUrl(id: number) {
  return `/tor/hide_reseed.php?tid=${id}`
}

/** Poster mime types MAM serves, mapped to the extension the large path wants. */
const POSTER_EXT: Record<string, string> = {
  'image/jpeg': 'jpeg',
  'image/png': 'png',
  'image/webp': 'webp',
}

/** MAM's own thumbnail path. It converts any poster to webp, so it needs no
 * type. The long side caps at 300px. */
export function coverThumbUrl(id: number) {
  return `https://cdn.myanonamouse.net/t/p/small/${id}.webp`
}

// The poster CDN accepts the path without the cache-buster segment, but the
// large one serves the poster in its own format: the extension has to match
// poster_type. Without a known type the thumbnail path is the safe one.
export function coverUrl(id: number, posterType?: string | null) {
  const ext = posterType ? POSTER_EXT[posterType.trim().toLowerCase()] : undefined
  return ext ? `https://cdn.myanonamouse.net/t/p/large/${id}.${ext}` : coverThumbUrl(id)
}

/** Candidates for a slot wider than the thumbnail, where the row carries no
 * poster_type. Book walks these in order, jpeg first because most posters are,
 * with the thumbnail last so a cover still lands. */
export function coverCandidates(id: number): string[] {
  return [
    `https://cdn.myanonamouse.net/t/p/large/${id}.jpeg`,
    `https://cdn.myanonamouse.net/t/p/large/${id}.webp`,
    `https://cdn.myanonamouse.net/t/p/large/${id}.png`,
    coverThumbUrl(id),
  ]
}
