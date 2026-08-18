import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlignJustify, ArrowDown, ArrowUp, ArrowUpDown, Bookmark, BookmarkCheck, BookmarkX, ChevronDown, Dice5, Download, EyeOff, FileArchive, LayoutGrid, Loader2, Minus, Trash2, Undo2 } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { PageHeader } from '@/app/shell/bits'
import {
  bookmarkCleanup, bookmarkMass, BookmarkMassError, bookmarkOne, downloadZipOf, searchAllTorrents2, searchTorrents2,
  search2Url, parsePeople, downloadUrl, coverUrl, torrentUrl, BOOKMARKS_ZIP_URL, ZIP_BATCH_MAX,
  type BookmarkCleanup, type Search2Query, type SearchTorrent,
} from '@/lib/mam-api'
import { useCategories2 } from '@/lib/categories2'
import { groupBySeries, type SeriesGroup } from '@/lib/series'
import { CONTENT_FLAGS, LANGUAGES, MAIN_CATS, SORT_OPTIONS } from '@/lib/mam-facets'
import { coverShape } from '@/lib/cover-shape'
import { wedgeHelps } from '@/lib/wedge'
import {
  BROWSE_COLS_KEY, BROWSE_VIEW_KEY, mamBrowseDefaults, readSticky, writeSticky, type StickyFilters,
} from '@/lib/browse-sticky'
import { useFeature, useIgnoredTorrents } from '@/lib/settings'
import { fmtInt, plural, relTime, utcTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Book } from '@/components/book'
import { CopyResultsButton } from '@/components/copy-results'
import { CollapsibleSection } from '@/components/section'
import { SeriesHeader } from '@/components/series-header'
import { TagLinks } from '@/components/tag-links'
import { WedgeBatchButton, WedgeRowButton } from '@/components/wedge-download'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  FacetMode, FacetOptions, FilterBar, FilterDateRange, FilterFacet, FilterHint,
  FilterRow, FilterSearch, FilterSegments, FilterSelect, FilterSummary, FilterToggle, TRIGGER,
  toggleValue,
} from '@/components/filters'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const SRCH_FIELDS = [
  ['title', 'Title'], ['author', 'Author'], ['narrator', 'Narrator'], ['series', 'Series'],
  ['description', 'Description'], ['tags', 'Tags'], ['fileTypes', 'Filetype'], ['filenames', 'Filenames'],
] as const

const SEARCH_TYPES = [
  ['all', 'All torrents'], ['active', 'Active only'], ['inactive', 'Inactive only'],
  ['fl', 'Freeleech'], ['VIP', 'VIP'], ['nVIP', 'Not VIP'],
] as const

const SEARCH_INS = [
  ['torrents', 'Everywhere'], ['bookmarks', 'My bookmarks'],
  ['mine', 'My uploads'], ['allReseed', 'All reseed requests'], ['myReseed', 'I could reseed'],
] as const

// The list you are in is what the page is about, so it names the page as well.
const SEARCH_IN_TITLES: Record<(typeof SEARCH_INS)[number][0], string> = {
  torrents: 'Browse the library',
  bookmarks: 'My bookmarks',
  mine: 'My uploads',
  allReseed: 'Reseed requests',
  myReseed: 'Torrents I could reseed',
}

// The search endpoint has no bookmark-date order; the rest of the shared sort
// list answers as labeled.
const BROWSE_SORTS = SORT_OPTIONS.filter((o) => o.value !== 'bmkaDesc')

// MAM's search answers can trail a bookmark write by a while, so the total is
// worth a few retries. Past that the toast carries the outcome and a lingering
// row clears on the next search.
const REFRESH_POLL_MS = 1000
const REFRESH_POLL_TRIES = 5

type ViewMode = 'list' | 'grid'

type ColKey = 'narrators' | 'series' | 'filetype' | 'size' | 'peers' | 'added'

// List-row fields the reader can hide; track = width in the stats grid.
interface ListColumn {
  key: ColKey
  label: string
  track?: string
  /** Short form for the column header above the rows. */
  head?: string
}
const LIST_COLUMNS: readonly ListColumn[] = [
  { key: 'narrators', label: 'Narrator' },
  { key: 'series', label: 'Series' },
  { key: 'filetype', label: 'Filetype', track: '52px', head: 'Type' },
  { key: 'size', label: 'Size', track: '84px', head: 'Size' },
  { key: 'peers', label: 'Seeders / leechers', track: '88px', head: 'Seed / leech' },
  { key: 'added', label: 'Added', track: '76px', head: 'Added' },
]
const ALL_COLS = LIST_COLUMNS.map((c) => c.key)

function readCols(): ColKey[] {
  try {
    const raw = localStorage.getItem(BROWSE_COLS_KEY)
    if (!raw) return ALL_COLS
    const saved: unknown = JSON.parse(raw)
    return Array.isArray(saved) ? ALL_COLS.filter((k) => saved.includes(k)) : ALL_COLS
  } catch {
    return ALL_COLS
  }
}

const PERPAGE_OPTIONS = [25, 50, 100]
const DEFAULT_PERPAGE = PERPAGE_OPTIONS[0]

// Long enough to hit Undo after the row leaves the list.
const IGNORE_TOAST_MS = 6000

// Tags per row before the rest becomes a count. Keeps a padded tag field from
// pushing the row over two lines.
const ROW_TAG_LIMIT = 4

// Cover slot in a list row. Fixed height keeps every title on one scan line
// whatever shape the cover turns out to be; the narrow value keeps a square
// cover off a third of a phone screen.
const ROW_COVER_H = 132
const ROW_COVER_H_SM = 96

// Row actions live in a lane wide enough for every action this list can show.
// The wedge button only renders where a wedge helps, so a lane that sized
// itself per row would drag the stats columns left and right line by line.
const ROW_ACTION_SIZE = 34
const ROW_ACTION_GAP = 6
const actionLane = (slots: number) => `${slots * ROW_ACTION_SIZE + (slots - 1) * ROW_ACTION_GAP}px`

// Gallery shelf: --shelf is the tallest a frame gets, so a row of frames shares
// one floor plus the titles under them line up. Narrow columns shrink the frame
// rather than the cover inside it.
const GALLERY_GRID =
  'grid grid-cols-3 gap-x-[22px] gap-y-7 p-6 [--shelf:150px] sm:grid-cols-4 sm:[--shelf:180px] lg:grid-cols-6 lg:[--shelf:210px]'

/** Why a row is not shown: on the personal ignore list or snatched while the
 * hide-snatched filter is on. */
type HiddenReason = 'ignored' | 'snatched'

type SrchField = (typeof SRCH_FIELDS)[number][0]

type BrowseSearchType = (typeof SEARCH_TYPES)[number][0]
type BrowseSearchIn = (typeof SEARCH_INS)[number][0]

interface BrowseState {
  text: string
  srchIn: SrchField[]
  searchType: BrowseSearchType
  searchIn: BrowseSearchIn
  // Tab ids stay the classic main categories; the POST maps them to the new
  // media-type schema.
  mainCat: number[]
  // Genre ids from the new taxonomy, picked in the filters facet.
  categories: number[]
  langs: number[]
  langsMode: 'has' | 'not'
  flagsMode: 0 | 1
  flags: number[]
  minSize: number | null
  maxSize: number | null
  sizeUnit: number
  dateRange: '' | 'day' | 'week' | 'month' | 'custom'
  startDate: string
  endDate: string
  // MAM's author/narrator/series links carry these ids (?author=<id>).
  authorID: number | null
  narratorID: number | null
  seriesID: number | null
  // A profile's uploads link pins the list to one uploader (u<uid> or 'else').
  uploader: string | null
  sort: string
  start: number
  perpage: number
  /** Blob fields with no control here, carried through untouched. */
  extra: { com: Record<string, unknown>; tor: Record<string, unknown> }
}

// The new search page files everything under a media type; the classic browse
// files periodicals, manga and comics under audiobooks or ebooks instead.
const MEDIATYPE_TO_MAINCAT: Record<number, number> = {
  1: 13, // Audiobook
  8: 13, // Periodical Audiobook
  2: 14, // Ebook
  5: 14, // Manga
  6: 14, // Comic Book / Graphic Novel
  7: 14, // Periodical Ebook
  3: 15, // Musicology
  4: 16, // Radio
}

const MAINCAT_TO_MEDIATYPE: Record<number, number[]> = {
  13: [1, 8],
  14: [2, 5, 6, 7],
  15: [3],
  16: [4],
}

// MAM's size units on the search endpoint.
const SIZE_UNITS = [
  { value: 1, label: 'KiB' },
  { value: 2, label: 'MiB' },
  { value: 3, label: 'GiB' },
]
const DEFAULT_SIZE_UNIT = 2

const DATE_RANGES = [
  { value: '', label: 'Any time' },
  { value: 'day', label: 'Past day' },
  { value: 'week', label: 'Past week' },
  { value: 'month', label: 'Past month' },
  { value: 'custom', label: 'Custom range' },
] as const

const EMPTY_EXTRA: BrowseState['extra'] = { com: {}, tor: {} }

const hasExtra = (extra: BrowseState['extra']): boolean =>
  Object.keys(extra.com).length > 0 || Object.keys(extra.tor).length > 0

/** MAM's newer /tor/search.php passes one JSON blob: s={"com":{…},"tor":{…}}.
 * Map every field a browse control covers onto our own state; whatever this
 * reader does not consume rides along in `extra`, so no inbound link loses a
 * filter. */
function stateFromSearchJson(raw: string, myUid: string | null): Partial<BrowseState> | null {
  let parsed: { com?: unknown; tor?: unknown; start?: unknown; perPage?: unknown }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  if (!parsed || typeof parsed !== 'object') return null
  const com: Record<string, unknown> = typeof parsed.com === 'object' && parsed.com !== null ? (parsed.com as Record<string, unknown>) : {}
  const tor: Record<string, unknown> = typeof parsed.tor === 'object' && parsed.tor !== null ? (parsed.tor as Record<string, unknown>) : {}
  // Consumed keys leave the passthrough; an unread value keeps filtering.
  const extraCom = { ...com }
  const extraTor = { ...tor }
  const takeCom = (k: string) => {
    delete extraCom[k]
  }
  const takeTor = (k: string) => {
    delete extraTor[k]
  }
  const out: Partial<BrowseState> = {}
  const text = typeof com.text === 'string' ? com.text : typeof tor.text === 'string' ? tor.text : null
  if (text !== null) {
    out.text = text
    takeCom('text')
    takeTor('text')
  }
  if (Array.isArray(com.searchIn)) {
    const fields = SRCH_FIELDS.map(([k]) => k).filter((k) => (com.searchIn as unknown[]).includes(k))
    if (fields.length) out.srchIn = fields
    takeCom('searchIn')
  }
  if (typeof com.sortType === 'string' && BROWSE_SORTS.some((o) => o.value === com.sortType)) {
    out.sort = com.sortType
    takeCom('sortType')
  }
  if (Array.isArray(com.browse_lang)) {
    const langs = com.browse_lang.map(Number).filter((l) => LANGUAGES.some((x) => x.id === l))
    if (langs.length) {
      out.langs = langs
      out.langsMode = com.ble === 'not' ? 'not' : 'has'
      takeCom('browse_lang')
      takeCom('ble')
    }
  }
  if (Array.isArray(com.mediaType)) {
    const mains = [...new Set(com.mediaType.map((m) => MEDIATYPE_TO_MAINCAT[Number(m)]).filter(Boolean))]
    if (mains.length) out.mainCat = mains
    takeCom('mediaType')
  }
  if (Array.isArray(com.categories)) {
    const genres = com.categories.map(Number).filter((c) => Number.isFinite(c) && c > 0)
    if (genres.length) out.categories = genres
    takeCom('categories')
  }
  const flagList = (v: unknown) =>
    Array.isArray(v) ? v.map(Number).filter((f) => CONTENT_FLAGS.some((x) => x.bit === f)) : []
  const flagsShow = flagList(com.browseFlags)
  const flagsHide = flagList(com.browseFlagsExclude)
  if (flagsShow.length) {
    out.flags = flagsShow
    out.flagsMode = 1
    takeCom('browseFlags')
  } else if (flagsHide.length) {
    out.flags = flagsHide
    out.flagsMode = 0
    takeCom('browseFlagsExclude')
  }
  const entityId = (v: unknown): number | null => {
    if (typeof v !== 'object' || v === null) return null
    const ids = (v as { id?: unknown }).id
    const first = Array.isArray(ids) ? Number(ids[0]) : Number(ids)
    return Number.isFinite(first) && first > 0 ? first : null
  }
  const author = entityId(com.author)
  if (author) {
    out.authorID = author
    takeCom('author')
  }
  const narrator = entityId(com.narrator)
  if (narrator) {
    out.narratorID = narrator
    takeCom('narrator')
  }
  const series = entityId(com.series)
  if (series) {
    out.seriesID = series
    takeCom('series')
  }
  if (com.date_range === 'day' || com.date_range === 'week' || com.date_range === 'month' || com.date_range === 'custom') {
    out.dateRange = com.date_range
    takeCom('date_range')
  }
  const dateStr = (v: unknown) => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '')
  const startDate = dateStr(com.startDate)
  const endDate = dateStr(com.endDate)
  if (startDate || endDate) {
    out.dateRange = 'custom'
    out.startDate = startDate
    out.endDate = endDate
    takeCom('startDate')
    takeCom('endDate')
  }
  const bound = (v: unknown): number | null => {
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  }
  const minSize = bound(tor.minSize)
  const maxSize = bound(tor.maxSize)
  if (minSize !== null || maxSize !== null) {
    out.minSize = minSize
    out.maxSize = maxSize
    const unit = Number(tor.unit)
    if (SIZE_UNITS.some((u) => u.value === unit)) out.sizeUnit = unit
    takeTor('minSize')
    takeTor('maxSize')
    takeTor('unit')
  }
  // The freeleech, VIP and seed-state dropdowns all land in one slot here.
  if (tor.fl === 'gfl' || tor.fl === 'pfl' || tor.fl === 'fl') {
    out.searchType = 'fl'
    takeTor('fl')
  } else if (tor.vip === 'vip' || tor.vip === 'temp' || tor.vip === 'perm') {
    out.searchType = 'VIP'
    takeTor('vip')
  } else if (tor.vip === 'not') {
    out.searchType = 'nVIP'
    takeTor('vip')
  } else if (tor.state === 'seeded') {
    out.searchType = 'active'
    takeTor('state')
  } else if (tor.state === 'unseeded') {
    out.searchType = 'inactive'
    takeTor('state')
  }
  if (tor.bookmarked === 'only') {
    out.searchIn = 'bookmarks'
    takeTor('bookmarked')
  } else if (tor.rr === 'reseed') {
    out.searchIn = 'allReseed'
    takeTor('rr')
  } else if (tor.rr === 'myReseeds') {
    out.searchIn = 'myReseed'
    takeTor('rr')
  } else if (tor.uploader === 'me' || (myUid != null && tor.uploader === `u${myUid}`)) {
    out.searchIn = 'mine'
    takeTor('uploader')
  } else if (typeof tor.uploader === 'string' && (/^u\d+$/.test(tor.uploader) || tor.uploader === 'else')) {
    out.uploader = tor.uploader
    takeTor('uploader')
  }
  const start = Number(parsed.start)
  if (Number.isFinite(start) && start > 0) out.start = start
  const perPage = Number(parsed.perPage)
  if (PERPAGE_OPTIONS.includes(perPage)) out.perpage = perPage
  if (Object.keys(extraCom).length || Object.keys(extraTor).length) out.extra = { com: extraCom, tor: extraTor }
  return Object.keys(out).length ? out : null
}

function stateFromUrl(myUid: string | null = null): BrowseState {
  const p = new URLSearchParams(location.search)
  const srchIn = SRCH_FIELDS.map(([k]) => k).filter((k) => p.get(`tor[srchIn][${k}]`) === 'true')
  // Classic subcategory ids and the new genre ids are different taxonomies, so
  // an old tor[cat][] link keeps its media-type tab and drops the rest.
  const catTabs = p
    .getAll('tor[cat][]')
    .map(Number)
    .map((c) => MAIN_CATS.find((m) => m.cats.some((x) => x.id === c))?.id)
    .filter((x): x is number => x != null)
  const rawType = p.get('tor[searchType]')
  const rawIn = p.get('tor[searchIn]')
  return {
    text: p.get('tor[text]') ?? '',
    srchIn: srchIn.length ? srchIn : ['title', 'author'],
    // fl-VIP was an or over two slots the endpoint keeps separate; freeleech
    // is the nearest single slot. Flagged new filtered nothing and drops out.
    searchType:
      rawType === 'fl-VIP' ? 'fl' : SEARCH_TYPES.some(([v]) => v === rawType) ? (rawType as BrowseSearchType) : 'all',
    searchIn: SEARCH_INS.some(([v]) => v === rawIn) ? (rawIn as BrowseSearchIn) : 'torrents',
    mainCat: [...new Set([...p.getAll('tor[main_cat][]').map(Number).filter(Boolean), ...catTabs])],
    categories: [],
    langs: p.getAll('tor[browse_lang][]').map(Number).filter(Boolean),
    langsMode: 'has',
    flagsMode: p.get('tor[browseFlagsHideVsShow]') === '1' ? 1 : 0,
    flags: p.getAll('tor[browseFlags][]').map(Number).filter(Boolean),
    minSize: null,
    maxSize: null,
    sizeUnit: DEFAULT_SIZE_UNIT,
    dateRange: '',
    startDate: '',
    endDate: '',
    // MAM links use the short form; its own scripts rewrite the URL to the
    // tor[...ID] form after a search, so accept both.
    authorID: Number(p.get('author') ?? p.get('tor[authorID]')) || null,
    narratorID: Number(p.get('narrator') ?? p.get('tor[narratorID]')) || null,
    seriesID: Number(p.get('series') ?? p.get('tor[seriesID]')) || null,
    uploader: null,
    // Only sorts the endpoint answers reliably; anything else means default.
    sort: BROWSE_SORTS.some((o) => o.value === p.get('tor[sortType]')) ? p.get('tor[sortType]')! : 'default',
    start: Number(p.get('tor[startNumber]')) || 0,
    perpage: Number(p.get('perpage')) || DEFAULT_PERPAGE,
    extra: EMPTY_EXTRA,
    ...(p.get('s') ? stateFromSearchJson(p.get('s')!, myUid) ?? {} : {}),
  }
}

const stickyOf = (s: BrowseState): StickyFilters => ({
  mainCat: s.mainCat,
  categories: s.categories,
  langs: s.langs,
  langsMode: s.langsMode,
  flagsMode: s.flagsMode,
  flags: s.flags,
  sort: s.sort,
  perpage: s.perpage,
})

/** The URL wins per field, then the filters last used here, then whatever MAM
 * has saved as its own browse defaults. Only the plain torrent list gets them:
 * opening your bookmarks or your uploads should show that list whole. */
function initialState(myUid: string | null): BrowseState {
  const s = stateFromUrl(myUid)
  // An entity link pins one author, narrator or series; saved filters would
  // narrow that list to confusion.
  if (s.searchIn !== 'torrents' || s.uploader || s.authorID || s.narratorID || s.seriesID) return s
  const saved: Partial<StickyFilters> = readSticky() ?? mamBrowseDefaults() ?? {}
  const p = new URLSearchParams(location.search)
  // A filter the link itself names is a choice, whether it rides in as a
  // tor[...] param or inside the s= blob of the newer search page.
  const blob = p.get('s') ? stateFromSearchJson(p.get('s')!, myUid) : null
  // MAM's own scripts rewrite the URL once their search returns, leaving neutral
  // values behind: tor[cat][]=0 for every category and tor[sortType]=default.
  // Those are not a choice, so they must not shut the saved filters out.
  const picked = (key: string) => p.getAll(key).some((v) => Number(v) > 0)
  const urlSort = p.get('tor[sortType]')
  const next = { ...s }
  if (!picked('tor[main_cat][]') && !picked('tor[cat][]') && !blob?.mainCat) {
    next.mainCat = saved.mainCat ?? next.mainCat
  }
  if (!blob?.categories) next.categories = saved.categories ?? next.categories
  if (!picked('tor[browse_lang][]') && !blob?.langs) {
    next.langs = saved.langs ?? next.langs
    next.langsMode = saved.langsMode ?? next.langsMode
  }
  if (!picked('tor[browseFlags][]') && !blob?.flags) {
    next.flagsMode = saved.flagsMode ?? next.flagsMode
    next.flags = (saved.flags ?? next.flags).filter((f) => CONTENT_FLAGS.some((x) => x.bit === f))
  }
  // A sort the link carries counts as a choice, also when it only lives in the
  // passthrough (a column-header value our select does not list).
  const linkSort = blob?.sort != null || (blob?.extra != null && 'sortType' in blob.extra.com)
  if ((!urlSort || urlSort === 'default') && !linkSort && saved.sort && BROWSE_SORTS.some((o) => o.value === saved.sort)) {
    next.sort = saved.sort
  }
  if (!p.has('perpage') && !blob?.perpage && saved.perpage && PERPAGE_OPTIONS.includes(saved.perpage)) {
    next.perpage = saved.perpage
  }
  return next
}

// Ceiling on a restored list. Past this the page fetches the first slice and
// Load more covers the rest, rather than pulling hundreds of rows at once.
const RESTORE_MAX_ROWS = 200

/** A reader who loaded more rows and then reloaded gets the whole list back,
 * not the last batch on its own. The offset in the URL says how far they got,
 * so the opening search asks for every row up to there in one request. */
function restored(s: BrowseState): { state: BrowseState; take?: number } {
  if (s.start <= 0) return { state: s }
  return { state: { ...s, start: 0 }, take: Math.min(RESTORE_MAX_ROWS, s.start + s.perpage) }
}

/** The state as the newer page's blob URL, the one form we write. */
function urlFromState(s: BrowseState): string {
  return search2Url(toQuery2(s))
}

function toQuery2(s: BrowseState): Search2Query {
  const mediaType = [...new Set(s.mainCat.flatMap((m) => MAINCAT_TO_MEDIATYPE[m] ?? []))]
  return {
    text: s.text || undefined,
    srchIn: s.srchIn,
    sortType: s.sort,
    mediaType: mediaType.length ? mediaType : undefined,
    categories: s.categories.length ? s.categories : undefined,
    browseLang: s.langs.length ? s.langs : undefined,
    ble: s.langsMode === 'not' ? 'not' : undefined,
    minSize: s.minSize ?? undefined,
    maxSize: s.maxSize ?? undefined,
    unit: s.sizeUnit,
    dateRange: s.dateRange || undefined,
    startDate: s.startDate || undefined,
    endDate: s.endDate || undefined,
    flagsMode: s.flagsMode,
    flags: s.flags.length ? s.flags : undefined,
    authorID: s.authorID ?? undefined,
    narratorID: s.narratorID ?? undefined,
    seriesID: s.seriesID ?? undefined,
    uploader: s.uploader ?? (s.searchIn === 'mine' ? 'me' : undefined),
    state: s.searchType === 'active' ? 'seeded' : s.searchType === 'inactive' ? 'unseeded' : undefined,
    fl: s.searchType === 'fl' ? 'fl' : undefined,
    vip: s.searchType === 'VIP' ? 'vip' : s.searchType === 'nVIP' ? 'not' : undefined,
    bookmarked: s.searchIn === 'bookmarks' ? 'only' : undefined,
    rr: s.searchIn === 'allReseed' ? 'reseed' : s.searchIn === 'myReseed' ? 'myReseeds' : undefined,
    start: s.start || undefined,
    perPage: s.perpage,
    extra: hasExtra(s.extra) ? s.extra : undefined,
  }
}

function catName(id: number): string {
  for (const m of MAIN_CATS) for (const c of m.cats) if (c.id === id) return c.name
  return `cat ${id}`
}

/** Row cover in a fixed slot, with a large peek beside it while hovered. The
 * slot is square, so a cover of any shape fits without losing an edge. */
function RowCover({ t }: { t: SearchTorrent }) {
  const poster = t.poster_type ? coverUrl(t.id, t.poster_type) : null
  const shape = coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })
  const cover = (
    <a
      href={torrentUrl(t.id)}
      tabIndex={-1}
      aria-hidden
      className="flex h-[var(--cover-h)] items-center justify-center self-center text-[9px] md:h-[var(--cover-h-lg)]"
      style={{ '--cover-h': `${ROW_COVER_H_SM}px`, '--cover-h-lg': `${ROW_COVER_H}px` } as CSSProperties}
    >
      <Book
        poster={poster}
        title={t.title}
        shape={shape}
        frame="square"
        frameClassName="h-full items-center"
        plain
        className="transition-shadow group-hover:shadow-book-lift"
      />
    </a>
  )
  if (!poster) return cover
  return (
    <HoverCard>
      <HoverCardTrigger asChild delay={250} closeDelay={100}>{cover}</HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={16} className="w-[230px] rounded-none border-0 bg-transparent p-0 shadow-none">
        <span className="block rounded-[6px_10px_10px_6px] shadow-book-lift">
          <Book poster={poster} title={t.title} shape={shape} size="hero" className="rounded-[6px_10px_10px_6px]" />
        </span>
      </HoverCardContent>
    </HoverCard>
  )
}

/** Flip the local bookmark flag on the given rows. */
type BookmarkSetter = (ids: number[], bookmarked: boolean) => void

/** Drop rows once their bookmark is gone. Set only on the bookmarks list, where
 * an unbookmarked row has nothing left to sit under. */
type RowDropper = (ids: number[]) => void

/* Outline icon button, round and one size down from the bar controls. Pair with
 * Button variant="outline" size="icon" so the states come from the button. */
const ROW_ACTION =
  'size-[34px] rounded-full text-muted-foreground transition-[opacity,color,background-color,border-color] duration-200 ' +
  'hover:bg-primary hover:text-primary-foreground focus-visible:opacity-100'

/* Resting actions stay faintly visible: a row that hides what it can do is a
 * row nobody finds. Hover, focus and touch bring them to full strength. */
const ROW_ACTION_REST = 'opacity-40 group-hover:opacity-100 pointer-coarse:opacity-100'

/** Row bookmark toggle. Stays visible once bookmarked, so the state reads
 * without hovering the row first. */
function RowBookmark({ t, onBookmark, onRemoved }: { t: SearchTorrent; onBookmark: BookmarkSetter; onRemoved?: RowDropper }) {
  const [busy, setBusy] = useState(false)
  const on = !!t.bookmarked

  async function toggleBookmark() {
    setBusy(true)
    onBookmark([t.id], !on)
    try {
      await bookmarkOne(t.id, on ? 'delete' : 'add')
      if (on) onRemoved?.([t.id])
    } catch (e) {
      onBookmark([t.id], on)
      toast.error(e instanceof Error ? e.message : 'Bookmarking did not go through.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          disabled={busy}
          onClick={toggleBookmark}
          aria-label={on ? 'Remove bookmark' : 'Bookmark'}
          className={cn(ROW_ACTION, on ? 'bg-brand-soft text-brand dark:bg-brand-soft' : ROW_ACTION_REST)}
        >
          {on ? <BookmarkCheck className="size-[15px]" /> : <Bookmark className="size-[15px]" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{on ? 'Remove bookmark' : 'Bookmark'}</TooltipContent>
    </Tooltip>
  )
}

/** Stands in for the wedge button on a row where a wedge buys nothing, because
 * the torrent is free already. A dash is the table way of saying a cell has no
 * value, so the icon row stays even without a button that does nothing. */
function WedgeNotNeeded() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* The grid cell already carries the width of an action plus the height
            of the buttons beside it, so this only centers the glyph in it. */}
        <span aria-hidden className="grid place-items-center text-muted-foreground/40">
          <Minus className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>Free already, so a wedge adds nothing</TooltipContent>
    </Tooltip>
  )
}

/** Column tracks for one list, shared by the header and every row so nothing
 * shifts. Only from md up: narrow rows stack instead. */
function rowTracks(stats: number, lane: string, selectable?: boolean): string {
  return [selectable ? '28px' : '', '132px', 'minmax(0,1fr)', stats ? 'auto' : '', lane].filter(Boolean).join(' ')
}

/** Sort values behind a column header. Sorting lives where the numbers are, so
 * the bar needs no dropdown for the everyday cases. */
const COLUMN_SORTS: Record<string, { asc: string; desc: string }> = {
  title: { asc: 'titleAsc', desc: 'titleDesc' },
  size: { asc: 'sizeAsc', desc: 'sizeDesc' },
  peers: { asc: 'seedersAsc', desc: 'seedersDesc' },
  added: { asc: 'dateAsc', desc: 'dateDesc' },
}

function SortHead({ label, keyName, sort, onSort, align }: {
  label: string
  keyName: string
  sort: string
  onSort: (v: string) => void
  align?: 'right'
}) {
  const pair = COLUMN_SORTS[keyName]
  if (!pair) return <span className={align === 'right' ? 'text-right' : undefined}>{label}</span>
  const active = sort === pair.asc ? 'asc' : sort === pair.desc ? 'desc' : null
  const next = active === 'desc' ? pair.asc : pair.desc
  return (
    <Button
      variant="ghost"
      onClick={() => onSort(next)}
      aria-label={`Sort by ${label.toLowerCase()}`}
      className={cn(
        'group/sort h-auto gap-1 rounded-sm p-0 text-[10px] font-semibold whitespace-nowrap uppercase tracking-[0.08em] text-muted-foreground hover:bg-transparent hover:text-foreground',
        align === 'right' && 'justify-end',
        active && 'text-foreground'
      )}
    >
      {label}
      <SortMark active={active} />
    </Button>
  )
}

function SortMark({ active }: { active: 'asc' | 'desc' | null }) {
  if (active === 'desc') return <ArrowDown className="size-3" />
  if (active === 'asc') return <ArrowUp className="size-3" />
  return <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60" />
}

/** Names the number columns, so a reader does not have to guess what 2,015 / 3
 * means. Carries the sort the way the snatched list does. */
function ListHeader({ cols, lane, selectable, sort, onSort }: {
  cols: ColKey[]
  lane: string
  selectable?: boolean
  sort: string
  onSort: (v: string) => void
}) {
  const stats = LIST_COLUMNS.filter((c) => c.track && cols.includes(c.key))
  if (stats.length === 0) return null
  return (
    <div
      style={{ gridTemplateColumns: rowTracks(stats.length, lane, selectable) }}
      className="hidden gap-x-[18px] border-b bg-card px-6 py-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid"
    >
      {selectable && <span />}
      <span />
      <SortHead label="Title" keyName="title" sort={sort} onSort={onSort} />
      <div className="grid gap-x-[18px] text-right" style={{ gridTemplateColumns: stats.map((c) => c.track).join(' ') }}>
        {stats.map((c) => (
          <SortHead key={c.key} label={c.head ?? c.label} keyName={c.key} sort={sort} onSort={onSort} align="right" />
        ))}
      </div>
      <span />
    </div>
  )
}

function TorrentRow({ t, cols, onBookmark, onRemoved, onFreeleech, onIgnore, onUnignore, hiddenReason, selectable, checked, onCheck }: { t: SearchTorrent; cols: ColKey[]; onBookmark: BookmarkSetter; onRemoved?: RowDropper; onFreeleech?: (id: number) => void; onIgnore?: (t: SearchTorrent) => void; onUnignore?: (id: number) => void; hiddenReason?: HiddenReason | null; selectable?: boolean; checked?: boolean; onCheck?: (id: number, on: boolean) => void }) {
  const authors = parsePeople(t.author_info)
  const narrators = cols.includes('narrators') ? parsePeople(t.narrator_info) : []
  const series = cols.includes('series') ? parsePeople(t.series_info) : []
  const stats = LIST_COLUMNS.filter((c) => c.track && cols.includes(c.key))
  // Every action this list can show gets a slot, whether or not this row uses it.
  const actionSlots = 2 + (onFreeleech ? 1 : 0) + (onIgnore ? 1 : 0)
  const lane = actionLane(actionSlots)
  // Narrow, a row is a cover beside a title with the numbers folded underneath;
  // the full set of columns only fits from md up.
  const wide = rowTracks(stats.length, 'var(--lane)', selectable)
  return (
    <div
      style={{ '--lane': lane, '--row-cols': wide } as CSSProperties}
      className={cn(
        'group grid items-start gap-x-[18px] gap-y-2.5 px-6 py-3.5 transition-colors hover:bg-brand-soft/25',
        selectable ? 'grid-cols-[28px_96px_minmax(0,1fr)]' : 'grid-cols-[96px_minmax(0,1fr)]',
        'md:[grid-template-columns:var(--row-cols)]',
        hiddenReason && 'opacity-60'
      )}
    >
      {selectable && (
        <Checkbox
          checked={!!checked}
          onCheckedChange={(v) => onCheck?.(t.id, !!v)}
          aria-label={`Select ${t.title}`}
          className="justify-self-center"
        />
      )}
      <RowCover t={t} />
      {/* Tags sit outside the row link: a link inside a link is invalid. */}
      <div className="min-w-0">
        <a href={torrentUrl(t.id)} className="block min-w-0">
          <h3 className="font-display text-[15px] font-medium leading-[1.3] transition-colors group-hover:text-brand">{t.title}</h3>
          {(authors.length > 0 || narrators.length > 0 || series.length > 0) && (
            <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
              {authors.map((a) => a.name).join(', ')}
              {narrators.length > 0 && (
                <span className="text-muted-foreground">
                  {authors.length > 0 && ' · '}read by {narrators.map((n) => n.name).join(', ')}
                </span>
              )}
              {series.length > 0 && (
                <span className="italic text-muted-foreground">
                  {(authors.length > 0 || narrators.length > 0) && ' · '}
                  {series.map((s) => s.name + (s.part ? ` #${s.part}` : '')).join(', ')}
                </span>
              )}
            </p>
          )}
          <span className="mt-1.5 flex flex-wrap items-center gap-1">
            {t.vip === 1 && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
            {(t.free === 1 || t.personal_freeleech === 1) && <Badge className="bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>}
            {t.my_snatched === 1 && <Badge variant="secondary">Snatched</Badge>}
            <Badge variant="outline">{t.catname || catName(t.category)}</Badge>
            {t.lang_code && t.lang_code !== 'ENG' && <Badge variant="outline">{t.lang_code}</Badge>}
          </span>
        </a>
        <TagLinks raw={t.tags} limit={ROW_TAG_LIMIT} className="mt-1.5 text-[11px] text-muted-foreground" />
      </div>
      {stats.length > 0 && (
        <div
          /* pt lands the numbers on the title's cap line, so a row reads as one
             horizontal line instead of a block floating below the title. */
          className="col-span-full flex flex-wrap items-baseline gap-x-4 gap-y-1 tabular-nums md:col-span-1 md:grid md:gap-x-[18px] md:pt-[3px] md:text-right"
          style={{ gridTemplateColumns: stats.map((c) => c.track).join(' ') }}
        >
          {cols.includes('filetype') && (
            <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
              {t.filetype?.split(' ')[0] ?? '–'}
            </span>
          )}
          {cols.includes('size') && (
            <span className="font-mono text-[12.5px] text-muted-foreground">
              {t.size}
              <span className="block font-sans text-[11px] text-muted-foreground">{fmtInt(t.numfiles)} file{t.numfiles === 1 ? '' : 's'}</span>
            </span>
          )}
          {cols.includes('peers') && (
            <span className="font-mono text-[12.5px]">
              <span className="text-ok" title="Seeders">{fmtInt(t.seeders)}</span>
              <span className="text-muted-foreground/60"> / </span>
              <span className="text-warn" title="Leechers">{fmtInt(t.leechers)}</span>
              <span className="block font-sans text-[11px] text-muted-foreground" title="Times snatched">{fmtInt(t.times_completed)} snatched</span>
            </span>
          )}
          {cols.includes('added') && (
            <span className="font-mono text-[12px] text-muted-foreground" title={utcTitle(t.added)}>{relTime(t.added)}</span>
          )}
        </div>
      )}
      {hiddenReason === 'ignored' && onUnignore ? (
        <div className="col-span-full flex items-center justify-end gap-1.5 md:col-span-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                aria-label="Show this torrent again"
                onClick={() => onUnignore(t.id)}
                className={ROW_ACTION}
              >
                <Undo2 className="size-[15px]" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Show this torrent again</TooltipContent>
          </Tooltip>
        </div>
      ) : (
        /* One cell per action the list can show, so an icon keeps its place
           down the column even where a row has nothing to put in it. */
        <div className="col-span-full grid justify-end gap-1.5 md:col-span-1" style={{ gridTemplateColumns: `repeat(${actionSlots}, ${ROW_ACTION_SIZE}px)` }}>
          <RowBookmark t={t} onBookmark={onBookmark} onRemoved={onRemoved} />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild variant="outline" size="icon" className={cn(ROW_ACTION, ROW_ACTION_REST)}>
                <a href={downloadUrl(t.id)} aria-label="Download .torrent">
                  <Download className="size-[15px]" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>Download .torrent</TooltipContent>
          </Tooltip>
          {onFreeleech &&
            (wedgeHelps(t) ? (
              <WedgeRowButton
                target={{ id: t.id, title: t.title, size: t.size }}
                onDone={() => onFreeleech(t.id)}
                className={cn(ROW_ACTION, ROW_ACTION_REST)}
              />
            ) : (
              <WedgeNotNeeded />
            ))}
          {onIgnore && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Ignore this torrent"
                  onClick={() => onIgnore(t)}
                  className={cn(ROW_ACTION, ROW_ACTION_REST)}
                >
                  <EyeOff className="size-[15px]" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Ignore this torrent</TooltipContent>
            </Tooltip>
          )}
        </div>
      )}
    </div>
  )
}

function GalleryItem({ t, hiddenReason, onUnignore }: { t: SearchTorrent; hiddenReason?: HiddenReason | null; onUnignore?: (id: number) => void }) {
  const authors = parsePeople(t.author_info)
  const authorsText = authors.map((a) => a.name).join(', ')
  return (
    <span className={cn('relative block', hiddenReason && 'opacity-60')}>
      <a href={torrentUrl(t.id)} className="group block">
        {/* One shelf line: every frame is the same book shape, so the covers
            rest on one floor and every title starts level. Whatever shape a
            cover turns out to be, it keeps it and takes the room it needs. */}
        <span className="flex justify-center text-[11px] transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 motion-reduce:transition-none">
          <Book
            poster={t.poster_type ? coverUrl(t.id, t.poster_type) : null}
            title={t.title}
            author={authorsText || undefined}
            shape={coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })}
            frame="portrait"
            frameClassName="w-[min(100%,calc(var(--shelf)*2/3))]"
            size="shelf"
            className="group-hover:shadow-book-lift"
          >
            {!!t.bookmarked && (
              <span
                role="img"
                aria-label="Bookmarked"
                className="absolute right-1.5 top-1.5 z-3 grid size-[22px] place-items-center rounded-full bg-card/90 text-brand shadow-sm"
              >
                <BookmarkCheck className="size-[13px]" />
              </span>
            )}
          </Book>
        </span>
        <span className="font-display mt-2.5 line-clamp-2 min-h-[2.7em] text-[13px] font-medium leading-[1.35]">{t.title}</span>
        {authorsText && <span className="mt-0.5 line-clamp-1 text-[11.5px] text-muted-foreground">{authorsText}</span>}
      </a>
      {hiddenReason === 'ignored' && onUnignore && (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => onUnignore(t.id)}
          className="absolute left-1.5 top-1.5 z-3 h-7 gap-1 rounded-full bg-card/90 px-2 text-[11px] shadow-sm hover:text-brand"
        >
          <Undo2 className="size-3" /> Unignore
        </Button>
      )}
    </span>
  )
}


const MENU_GROUP_LABEL = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'

const BOOKMARK_CLEANUPS = [
  { type: 'seedCom', menu: 'Remove seeded to requirements', title: 'Seeded to requirements', question: 'Remove every bookmark you have seeded to requirements?' },
  { type: 'seedAll', menu: 'Remove fully downloaded ones', title: 'Fully downloaded', question: 'Remove every bookmark you have downloaded in full?' },
  { type: 'dl', menu: 'Remove any you have had active', title: 'Ever been active', question: 'Remove every bookmark you have started to download?' },
  { type: 'all', menu: 'Remove all bookmarks', title: 'All bookmarks', question: 'Remove every bookmark you have?' },
] as const satisfies readonly { type: BookmarkCleanup; menu: string; title: string; question: string }[]

/** Sits level with the view toggle, so it stays in reach however many rows are
 * loaded. The top group covers the rows on screen; on the bookmarks list a
 * second group reaches the whole list, which is why they are kept apart. */
function ResultActions({
  items, bookmarksView, onBookmark, onRemoved, onCleaned, copySlot, cols, onToggleCol,
}: {
  items: SearchTorrent[]
  bookmarksView: boolean
  onBookmark: BookmarkSetter
  onRemoved?: RowDropper
  onCleaned: (type: BookmarkCleanup, removed: number) => void
  /** Copy-as-text, folded in so the bar keeps one menu instead of two buttons. */
  copySlot?: React.ReactNode
  /** Column visibility, when the list view is showing. */
  cols?: ColKey[]
  onToggleCol?: (k: ColKey) => void
}) {
  const [busy, setBusy] = useState(false)
  const [confirmShown, setConfirmShown] = useState(false)
  const [pending, setPending] = useState<(typeof BOOKMARK_CLEANUPS)[number] | null>(null)
  const toAdd = useMemo(() => items.filter((t) => !t.bookmarked).map((t) => t.id), [items])
  const toRemove = useMemo(() => items.filter((t) => t.bookmarked).map((t) => t.id), [items])
  const zipIds = useMemo(() => items.slice(0, ZIP_BATCH_MAX).map((t) => t.id), [items])
  const capped = items.length > ZIP_BATCH_MAX

  async function run(action: 'add' | 'remove', ids: number[]) {
    setBusy(true)
    onBookmark(ids, action === 'add')
    try {
      await bookmarkMass(ids, action)
      if (action === 'remove') onRemoved?.(ids)
      toast.success(action === 'add' ? `Bookmarked ${plural(ids.length, 'torrent')}` : `Removed ${plural(ids.length, 'bookmark')}`)
    } catch (e) {
      // Large runs go out in batches, so keep whatever already landed.
      const landed = new Set(e instanceof BookmarkMassError ? e.applied : [])
      onBookmark(ids.filter((id) => !landed.has(id)), action !== 'add')
      if (action === 'remove' && landed.size > 0) onRemoved?.([...landed])
      toast.error(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  async function clean(type: BookmarkCleanup) {
    setBusy(true)
    try {
      const changes = await bookmarkCleanup(type)
      toast.success(changes > 0 ? `Removed ${plural(changes, 'bookmark')}` : 'Nothing matched, so nothing changed')
      if (changes > 0) onCleaned(type, changes)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  function zip() {
    downloadZipOf(zipIds)
    toast.success(`Zipping ${plural(zipIds.length, 'torrent')}`, { description: 'MAM builds the file, your browser takes it from there.' })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={busy} className={TRIGGER}>
            {busy && <Loader2 className="size-3.5 animate-spin" />}
            Actions
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[264px]">
          {bookmarksView && <DropdownMenuLabel className={MENU_GROUP_LABEL}>Shown here</DropdownMenuLabel>}
          <DropdownMenuGroup>
            {/* The count belongs in the sentence: a number parked on the right
                reads as a keyboard shortcut. */}
            <DropdownMenuItem disabled={toAdd.length === 0} onClick={() => void run('add', toAdd)}>
              <Bookmark />
              {toAdd.length === 0 ? 'Everything here is bookmarked' : `Bookmark these ${fmtInt(toAdd.length)}`}
            </DropdownMenuItem>
            {toRemove.length > 0 && (
              <DropdownMenuItem onClick={() => setConfirmShown(true)}>
                <BookmarkX />
                Remove {plural(toRemove.length, 'bookmark')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={zip}>
              <FileArchive />
              {capped ? `Download the first ${fmtInt(ZIP_BATCH_MAX)} as .zip` : `Download ${fmtInt(zipIds.length)} as .zip`}
            </DropdownMenuItem>
            {copySlot}
          </DropdownMenuGroup>
          {cols && onToggleCol && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={MENU_GROUP_LABEL}>Columns</DropdownMenuLabel>
              <DropdownMenuGroup>
                {LIST_COLUMNS.map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={cols.includes(c.key)}
                    onCheckedChange={() => onToggleCol(c.key)}
                    closeOnClick={false}
                  >
                    {c.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
          {bookmarksView && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className={MENU_GROUP_LABEL}>Whole bookmark list</DropdownMenuLabel>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <a href={BOOKMARKS_ZIP_URL}>
                    <FileArchive />
                    Download all as .zip
                  </a>
                </DropdownMenuItem>
                {BOOKMARK_CLEANUPS.map((c) => (
                  <DropdownMenuItem key={c.type} variant="destructive" onClick={() => setPending(c)}>
                    <Trash2 />
                    {c.menu}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuGroup>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmShown} onOpenChange={setConfirmShown}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {plural(toRemove.length, 'bookmark')}?</AlertDialogTitle>
            <AlertDialogDescription>
              Every bookmarked torrent shown here drops out of your bookmarks. You can bookmark them again later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => void run('remove', toRemove)}>Remove them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pending?.title}</AlertDialogTitle>
            <AlertDialogDescription>{pending?.question} You can bookmark them again later.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep them</AlertDialogCancel>
            <AlertDialogAction onClick={() => pending && void clean(pending.type)}>Remove them</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/** Same joined-segment language as every other switch on a bar, so the list and
 * gallery choice reads as one control. */
function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const item = 'h-8 w-9 px-0 text-muted-foreground data-pressed:bg-brand-soft data-pressed:text-accent-foreground'
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      aria-label="Result layout"
      value={view}
      onValueChange={(v) => v && onChange(v as ViewMode)}
    >
      <ToggleGroupItem value="list" aria-label="List view" title="List view" className={item}>
        <AlignJustify className="size-[15px]" />
      </ToggleGroupItem>
      <ToggleGroupItem value="grid" aria-label="Gallery view" title="Gallery view" className={item}>
        <LayoutGrid className="size-[15px]" />
      </ToggleGroupItem>
    </ToggleGroup>
  )
}

export function BrowseView(props: PageProps) {
  const [state, setState] = useState<BrowseState>(() => initialState(props.page.user.uid != null ? String(props.page.user.uid) : null))
  const [items, setItems] = useState<SearchTorrent[]>([])
  const [found, setFound] = useState(0)
  const [baseStart, setBaseStart] = useState(state.start)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>(() => {
    try {
      return localStorage.getItem(BROWSE_VIEW_KEY) === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const [cols, setCols] = useState<ColKey[]>(readCols)
  const seq = useRef(0)
  // The rows on screen plus where they start, readable from inside a search
  // that was created once and never sees fresh state.
  const shownRef = useRef<SearchTorrent[]>([])
  const baseStartRef = useRef(state.start)
  // Rows this list dropped by itself, for as long as the endpoint keeps
  // answering with them.
  const dropped = useRef<Set<number>>(new Set())
  const [hideSnatched, setHideSnatched] = useFeature('hideSnatched')
  const [ignoreOn] = useFeature('ignoreAction')
  const [seriesViewOn] = useFeature('seriesView')
  const [seriesBulkOn] = useFeature('seriesBulk')
  const ignored = useIgnoredTorrents()
  const [showHidden, setShowHidden] = useState(false)
  // Selection for the series bulk actions, cleared on every new search so a
  // stale id never reaches an action.
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [nonePartsOpen, setNonePartsOpen] = useState(false)

  // With the bulk actions off there is nothing to act on, so nothing may stay
  // selected behind the scenes either.
  useEffect(() => {
    if (!seriesBulkOn) setSelected(new Set())
  }, [seriesBulkOn])

  const toggleSelect = useCallback((id: number, on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  const toggleGroupSelect = useCallback((ids: number[], on: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) {
        if (on) next.add(id)
        else next.delete(id)
      }
      return next
    })
  }, [])

  const setViewMode = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem(BROWSE_VIEW_KEY, v)
    } catch {
      // storage may be unavailable
    }
  }

  const toggleCol = (k: ColKey) => {
    setCols((prev) => {
      const next = ALL_COLS.filter((key) => (key === k ? !prev.includes(key) : prev.includes(key)))
      try {
        localStorage.setItem(BROWSE_COLS_KEY, JSON.stringify(next))
      } catch {
        // storage may be unavailable
      }
      return next
    })
  }

  const run = useCallback(async (s: BrowseState, opts: { append?: boolean; push?: boolean; take?: number } = {}) => {
    const { append = false, push = true, take } = opts
    // A series loads whole from row 0, so an offset riding in on the URL must
    // not skew the shown count.
    const q = s.seriesID && s.start !== 0 ? { ...s, start: 0 } : s
    const mine = ++seq.current
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setItems([])
      setSelected(new Set())
    }
    setError(null)
    // A chosen search gets its own history entry so Back steps through
    // searches; loading more only refreshes the offset in the current one.
    if (push) {
      if (append) history.replaceState(null, '', urlFromState(q))
      else history.pushState(null, '', urlFromState(q))
    }
    try {
      const res = q.seriesID
        ? await searchAllTorrents2(toQuery2(q))
        : await searchTorrents2(take ? { ...toQuery2(q), perPage: take } : toQuery2(q))
      if (seq.current !== mine) return
      if (append) {
        // Removing a bookmark takes its row out of this list at once while the
        // endpoint keeps answering with it for a while, so a batch can repeat
        // rows that are already here or rows that just left. Both are dropped,
        // then the total gives up whatever it was still counting.
        const seen = new Set(shownRef.current.map((t) => t.id))
        const fresh = res.data.filter((t) => !seen.has(t.id) && !dropped.current.has(t.id))
        // Rows this list dropped that the endpoint still hands out are rows the
        // total is still counting, so they come off it.
        const ghosts = res.data.filter((t) => dropped.current.has(t.id)).length
        const held = baseStartRef.current + shownRef.current.length + fresh.length
        setItems((prev) => [...prev, ...fresh])
        // A batch that brings nothing new is the end of what this list can
        // reach, whatever the endpoint keeps promising.
        const spent = fresh.length === 0 && res.data.length > 0
        setFound(spent ? held : Math.max(held, res.found - ghosts))
      } else {
        dropped.current.clear()
        setFound(res.found)
        setItems(res.data)
        setBaseStart(q.start)
        baseStartRef.current = q.start
      }
      // A restored list holds more rows than the offset it was asked for, so
      // the state plus the address bar move to where those rows actually end.
      if (take != null) {
        const settled = { ...q, start: Math.max(0, res.data.length - q.perpage) }
        setState(settled)
        history.replaceState(null, '', urlFromState(settled))
      }
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      if (seq.current === mine) {
        setLoading(false)
        setLoadingMore(false)
      }
    }
  }, [])

  useEffect(() => {
    shownRef.current = items
  }, [items])

  useEffect(() => {
    baseStartRef.current = baseStart
  }, [baseStart])

  useEffect(() => {
    const first = restored(state)
    void run(first.state, { push: false, take: first.take })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Back and Forward walk the pushed search entries; the URL is the state.
  useEffect(() => {
    const uid = props.page.user.uid != null ? String(props.page.user.uid) : null
    const onPop = () => {
      const s = initialState(uid)
      setState(s)
      const back = restored(s)
      setBaseStart(back.state.start)
      void run(back.state, { push: false, take: back.take })
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [props.page.user.uid, run])

  const apply = (patch: Partial<BrowseState>) => {
    const next = { ...state, ...patch, start: 0 }
    setState(next)
    if (next.searchIn === 'torrents' && !next.uploader) writeSticky(stickyOf(next))
    void run(next)
  }

  /** Size bounds commit on blur or Enter, so typing does not fire searches. */
  const commitSize = (which: 'min' | 'max', raw: string) => {
    const n = Number(raw)
    const value = raw.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null
    const current = which === 'min' ? state.minSize : state.maxSize
    if (value === current) return
    apply(which === 'min' ? { minSize: value } : { maxSize: value })
  }

  const setBookmarked = useCallback((ids: number[], bookmarked: boolean) => {
    const hit = new Set(ids)
    setItems((prev) => prev.map((t) => (hit.has(t.id) ? { ...t, bookmarked: bookmarked ? t.bookmarked ?? 1 : null } : t)))
  }, [])

  /** A spent wedge makes that torrent personal freeleech, so the row picks up
   * the badge and drops its wedge action. */
  const setPersonalFreeleech = useCallback((id: number) => {
    setItems((prev) => prev.map((t) => (t.id === id ? { ...t, personal_freeleech: 1, fl_vip: 1 } : t)))
  }, [])

  // ids always come from the rendered list, so their count is what leaves it.
  const dropRows = useCallback((ids: number[]) => {
    const hit = new Set(ids)
    for (const id of ids) dropped.current.add(id)
    setItems((prev) => prev.filter((t) => !hit.has(t.id)))
    setFound((n) => Math.max(0, n - ids.length))
  }, [])

  const clearList = useCallback(() => {
    dropped.current.clear()
    setItems([])
    setFound(0)
  }, [])

  /** A cleanup reports how many bookmarks it dropped, so refetch until the total
   * agrees rather than trusting the first answer. */
  const refreshAfterCleanup = useCallback(async (removed: number) => {
    const target = Math.max(0, found - removed)
    const next = { ...state, start: 0 }
    const mine = ++seq.current
    setLoading(true)
    for (let attempt = 1; attempt <= REFRESH_POLL_TRIES; attempt += 1) {
      try {
        const res = await searchTorrents2(toQuery2(next))
        if (seq.current !== mine) return
        if (res.found <= target || attempt === REFRESH_POLL_TRIES) {
          dropped.current.clear()
          setState(next)
          setItems(res.data)
          setFound(res.found)
          setBaseStart(0)
          baseStartRef.current = 0
          setLoading(false)
          history.replaceState(null, '', urlFromState(next))
          return
        }
      } catch {
        setLoading(false)
        return
      }
      await new Promise((r) => window.setTimeout(r, REFRESH_POLL_MS))
    }
  }, [found, state])

  // Counted from what is on screen rather than from the last offset, so a
  // restored list carries on where it ended plus a failed batch can be retried.
  const loadMore = () => {
    const next = { ...state, start: baseStart + items.length }
    setState(next)
    void run(next, { append: true })
  }

  const [rolling, setRolling] = useState(false)
  // The search-in fields appear once someone is actually searching.
  const [searchFocus, setSearchFocus] = useState(false)

  /** Opens a random torrent inside the active filters. */
  async function randomBook() {
    setRolling(true)
    try {
      const probe = await searchTorrents2({ ...toQuery2(state), perPage: 1, start: 0 })
      if (!probe.found) {
        toast.warning('Nothing to pick from with these filters.')
        return
      }
      const offset = Math.floor(Math.random() * probe.found)
      const res = await searchTorrents2({ ...toQuery2(state), perPage: 1, start: offset })
      const hit = res.data[0]
      if (hit) location.assign(torrentUrl(hit.id))
      else toast.error('That roll came up empty. Try again.')
    } catch {
      toast.error('Could not pick a random book.')
    } finally {
      setRolling(false)
    }
  }


  const dropOnUnbookmark = state.searchIn === 'bookmarks' ? dropRows : undefined

  /** Ignore wins over hide-snatched, so a row is counted once. */
  const hiddenReason = useCallback(
    (t: SearchTorrent): HiddenReason | null =>
      ignored.has(t.id) ? 'ignored' : hideSnatched && t.my_snatched === 1 ? 'snatched' : null,
    [ignored, hideSnatched]
  )
  const shownItems = useMemo(
    () => (showHidden ? items : items.filter((t) => !hiddenReason(t))),
    [items, showHidden, hiddenReason]
  )
  const hiddenIgnored = items.filter((t) => hiddenReason(t) === 'ignored').length
  const hiddenSnatched = items.filter((t) => hiddenReason(t) === 'snatched').length
  const hiddenCount = hiddenIgnored + hiddenSnatched
  const hiddenParts = [
    hiddenSnatched > 0 ? `${fmtInt(hiddenSnatched)} snatched` : null,
    hiddenIgnored > 0 ? `${fmtInt(hiddenIgnored)} ignored` : null,
  ].filter(Boolean).join(', ')

  const ignoreTorrent = (t: SearchTorrent) => {
    ignored.add({ id: t.id, title: t.title ?? null })
    toast(`Ignored ${t.title ?? `#${t.id}`}`, {
      action: { label: 'Undo', onClick: () => ignored.remove(t.id) },
      duration: IGNORE_TOAST_MS,
    })
  }

  const from = items.length === 0 ? 0 : baseStart + 1
  const to = Math.min(found, baseStart + items.length)
  const remaining = Math.max(0, found - to)
  const sizeActive = state.minSize !== null || state.maxSize !== null
  const uploaderMode = state.uploader != null
  // The endpoint names the owner on every row, which labels the chip.
  const uploaderName = uploaderMode && state.uploader !== 'else' ? items.find((t) => t.owner_name)?.owner_name ?? null : null
  const effectiveSort = uploaderMode && state.sort === 'default' ? 'dateDesc' : state.sort
  const genres = useCategories2()
  const genreName = (id: number) => genres?.find((c) => c.id === id)?.name ?? `#${id}`
  // The genre list narrows along with the media-type tabs.
  const activeMediaTypes = new Set(state.mainCat.flatMap((m) => MAINCAT_TO_MEDIATYPE[m] ?? []))
  const genreOptions = (genres ?? []).filter(
    (c) => activeMediaTypes.size === 0 || c.mediaTypes.some((m) => activeMediaTypes.has(m))
  )
  const sizeUnitLabel = SIZE_UNITS.find((u) => u.value === state.sizeUnit)?.label ?? ''
  const sizeChipLabel =
    state.minSize !== null && state.maxSize !== null
      ? `${fmtInt(state.minSize)}-${fmtInt(state.maxSize)} ${sizeUnitLabel}`
      : state.minSize !== null
        ? `≥ ${fmtInt(state.minSize)} ${sizeUnitLabel}`
        : `≤ ${fmtInt(state.maxSize ?? 0)} ${sizeUnitLabel}`
  // Entity filters only carry an id in the URL; the matching name is inside the
  // results themselves (author_info maps id to name).
  const entityName = (kind: 'author' | 'narrator' | 'series', id: number): string | null => {
    for (const t of items) {
      const info = kind === 'author' ? t.author_info : kind === 'narrator' ? t.narrator_info : t.series_info
      const hit = parsePeople(info).find((p) => p.id === String(id))
      if (hit) return hit.name
    }
    return null
  }
  const entityChip = (kind: 'author' | 'narrator' | 'series', id: number | null, onRemove: () => void) =>
    id == null
      ? []
      : [{
          key: `${kind}${id}`,
          label: `${kind[0].toUpperCase()}${kind.slice(1)}: ${entityName(kind, id) ?? `#${id}`}`,
          onRemove,
        }]

  // Grouping computes from items, not shownItems: the progress header keeps
  // counting snatched parts while the hide-snatched filter empties the list.
  const seriesGroups = useMemo(
    () => (state.seriesID && seriesViewOn ? groupBySeries(items, state.seriesID) : []),
    [items, state.seriesID, seriesViewOn]
  )
  const firstRange = seriesGroups.find((g) => g.kind === 'range')?.key
  const groupRows = (g: SeriesGroup) => (showHidden ? g.rows : g.rows.filter((t) => !hiddenReason(t)))
  // entityName JSON-parses every row it scans and the view rerenders per
  // keystroke, which at a whole series is real work.
  const seriesName = useMemo(
    () => (state.seriesID ? entityName('series', state.seriesID) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, state.seriesID]
  )

  // Acting ids come from the rendered rows, so an id that left the list can
  // never reach an action.
  const selectedIds = useMemo(
    () => items.filter((t) => selected.has(t.id)).map((t) => t.id),
    [items, selected]
  )
  const wedgeTargets = useMemo(
    () => items.filter((t) => selected.has(t.id) && wedgeHelps(t)).map((t) => ({ id: t.id, title: t.title, size: t.size })),
    [items, selected]
  )
  const [barBusy, setBarBusy] = useState(false)

  async function bookmarkSelected() {
    setBarBusy(true)
    setBookmarked(selectedIds, true)
    try {
      await bookmarkMass(selectedIds, 'add')
      toast.success(`Bookmarked ${plural(selectedIds.length, 'torrent')}`)
    } catch (e) {
      const landed = new Set(e instanceof BookmarkMassError ? e.applied : [])
      setBookmarked(selectedIds.filter((id) => !landed.has(id)), false)
      toast.error(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBarBusy(false)
    }
  }

  function zipSelected() {
    downloadZipOf(selectedIds)
    toast.success(`Zipping ${plural(Math.min(selectedIds.length, ZIP_BATCH_MAX), 'torrent')}`, {
      description: 'MAM builds the file, your browser takes it from there.',
    })
  }

  /** Every landed id turns personal freeleech and leaves the selection. */
  const onBatchFreeleech = useCallback((ids: number[]) => {
    const hit = new Set(ids)
    setItems((prev) => prev.map((t) => (hit.has(t.id) ? { ...t, personal_freeleech: 1, fl_vip: 1 } : t)))
    setSelected((prev) => {
      const next = new Set(prev)
      for (const id of ids) next.delete(id)
      return next
    })
  }, [])

  // A chip for every choice whose value cannot be read off the bar itself.
  // Nothing may narrow the list from a place the reader cannot see. A value
  // shown twice reads as two filters, so what a control already spells out
  // stays out of here. Clear all only appears once a chip does.
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...(state.uploader
      ? [{
          key: 'uploader',
          label: state.uploader === 'else' ? 'Not my uploads' : `Uploads by ${uploaderName ?? `member ${state.uploader.slice(1)}`}`,
          onRemove: () => apply({ uploader: null }),
        }]
      : []),
    ...entityChip('author', state.authorID, () => apply({ authorID: null })),
    ...entityChip('narrator', state.narratorID, () => apply({ narratorID: null })),
    ...entityChip('series', state.seriesID, () => apply({ seriesID: null })),
    ...state.categories.map((c) => ({
      key: `g${c}`,
      label: genreName(c),
      onRemove: () => apply({ categories: toggleValue(state.categories, c) }),
    })),
    ...(sizeActive
      ? [{ key: 'size', label: sizeChipLabel, onRemove: () => apply({ minSize: null, maxSize: null }) }]
      : []),
    ...state.flags.map((f) => {
      const name = CONTENT_FLAGS.find((x) => x.bit === f)?.name ?? String(f)
      return {
        key: `f${f}`,
        label: state.flagsMode === 0 ? `no ${name}` : `${name} only`,
        onRemove: () => apply({ flags: toggleValue(state.flags, f) }),
      }
    }),
    ...state.langs.map((l) => {
      const name = LANGUAGES.find((x) => x.id === l)?.name ?? String(l)
      return {
        key: `l${l}`,
        label: state.langsMode === 'not' ? `not ${name}` : name,
        onRemove: () => apply({ langs: toggleValue(state.langs, l) }),
      }
    }),
    // Blob fields no control on this bar covers, carried in from a link.
    ...(hasExtra(state.extra)
      ? [{ key: 'extra', label: 'Filters from the link', onRemove: () => apply({ extra: EMPTY_EXTRA }) }]
      : []),
  ]

  return (
    <div className="grid gap-4">
      {/* The count lives on the list itself, so the subtitle only says what this
          page is looking at. */}
      <PageHeader
        title={uploaderMode ? 'Uploads' : SEARCH_IN_TITLES[state.searchIn]}
        sub={loading ? 'Searching…' : state.text ? `Results for “${state.text}”` : chips.length ? undefined : `${fmtInt(found)} torrents`}
      />

      <FilterBar>
        {/* Rolling a random book is a way of searching, so it sits with the
            search field rather than beside the page title. */}
        <FilterRow className="gap-2">
          <FilterSearch
            className="flex-1"
            value={state.text}
            onChange={(v) => setState((s) => ({ ...s, text: v }))}
            onFocus={() => setSearchFocus(true)}
            onSubmit={() => apply({})}
            placeholder={uploaderMode ? 'Search titles and authors in these uploads…' : 'Search titles, authors, narrators, series…'}
          />
        </FilterRow>

        {!uploaderMode && (state.text.length > 0 || searchFocus) && (
        <FilterRow className="gap-1.5">
          <FilterHint>in</FilterHint>
          <FilterSegments
            type="multiple"
            ariaLabel="Search in"
            options={SRCH_FIELDS.map(([value, label]) => ({ value, label }))}
            value={state.srchIn}
            onChange={(v) => apply({ srchIn: v as SrchField[] })}
          />
        </FilterRow>
        )}

        {uploaderMode ? null : (
        <>
        <FilterRow>
          <FilterSegments
            type="multiple"
            ariaLabel="Media type"
            options={MAIN_CATS.map((m) => ({ value: String(m.id), label: m.name }))}
            value={state.mainCat.map(String)}
            onChange={(v) => apply({ mainCat: v.map(Number) })}
          />
        </FilterRow>

        {/* One control per dimension, each naming what it holds. The two on the
            left pick which list you are in; the facets narrow it. */}
        <FilterRow>
          <FilterSelect
            value={state.searchIn}
            onChange={(v) => apply({ searchIn: v as BrowseState['searchIn'] })}
            options={SEARCH_INS.map(([value, label]) => ({ value, label }))}
            ariaLabel="Which list to search"
          />
          <FilterSelect
            value={state.searchType}
            onChange={(v) => apply({ searchType: v as BrowseState['searchType'] })}
            options={SEARCH_TYPES.map(([value, label]) => ({ value, label }))}
            ariaLabel="Which torrents to show"
          />

          <FilterFacet label="Genres" count={state.categories.length} width="w-72">
            {genres === null ? (
              <div className="grid gap-1.5 p-3">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-4/5" />
              </div>
            ) : (
              <FacetOptions
                options={genreOptions.map((c) => ({ value: String(c.id), label: c.name }))}
                selected={state.categories.map(String)}
                onToggle={(v) => apply({ categories: toggleValue(state.categories, Number(v)) })}
                onClear={() => apply({ categories: [] })}
                searchable
                searchPlaceholder="Filter genres…"
                emptyText="No genre found."
                maxHeight="max-h-72"
              />
            )}
            <p className="border-t px-2.5 py-2 text-[11.5px] text-muted-foreground">
              Older torrents without a genre stay out of these results.
            </p>
          </FilterFacet>

          <FilterFacet label="Languages" count={state.langs.length} width="w-64">
            <FacetMode
              value={state.langsMode}
              onChange={(v) => apply({ langsMode: v as BrowseState['langsMode'] })}
              options={[{ value: 'has', label: 'Include' }, { value: 'not', label: 'Exclude' }]}
              ariaLabel="Include or exclude these languages"
            />
            <FacetOptions
              options={LANGUAGES.map((l) => ({ value: String(l.id), label: l.name }))}
              selected={state.langs.map(String)}
              onToggle={(v) => apply({ langs: toggleValue(state.langs, Number(v)) })}
              onClear={() => apply({ langs: [] })}
              searchable
              searchPlaceholder="Filter languages…"
              emptyText="No language found."
            />
          </FilterFacet>

          {/* Each filter names itself on the bar. One drawer holding four of
              them hid what a search was doing behind a scrollbar. */}
          <FilterSelect
            value={state.dateRange || 'any'}
            onChange={(v) => (v === 'any' ? apply({ dateRange: '', startDate: '', endDate: '' }) : apply({ dateRange: v as BrowseState['dateRange'] }))}
            options={DATE_RANGES.map((d) => ({ value: d.value || 'any', label: d.label }))}
            ariaLabel="Added within"
          />
          {state.dateRange === 'custom' && (
            <FilterDateRange
              from={state.startDate}
              to={state.endDate}
              onChange={(startDate, endDate) => apply({ startDate, endDate })}
              ariaLabel="Added between"
              placeholder="Pick the days"
            />
          )}

          <FilterFacet label="Size" count={sizeActive ? 1 : 0} width="w-auto">
            <div className="flex items-center gap-2 p-2.5">
              <Input
                key={`min${state.minSize ?? ''}`}
                type="number"
                min={0}
                defaultValue={state.minSize ?? ''}
                placeholder="Min"
                aria-label="Minimum size"
                className="h-8 w-20 text-[12.5px]"
                onBlur={(e) => commitSize('min', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              <span className="text-[12px] text-muted-foreground">to</span>
              <Input
                key={`max${state.maxSize ?? ''}`}
                type="number"
                min={0}
                defaultValue={state.maxSize ?? ''}
                placeholder="Max"
                aria-label="Maximum size"
                className="h-8 w-20 text-[12.5px]"
                onBlur={(e) => commitSize('max', e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') e.currentTarget.blur()
                }}
              />
              <FilterSelect
                value={String(state.sizeUnit)}
                onChange={(v) => apply({ sizeUnit: Number(v) })}
                options={SIZE_UNITS.map((u) => ({ value: String(u.value), label: u.label }))}
                ariaLabel="Size unit"
              />
            </div>
          </FilterFacet>

          <FilterFacet label="Content flags" count={state.flags.length} width="w-72">
            <FacetMode
              value={String(state.flagsMode)}
              onChange={(v) => apply({ flagsMode: Number(v) as BrowseState['flagsMode'] })}
              options={[{ value: '0', label: 'Hide these' }, { value: '1', label: 'Only these' }]}
              ariaLabel="Hide or show torrents carrying these flags"
            />
            {/* One column: two of the six names run long enough that a second
                column would clip them to the same first word. */}
            <FacetOptions
              options={CONTENT_FLAGS.map((f) => ({ value: String(f.bit), label: f.name }))}
              selected={state.flags.map(String)}
              onToggle={(v) => apply({ flags: toggleValue(state.flags, Number(v)) })}
              onClear={() => apply({ flags: [] })}
            />
          </FilterFacet>

          <FilterToggle
            pressed={hideSnatched}
            onPressedChange={setHideSnatched}
            label="Hide snatched"
            note="only in this browser"
            icon={<EyeOff className="size-3.5" />}
          />
        </FilterRow>
        </>
        )}
      </FilterBar>

      <FilterSummary
        chips={chips}
        onClearAll={() => {
          // Everything with a chip goes, the hide-snatched toggle included.
          setHideSnatched(false)
          apply({
            mainCat: [], categories: [], langs: [], langsMode: 'has', flags: [],
            minSize: null, maxSize: null, dateRange: '', startDate: '', endDate: '',
            searchType: 'all', searchIn: 'torrents',
            authorID: null, narratorID: null, seriesID: null, uploader: null, extra: EMPTY_EXTRA,
          })
        }}
      />

      {state.seriesID != null && seriesGroups.length > 0 && (
        <SeriesHeader name={seriesName ?? 'This series'} groups={seriesGroups} total={found} />
      )}

      <Card className="overflow-hidden py-0">
        {/* The head of the list: what you are looking at, then how you look at
            it. Filter chips stay above with the filters they undo. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/25 px-6 py-2">
          {/* A search never reloads the page, so the count is the only thing
              that reports the outcome; a live region says it out loud too. */}
          <span role="status" className="text-[12.5px] tabular-nums text-muted-foreground">
            {loading
              ? 'Searching…'
              : state.seriesID && seriesViewOn
                ? `${fmtInt(found)} results · grouped by part`
                : `${fmtInt(found)} results`}
          </span>
          {/* The column headers carry the everyday sorts; this names the current
              one and reaches the handful that have no column. */}
          {!loading && !(state.seriesID && seriesViewOn) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="link" className="h-auto p-0 text-[12.5px] font-normal text-muted-foreground hover:text-foreground">
                  sorted by {(BROWSE_SORTS.find((o) => o.value === effectiveSort)?.label ?? 'relevance').toLowerCase()}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {BROWSE_SORTS.map((o) => (
                  <DropdownMenuCheckboxItem
                    key={o.value}
                    checked={o.value === effectiveSort}
                    onCheckedChange={() => apply({ sort: o.value })}
                  >
                    {o.label}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            {!uploaderMode && (
              <Tooltip>
                <TooltipTrigger asChild>
                  {/* Same shape as the toggle plus the menu beside it: what it
                      does is the icon's job, not the button's. */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void randomBook()}
                    disabled={rolling}
                    aria-label="Open a random book from these results"
                    className="h-8 w-9 px-0"
                  >
                    {rolling ? <Loader2 className="size-[15px] animate-spin" /> : <Dice5 className="size-[15px]" />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Open a random book from these results</TooltipContent>
              </Tooltip>
            )}
            <ViewToggle view={view} onChange={setViewMode} />
            {!loading && shownItems.length > 0 && (
              <ResultActions
                items={shownItems}
                bookmarksView={state.searchIn === 'bookmarks'}
                onBookmark={setBookmarked}
                onRemoved={dropOnUnbookmark}
                onCleaned={(type, removed) => (type === 'all' ? clearList() : void refreshAfterCleanup(removed))}
                copySlot={<CopyResultsButton rows={items} asMenuItem />}
                cols={view === 'list' ? cols : undefined}
                onToggleCol={view === 'list' ? toggleCol : undefined}
              />
            )}
          </span>
        </div>
        {loading && view === 'list' && (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr] items-center gap-[18px] px-6 py-3.5 md:grid-cols-[132px_1fr]">
                <Skeleton className="mx-auto h-[96px] w-[64px] rounded-[4px_7px_7px_4px] md:h-[132px] md:w-[88px]" />
                <div className="min-w-0">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-2/5" />
                  <Skeleton className="mt-2.5 h-4 w-28" />
                </div>
              </div>
            ))}
          </div>
        )}
        {loading && view === 'grid' && (
          <div className={cn(GALLERY_GRID)}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="mx-auto aspect-[3/4.5] w-[min(100%,calc(var(--shelf)*2/3))] rounded-[4px_7px_7px_4px]" />
                <Skeleton className="mt-2.5 h-3.5 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && items.length === 0 && (
          <div className="py-10 text-center text-sm text-destructive">
            {error}. <Button variant="link" className="h-auto p-0 text-sm text-destructive" onClick={() => void run(state)}>try again</Button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {uploaderMode
              ? 'No uploads to show here.'
              : state.searchIn === 'bookmarks'
                ? 'No bookmarks yet. Bookmark a torrent and it shows up here.'
                : state.searchIn === 'mine'
                  ? "You haven't uploaded any torrents yet."
                  : 'Nothing on these shelves. Loosen a filter or try different words.'}
          </div>
        )}
        {!loading && !error && items.length > 0 && shownItems.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            All {fmtInt(hiddenCount)} loaded results are hidden ({hiddenParts}).{' '}
            <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setShowHidden(true)}>Show them</Button>
          </div>
        )}
        {!loading && shownItems.length > 0 && (!state.seriesID || !seriesViewOn) && view === 'list' && (
          <div className="divide-y divide-border">
            <ListHeader cols={cols} lane={actionLane(3 + (ignoreOn ? 1 : 0))} sort={effectiveSort} onSort={(v) => apply({ sort: v })} />
            {shownItems.map((t) => (
              <TorrentRow
                key={t.id}
                t={t}
                cols={cols}
                onBookmark={setBookmarked}
                onRemoved={dropOnUnbookmark}
                onFreeleech={setPersonalFreeleech}
                onIgnore={ignoreOn ? ignoreTorrent : undefined}
                onUnignore={ignored.remove}
                hiddenReason={showHidden ? hiddenReason(t) : null}
              />
            ))}
          </div>
        )}
        {!loading && shownItems.length > 0 && (!state.seriesID || !seriesViewOn) && view === 'grid' && (
          <div className={cn(GALLERY_GRID)}>
            {shownItems.map((t) => (
              <GalleryItem key={t.id} t={t} hiddenReason={showHidden ? hiddenReason(t) : null} onUnignore={ignored.remove} />
            ))}
          </div>
        )}
        {!loading && shownItems.length > 0 && state.seriesID != null && seriesViewOn && (
          <div className="divide-y divide-border">
            {seriesGroups.map((g) => {
              const rows = groupRows(g)
              if (rows.length === 0) return null
              const rowIds = rows.map((t) => t.id)
              const checkedCount = rowIds.filter((id) => selected.has(id)).length
              const body = view === 'list' ? (
                <div className="divide-y divide-border">
                  {rows.map((t) => (
                    <TorrentRow
                      key={t.id}
                      t={t}
                      cols={cols}
                      onBookmark={setBookmarked}
                      onRemoved={dropOnUnbookmark}
                      onFreeleech={setPersonalFreeleech}
                      onIgnore={ignoreOn ? ignoreTorrent : undefined}
                      onUnignore={ignored.remove}
                      hiddenReason={showHidden ? hiddenReason(t) : null}
                      selectable={seriesBulkOn}
                      checked={selected.has(t.id)}
                      onCheck={toggleSelect}
                    />
                  ))}
                </div>
              ) : (
                <div className={cn(GALLERY_GRID)}>
                  {rows.map((t) => (
                    <GalleryItem key={t.id} t={t} hiddenReason={showHidden ? hiddenReason(t) : null} onUnignore={ignored.remove} />
                  ))}
                </div>
              )
              if (g.kind === 'none') {
                return (
                  <CollapsibleSection
                    key={g.key}
                    title="No part number"
                    count={rows.length}
                    open={nonePartsOpen}
                    onOpenChange={setNonePartsOpen}
                  >
                    {body}
                  </CollapsibleSection>
                )
              }
              return (
                <div key={g.key}>
                  {g.kind === 'range' && firstRange === g.key && (
                    <h3 className="border-t px-6 pt-4 pb-1 font-display text-[13px] font-semibold">Boxsets and collections</h3>
                  )}
                  <h3 className="flex items-center gap-2.5 bg-muted/40 px-6 py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                    {view === 'list' && seriesBulkOn && (
                      <Checkbox
                        checked={checkedCount > 0 && checkedCount === rowIds.length}
                        indeterminate={checkedCount > 0 && checkedCount < rowIds.length}
                        onCheckedChange={(v) => toggleGroupSelect(rowIds, !!v)}
                        aria-label={`Select every edition of part ${g.part}`}
                      />
                    )}
                    Part {g.part}
                  </h3>
                  {body}
                </div>
              )
            })}
          </div>
        )}
        {!loading && items.length > 0 && !state.seriesID && (remaining > 0 || loadingMore || error) && (
          <div className="flex items-center justify-center border-t py-4">
            {error ? (
              <span className="text-sm text-destructive">
                {error}. <Button variant="link" className="h-auto p-0 text-sm text-destructive" onClick={loadMore}>try again</Button>
              </span>
            ) : (
              <Button variant="outline" disabled={loadingMore} onClick={loadMore}>
                {loadingMore && <Loader2 className="size-4 animate-spin" />}
                Load {fmtInt(Math.min(state.perpage, remaining))} more
              </Button>
            )}
          </div>
        )}
      </Card>

      {state.seriesID != null && seriesViewOn && seriesBulkOn && selected.size > 0 && (
        <div
          aria-live="polite"
          className="fixed inset-x-0 bottom-4 z-40 mx-auto flex w-fit max-w-[calc(100%-2rem)] flex-wrap items-center justify-center gap-2 rounded-xl border bg-card px-6 py-2.5 shadow-lg"
        >
          <span className="text-[12.5px] tabular-nums">{plural(selected.size, 'torrent')} selected</span>
          <Button variant="outline" size="sm" disabled={barBusy} className="h-8 text-[12.5px]" onClick={() => void bookmarkSelected()}>
            {barBusy ? <Loader2 className="animate-spin" /> : <Bookmark />} Bookmark
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={zipSelected}>
            <FileArchive /> {selectedIds.length > ZIP_BATCH_MAX ? `Zip first ${fmtInt(ZIP_BATCH_MAX)}` : 'Download .zip'}
          </Button>
          <WedgeBatchButton targets={wedgeTargets} onDone={onBatchFreeleech} />
          <Button variant="ghost" size="sm" className="h-8 text-[12.5px]" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-[12.5px] tabular-nums text-muted-foreground">
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <>
              {`Showing ${fmtInt(from)}–${fmtInt(to)}`}
              {hiddenCount > 0 && (
                <>
                  <span aria-hidden="true">·</span>
                  {`${fmtInt(hiddenCount)} hidden (${hiddenParts})`}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-[12.5px]"
                    onClick={() => setShowHidden((v) => !v)}
                  >
                    {showHidden ? 'Hide again' : 'Show'}
                  </Button>
                </>
              )}
            </>
          )}
        </span>
      </div>
    </div>
  )
}
