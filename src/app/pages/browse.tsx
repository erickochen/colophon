import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { AlignJustify, Bookmark, BookmarkCheck, BookmarkX, ChevronDown, Columns3, Dices, Download, EyeOff, FileArchive, Filter, LayoutGrid, Loader2, Search, Trash2, Undo2 } from 'lucide-react'
import type { PageProps } from '@/app/router'
import {
  bookmarkCleanup, bookmarkMass, BookmarkMassError, bookmarkOne, downloadZipOf, searchAllTorrents, searchTorrents,
  parsePeople, downloadUrl, coverUrl, torrentUrl, BOOKMARKS_ZIP_URL, ZIP_BATCH_MAX,
  type BookmarkCleanup, type SearchQuery, type SearchTorrent,
} from '@/lib/mam-api'
import { groupBySeries, type SeriesGroup } from '@/lib/series'
import { CONTENT_FLAGS, LANGUAGES, MAIN_CATS, SORT_OPTIONS } from '@/lib/mam-facets'
import { coverShape } from '@/lib/cover-shape'
import { wedgeHelps } from '@/lib/wedge'
import { mamBrowseDefaults, readSticky, writeSticky, type StickyFilters } from '@/lib/browse-sticky'
import { useFeature, useIgnoredTorrents } from '@/lib/settings'
import { fmtInt, plural, relTime, utcTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Book } from '@/components/book'
import { CollapsibleSection } from '@/components/section'
import { SeriesHeader } from '@/components/series-header'
import { TagLinks } from '@/components/tag-links'
import { WedgeBatchButton, WedgeRowButton } from '@/components/wedge-download'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  FacetOptions, FacetSection, FilterBar, FilterFacet, FilterHint, FilterRow, FilterSearch,
  FilterSegments, FilterSelect, FilterSummary, toggleValue,
} from '@/components/filters'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { toast } from '@/components/ui/toast'

const SRCH_FIELDS = [
  ['title', 'Title'], ['author', 'Author'], ['narrator', 'Narrator'], ['series', 'Series'],
  ['description', 'Description'], ['tags', 'Tags'], ['fileTypes', 'Filetype'], ['filenames', 'Filenames'],
] as const

const SEARCH_TYPES = [
  ['all', 'All torrents'], ['active', 'Active only'], ['inactive', 'Inactive only'],
  ['fl', 'Freeleech'], ['VIP', 'VIP'], ['fl-VIP', 'Freeleech or VIP'], ['nVIP', 'Not VIP'],
] as const

const SEARCH_INS = [
  ['torrents', 'Everywhere'], ['bookmarks', 'My bookmarks'], ['new', 'Flagged new'],
  ['mine', 'My uploads'], ['allReseed', 'All reseed requests'], ['myReseed', 'I could reseed'],
] as const

// MAM's search answers can trail a bookmark write by a while, so the total is
// worth a few retries. Past that the toast carries the outcome and a lingering
// row clears on the next search.
const REFRESH_POLL_MS = 1000
const REFRESH_POLL_TRIES = 5

const VIEW_KEY = 'colophon:browse-view'
type ViewMode = 'list' | 'grid'

const COLS_KEY = 'colophon:browse-cols'
type ColKey = 'narrators' | 'series' | 'filetype' | 'size' | 'peers' | 'added'

// List-row fields the reader can hide; track = width in the stats grid.
interface ListColumn {
  key: ColKey
  label: string
  track?: string
}
const LIST_COLUMNS: readonly ListColumn[] = [
  { key: 'narrators', label: 'Narrator' },
  { key: 'series', label: 'Series' },
  { key: 'filetype', label: 'Filetype', track: '52px' },
  { key: 'size', label: 'Size', track: '84px' },
  { key: 'peers', label: 'Seeders / leechers', track: '88px' },
  { key: 'added', label: 'Added', track: '76px' },
]
const ALL_COLS = LIST_COLUMNS.map((c) => c.key)

function readCols(): ColKey[] {
  try {
    const raw = localStorage.getItem(COLS_KEY)
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

/** Why a row is not shown: on the personal ignore list or snatched while the
 * hide-snatched filter is on. */
type HiddenReason = 'ignored' | 'snatched'

type SrchField = (typeof SRCH_FIELDS)[number][0]

interface BrowseState {
  text: string
  srchIn: SrchField[]
  searchType: NonNullable<SearchQuery['searchType']>
  searchIn: NonNullable<SearchQuery['searchIn']>
  mainCat: number[]
  cat: number[]
  langs: number[]
  flagsMode: 0 | 1
  flags: number[]
  // MAM's author/narrator/series links carry these ids (?author=<id>).
  authorID: number | null
  narratorID: number | null
  seriesID: number | null
  sort: string
  start: number
  perpage: number
}

/** MAM's newer /tor/search.php passes one JSON blob: s={"tor":{…}}. Map the
 * shapes it actually links to (bookmarks, reseed, an uploader, free text) onto
 * our own browse state so those links land on a real result set. */
function stateFromSearchJson(raw: string, myUid: string | null): Partial<BrowseState> | null {
  let parsed: { tor?: Record<string, unknown> }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }
  const tor = parsed?.tor
  if (!tor || typeof tor !== 'object') return null
  const out: Partial<BrowseState> = {}
  if (typeof tor.text === 'string') out.text = tor.text
  if (tor.bookmarked === 'only') out.searchIn = 'bookmarks'
  else if (tor.rr === 'reseed') out.searchIn = 'allReseed'
  else if (typeof tor.uploader === 'string') {
    out.searchIn = myUid && tor.uploader === `u${myUid}` ? 'mine' : 'torrents'
    if (!out.text && !myUid) out.text = ''
  }
  return Object.keys(out).length ? out : null
}

function stateFromUrl(myUid: string | null = null): BrowseState {
  const p = new URLSearchParams(location.search)
  const srchIn = SRCH_FIELDS.map(([k]) => k).filter((k) => p.get(`tor[srchIn][${k}]`) === 'true')
  return {
    text: p.get('tor[text]') ?? '',
    srchIn: srchIn.length ? srchIn : ['title', 'author'],
    searchType: (p.get('tor[searchType]') as BrowseState['searchType']) || 'all',
    searchIn: (p.get('tor[searchIn]') as BrowseState['searchIn']) || 'torrents',
    mainCat: p.getAll('tor[main_cat][]').map(Number).filter(Boolean),
    cat: p.getAll('tor[cat][]').map(Number).filter(Boolean),
    langs: p.getAll('tor[browse_lang][]').map(Number).filter(Boolean),
    flagsMode: p.get('tor[browseFlagsHideVsShow]') === '1' ? 1 : 0,
    flags: p.getAll('tor[browseFlags][]').map(Number).filter(Boolean),
    // MAM links use the short form; its own scripts rewrite the URL to the
    // tor[...ID] form after a search, so accept both.
    authorID: Number(p.get('author') ?? p.get('tor[authorID]')) || null,
    narratorID: Number(p.get('narrator') ?? p.get('tor[narratorID]')) || null,
    seriesID: Number(p.get('series') ?? p.get('tor[seriesID]')) || null,
    sort: p.get('tor[sortType]') || 'default',
    start: Number(p.get('tor[startNumber]')) || 0,
    perpage: Number(p.get('perpage')) || DEFAULT_PERPAGE,
    ...(p.get('s') ? stateFromSearchJson(p.get('s')!, myUid) ?? {} : {}),
  }
}

const stickyOf = (s: BrowseState): StickyFilters => ({
  mainCat: s.mainCat,
  cat: s.cat,
  langs: s.langs,
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
  if (s.searchIn !== 'torrents') return s
  const saved: Partial<StickyFilters> = readSticky() ?? mamBrowseDefaults() ?? {}
  const p = new URLSearchParams(location.search)
  // MAM's own scripts rewrite the URL once their search returns, leaving neutral
  // values behind: tor[cat][]=0 for every category and tor[sortType]=default.
  // Those are not a choice, so they must not shut the saved filters out.
  const picked = (key: string) => p.getAll(key).some((v) => Number(v) > 0)
  const urlSort = p.get('tor[sortType]')
  const next = { ...s }
  if (!picked('tor[main_cat][]') && !picked('tor[cat][]')) {
    next.mainCat = saved.mainCat ?? next.mainCat
    next.cat = saved.cat ?? next.cat
  }
  if (!picked('tor[browse_lang][]')) next.langs = saved.langs ?? next.langs
  if (!picked('tor[browseFlags][]')) {
    next.flagsMode = saved.flagsMode ?? next.flagsMode
    next.flags = (saved.flags ?? next.flags).filter((f) => CONTENT_FLAGS.some((x) => x.bit === f))
  }
  if ((!urlSort || urlSort === 'default') && saved.sort && SORT_OPTIONS.some((o) => o.value === saved.sort)) {
    next.sort = saved.sort
  }
  if (!p.has('perpage') && saved.perpage && PERPAGE_OPTIONS.includes(saved.perpage)) {
    next.perpage = saved.perpage
  }
  return next
}

function urlFromState(s: BrowseState): string {
  const p = new URLSearchParams()
  if (s.text) p.set('tor[text]', s.text)
  for (const f of s.srchIn) p.set(`tor[srchIn][${f}]`, 'true')
  p.set('tor[searchType]', s.searchType)
  p.set('tor[searchIn]', s.searchIn)
  for (const c of s.mainCat) p.append('tor[main_cat][]', String(c))
  for (const c of s.cat) p.append('tor[cat][]', String(c))
  for (const l of s.langs) p.append('tor[browse_lang][]', String(l))
  if (s.flags.length) {
    p.set('tor[browseFlagsHideVsShow]', String(s.flagsMode))
    for (const f of s.flags) p.append('tor[browseFlags][]', String(f))
  }
  // Keep MAM's own short form so the URL works with the script off too.
  if (s.authorID) p.set('author', String(s.authorID))
  if (s.narratorID) p.set('narrator', String(s.narratorID))
  if (s.seriesID) p.set('series', String(s.seriesID))
  p.set('tor[sortType]', s.sort)
  p.set('tor[startNumber]', String(s.start))
  if (s.perpage !== DEFAULT_PERPAGE) p.set('perpage', String(s.perpage))
  return `/tor/browse.php?${p.toString()}`
}

function toQuery(s: BrowseState): SearchQuery {
  return {
    text: s.text || undefined,
    srchIn: s.srchIn,
    searchType: s.searchType,
    searchIn: s.searchIn,
    mainCat: s.mainCat.length ? s.mainCat : undefined,
    cat: s.cat.length ? s.cat : undefined,
    browseLang: s.langs.length ? s.langs : undefined,
    browseFlagsHideVsShow: s.flagsMode,
    browseFlags: s.flags.length ? s.flags : undefined,
    authorID: s.authorID ?? undefined,
    narratorID: s.narratorID ?? undefined,
    seriesID: s.seriesID ?? undefined,
    sortType: s.sort,
    startNumber: s.start,
    perpage: s.perpage,
  }
}

function catName(id: number): string {
  for (const m of MAIN_CATS) for (const c of m.cats) if (c.id === id) return c.name
  return `cat ${id}`
}

/** Row cover in a fixed-height slot, with a large peek beside it while
 * hovered. The slot pins the height plus centers whatever shape fits in it. */
function RowCover({ t }: { t: SearchTorrent }) {
  const poster = t.poster_type ? coverUrl(t.id) : null
  const shape = coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })
  const cover = (
    <a
      href={torrentUrl(t.id)}
      tabIndex={-1}
      className="flex h-[var(--cover-h)] items-center justify-center text-[9px] sm:h-[var(--cover-h-lg)]"
      style={{ '--cover-h': `${ROW_COVER_H_SM}px`, '--cover-h-lg': `${ROW_COVER_H}px` } as CSSProperties}
    >
      <Book poster={poster} title={t.title} shape={shape} fit="height" plain className="transition-shadow group-hover:shadow-book-lift" />
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

const ROW_ACTION =
  'grid size-[34px] place-items-center rounded-full border outline-none transition-[opacity,color,background-color,border-color] duration-200 ' +
  'hover:border-transparent hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none ' +
  'focus-visible:border-ring focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring'

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
        <button
          type="button"
          disabled={busy}
          onClick={toggleBookmark}
          aria-label={on ? 'Remove bookmark' : 'Bookmark'}
          className={cn(
            ROW_ACTION,
            on ? 'border-brand/40 text-brand' : 'border-input text-muted-foreground opacity-0 group-hover:opacity-100'
          )}
        >
          {on ? <BookmarkCheck className="size-[15px]" /> : <Bookmark className="size-[15px]" />}
        </button>
      </TooltipTrigger>
      <TooltipContent>{on ? 'Remove bookmark' : 'Bookmark'}</TooltipContent>
    </Tooltip>
  )
}

function TorrentRow({ t, cols, onBookmark, onRemoved, onFreeleech, onIgnore, onUnignore, hiddenReason, selectable, checked, onCheck }: { t: SearchTorrent; cols: ColKey[]; onBookmark: BookmarkSetter; onRemoved?: RowDropper; onFreeleech?: (id: number) => void; onIgnore?: (t: SearchTorrent) => void; onUnignore?: (id: number) => void; hiddenReason?: HiddenReason | null; selectable?: boolean; checked?: boolean; onCheck?: (id: number, on: boolean) => void }) {
  const authors = parsePeople(t.author_info)
  const narrators = cols.includes('narrators') ? parsePeople(t.narrator_info) : []
  const series = cols.includes('series') ? parsePeople(t.series_info) : []
  const stats = LIST_COLUMNS.filter((c) => c.track && cols.includes(c.key))
  return (
    <div
      className={cn(
        'group grid items-center gap-[18px] px-[22px] py-3.5 transition-colors hover:bg-foreground/[0.028]',
        selectable
          ? stats.length
            ? 'grid-cols-[28px_96px_1fr_auto_auto] sm:grid-cols-[28px_132px_1fr_auto_auto]'
            : 'grid-cols-[28px_96px_1fr_auto] sm:grid-cols-[28px_132px_1fr_auto]'
          : stats.length
            ? 'grid-cols-[96px_1fr_auto_auto] sm:grid-cols-[132px_1fr_auto_auto]'
            : 'grid-cols-[96px_1fr_auto] sm:grid-cols-[132px_1fr_auto]',
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
          className="grid items-baseline gap-x-[18px] text-right tabular-nums"
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
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" className="h-8 text-[12.5px]" onClick={() => onUnignore(t.id)}>
            <Undo2 className="size-3.5" /> Unignore
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-1.5">
          <RowBookmark t={t} onBookmark={onBookmark} onRemoved={onRemoved} />
          <Tooltip>
            <TooltipTrigger asChild>
              <a
                href={downloadUrl(t.id)}
                aria-label="Download .torrent"
                className={cn(ROW_ACTION, 'border-input text-muted-foreground opacity-0 group-hover:opacity-100')}
              >
                <Download className="size-[15px]" />
              </a>
            </TooltipTrigger>
            <TooltipContent>Download .torrent</TooltipContent>
          </Tooltip>
          {onFreeleech && wedgeHelps(t) && (
            <WedgeRowButton
              target={{ id: t.id, title: t.title, size: t.size }}
              onDone={() => onFreeleech(t.id)}
              className={cn(ROW_ACTION, 'border-input text-muted-foreground opacity-0 group-hover:opacity-100')}
            />
          )}
          {onIgnore && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Ignore this torrent"
                  onClick={() => onIgnore(t)}
                  className={cn(ROW_ACTION, 'border-input text-muted-foreground opacity-0 group-hover:opacity-100')}
                >
                  <EyeOff className="size-[15px]" />
                </button>
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
        <span className="relative block text-[11px] transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 motion-reduce:transition-none">
          <Book
            poster={t.poster_type ? coverUrl(t.id) : null}
            title={t.title}
            author={authorsText || undefined}
            shape={coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })}
            size="shelf"
            className="group-hover:shadow-book-lift"
          />
          {!!t.bookmarked && (
            <span
              aria-label="Bookmarked"
              className="absolute right-1.5 top-1.5 z-3 grid size-[22px] place-items-center rounded-full bg-card/90 text-brand shadow-sm"
            >
              <BookmarkCheck className="size-[13px]" />
            </span>
          )}
        </span>
        <span className="font-display mt-2.5 line-clamp-2 block text-[13px] font-medium leading-[1.35]">{t.title}</span>
        {authorsText && <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-muted-foreground">{authorsText}</span>}
      </a>
      {hiddenReason === 'ignored' && onUnignore && (
        <button
          type="button"
          onClick={() => onUnignore(t.id)}
          className="absolute left-1.5 top-1.5 z-3 flex items-center gap-1 rounded-full bg-card/90 px-2 py-1 text-[11px] font-medium shadow-sm transition-colors hover:text-brand"
        >
          <Undo2 className="size-3" /> Unignore
        </button>
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
  items, bookmarksView, onBookmark, onRemoved, onCleaned,
}: {
  items: SearchTorrent[]
  bookmarksView: boolean
  onBookmark: BookmarkSetter
  onRemoved?: RowDropper
  onCleaned: (type: BookmarkCleanup, removed: number) => void
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
          <Button
            variant="outline"
            size="xs"
            disabled={busy}
            className="h-[26px] gap-1.5 rounded-[7px] px-2.5 text-[12px]"
          >
            {busy && <Loader2 className="size-3 animate-spin" />}
            Actions
            <ChevronDown className="size-3 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[264px]">
          {bookmarksView && <DropdownMenuLabel className={MENU_GROUP_LABEL}>Shown here</DropdownMenuLabel>}
          <DropdownMenuGroup>
            <DropdownMenuItem disabled={toAdd.length === 0} onClick={() => void run('add', toAdd)}>
              <Bookmark />
              Bookmark all shown
              <DropdownMenuShortcut>{fmtInt(toAdd.length)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem disabled={toRemove.length === 0} onClick={() => setConfirmShown(true)}>
              <BookmarkX />
              Remove bookmarks
              <DropdownMenuShortcut>{fmtInt(toRemove.length)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={zip}>
              <FileArchive />
              {capped ? (
                `Download first ${fmtInt(ZIP_BATCH_MAX)} as .zip`
              ) : (
                <>
                  Download all shown as .zip
                  <DropdownMenuShortcut>{fmtInt(zipIds.length)}</DropdownMenuShortcut>
                </>
              )}
            </DropdownMenuItem>
          </DropdownMenuGroup>
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
                  <DropdownMenuItem
                    key={c.type}
                    variant={c.type === 'all' ? 'destructive' : 'default'}
                    onClick={() => setPending(c)}
                  >
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
              Every bookmarked torrent shown here drops out of your bookmarks. There is no undo.
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
            <AlertDialogDescription>{pending?.question} There is no undo.</AlertDialogDescription>
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

/** Which list-row fields are shown; the choice sticks per browser. */
function ColumnsMenu({ cols, onToggle }: { cols: ColKey[]; onToggle: (k: ColKey) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="xs" className="h-[26px] gap-1.5 rounded-[7px] px-2.5 text-[12px]">
          <Columns3 className="size-3 text-muted-foreground" />
          Columns
          <ChevronDown className="size-3 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        {LIST_COLUMNS.map((c) => (
          <DropdownMenuCheckboxItem
            key={c.key}
            checked={cols.includes(c.key)}
            onCheckedChange={() => onToggle(c.key)}
            closeOnClick={false}
          >
            {c.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const base = 'grid h-[26px] w-7 place-items-center border transition-colors outline-none focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring'
  const off = 'border-input bg-card text-muted-foreground hover:text-foreground'
  const on = 'border-transparent bg-brand-soft text-accent-foreground'
  return (
    <span className="inline-flex">
      <button
        type="button"
        aria-label="List view"
        aria-pressed={view === 'list'}
        onClick={() => onChange('list')}
        className={cn(base, 'rounded-l-[7px]', view === 'list' ? on : off)}
      >
        <AlignJustify className="size-[13px]" />
      </button>
      <button
        type="button"
        aria-label="Gallery view"
        aria-pressed={view === 'grid'}
        onClick={() => onChange('grid')}
        className={cn(base, '-ml-px rounded-r-[7px]', view === 'grid' ? on : off)}
      >
        <LayoutGrid className="size-[13px]" />
      </button>
    </span>
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
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'list'
    } catch {
      return 'list'
    }
  })
  const [cols, setCols] = useState<ColKey[]>(readCols)
  const seq = useRef(0)
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
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage may be unavailable
    }
  }

  const toggleCol = (k: ColKey) => {
    setCols((prev) => {
      const next = ALL_COLS.filter((key) => (key === k ? !prev.includes(key) : prev.includes(key)))
      try {
        localStorage.setItem(COLS_KEY, JSON.stringify(next))
      } catch {
        // storage may be unavailable
      }
      return next
    })
  }

  const run = useCallback(async (s: BrowseState, opts: { append?: boolean; push?: boolean } = {}) => {
    const { append = false, push = true } = opts
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
    if (push) history.replaceState(null, '', urlFromState(q))
    try {
      const res = q.seriesID ? await searchAllTorrents(toQuery(q)) : await searchTorrents(toQuery(q))
      if (seq.current !== mine) return
      setFound(res.found)
      setItems((prev) => (append ? [...prev, ...res.data] : res.data))
      if (!append) setBaseStart(q.start)
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
    void run(state, { push: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (patch: Partial<BrowseState>) => {
    const next = { ...state, ...patch, start: 0 }
    setState(next)
    if (next.searchIn === 'torrents') writeSticky(stickyOf(next))
    void run(next)
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
    setItems((prev) => prev.filter((t) => !hit.has(t.id)))
    setFound((n) => Math.max(0, n - ids.length))
  }, [])

  const clearList = useCallback(() => {
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
        const res = await searchTorrents(toQuery(next))
        if (seq.current !== mine) return
        if (res.found <= target || attempt === REFRESH_POLL_TRIES) {
          setState(next)
          setItems(res.data)
          setFound(res.found)
          setBaseStart(0)
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

  const loadMore = () => {
    const next = { ...state, start: state.start + state.perpage }
    setState(next)
    void run(next, { append: true })
  }

  const [rolling, setRolling] = useState(false)

  /** Opens a random torrent inside the active filters. */
  async function randomBook() {
    setRolling(true)
    try {
      const probe = await searchTorrents({ ...toQuery(state), perpage: 1, startNumber: 0 })
      if (!probe.found) {
        toast.warning('Nothing to pick from with these filters.')
        return
      }
      const offset = Math.floor(Math.random() * probe.found)
      const res = await searchTorrents({ ...toQuery(state), perpage: 1, startNumber: offset })
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
  const activeFilters = state.cat.length + state.langs.length + state.flags.length + (hideSnatched ? 1 : 0)
  const sortLabel = SORT_OPTIONS.find((o) => o.value === state.sort)?.label ?? state.sort

  const facetSummary = useMemo(() => {
    const parts: string[] = []
    if (state.mainCat.length) parts.push(state.mainCat.map((m) => MAIN_CATS.find((x) => x.id === m)?.name ?? m).join(', '))
    if (state.cat.length) parts.push(`${state.cat.length} categories`)
    if (state.langs.length) parts.push(`${state.langs.length} languages`)
    return parts.join(' · ')
  }, [state.mainCat, state.cat, state.langs])

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

  // Every active filter gets a chip. Nothing should narrow the list from a place
  // the reader cannot see. Clear all only appears once a chip does.
  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...entityChip('author', state.authorID, () => apply({ authorID: null })),
    ...entityChip('narrator', state.narratorID, () => apply({ narratorID: null })),
    ...entityChip('series', state.seriesID, () => apply({ seriesID: null })),
    ...state.mainCat.map((m) => ({
      key: `m${m}`,
      label: MAIN_CATS.find((x) => x.id === m)?.name ?? String(m),
      onRemove: () => apply({ mainCat: toggleValue(state.mainCat, m), cat: [] }),
    })),
    ...state.cat.map((c) => ({ key: `c${c}`, label: catName(c), onRemove: () => apply({ cat: toggleValue(state.cat, c) }) })),
    ...state.flags.map((f) => {
      const name = CONTENT_FLAGS.find((x) => x.bit === f)?.name ?? String(f)
      return {
        key: `f${f}`,
        label: state.flagsMode === 0 ? `no ${name}` : `${name} only`,
        onRemove: () => apply({ flags: toggleValue(state.flags, f) }),
      }
    }),
    ...state.langs.map((l) => ({
      key: `l${l}`,
      label: LANGUAGES.find((x) => x.id === l)?.name ?? String(l),
      onRemove: () => apply({ langs: toggleValue(state.langs, l) }),
    })),
    ...(state.searchType !== 'all'
      ? [{
          key: 'searchType',
          label: SEARCH_TYPES.find(([v]) => v === state.searchType)?.[1] ?? state.searchType,
          onRemove: () => apply({ searchType: 'all' }),
        }]
      : []),
    ...(state.searchIn !== 'torrents'
      ? [{
          key: 'searchIn',
          label: SEARCH_INS.find(([v]) => v === state.searchIn)?.[1] ?? state.searchIn,
          onRemove: () => apply({ searchIn: 'torrents' }),
        }]
      : []),
    ...(hideSnatched
      ? [{ key: 'hideSnatched', label: 'Hide snatched', onRemove: () => setHideSnatched(false) }]
      : []),
  ]

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-tight">Browse the library</h1>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {loading ? 'Searching…' : `${fmtInt(found)} torrents${facetSummary ? ` · ${facetSummary}` : ''}`}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-[12.5px]"
          onClick={() => void randomBook()}
          disabled={rolling}
        >
          {rolling ? <Loader2 className="animate-spin" /> : <Dices />} Random book
        </Button>
      </div>

      <FilterBar>
        <FilterSearch
          value={state.text}
          onChange={(v) => setState((s) => ({ ...s, text: v }))}
          onSubmit={() => apply({})}
          placeholder="Search titles, authors, narrators, series…"
        />

        <FilterRow className="gap-1.5">
          <FilterHint>in</FilterHint>
          <FilterSegments
            type="multiple"
            options={SRCH_FIELDS.map(([value, label]) => ({ value, label }))}
            value={state.srchIn}
            onChange={(v) => apply({ srchIn: v as SrchField[] })}
          />
        </FilterRow>

        <FilterRow>
          <FilterSegments
            type="multiple"
            options={MAIN_CATS.map((m) => ({ value: String(m.id), label: m.name }))}
            value={state.mainCat.map(String)}
            onChange={(v) => apply({ mainCat: v.map(Number), cat: [] })}
          />

          <FilterFacet label="Filters" count={activeFilters} width="w-[420px]" icon={<Filter className="size-3.5" />}>
            <div className="max-h-[440px] overflow-y-auto">
              <FacetSection title="Categories">
                <div className="grid max-h-52 grid-cols-2 gap-x-3 overflow-y-auto">
                  {(state.mainCat.length ? MAIN_CATS.filter((m) => state.mainCat.includes(m.id)) : MAIN_CATS).map((m) => (
                    <div key={m.id} className="pb-1.5">
                      <div className="py-1 text-[11.5px] font-medium text-muted-foreground">{m.name}</div>
                      {m.cats.map((c) => (
                        <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                          <Checkbox
                            checked={state.cat.includes(c.id)}
                            onCheckedChange={() => apply({ cat: toggleValue(state.cat, c.id) })}
                          />
                          {c.name}
                        </Label>
                      ))}
                    </div>
                  ))}
                </div>
              </FacetSection>
              <FacetSection title="Personal" note="only in this browser">
                <Label className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                  <Checkbox checked={hideSnatched} onCheckedChange={(v) => setHideSnatched(!!v)} />
                  Hide snatched torrents
                </Label>
              </FacetSection>
              <FacetSection
                title="Content flags"
                note={state.flagsMode === 0 ? 'torrents containing these stay out' : 'only torrents containing these'}
              >
                <button
                  type="button"
                  className="mb-1.5 text-[12px] text-brand hover:underline"
                  onClick={() => apply({ flagsMode: state.flagsMode === 0 ? 1 : 0 })}
                >
                  switch to “{state.flagsMode === 0 ? 'show only' : 'hide'}”
                </button>
                <div className="grid grid-cols-2">
                  {CONTENT_FLAGS.map((f) => (
                    <Label key={f.bit} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                      <Checkbox
                        checked={state.flags.includes(f.bit)}
                        onCheckedChange={() => apply({ flags: toggleValue(state.flags, f.bit) })}
                      />
                      {f.name}
                    </Label>
                  ))}
                </div>
              </FacetSection>
            </div>
          </FilterFacet>

          <FilterFacet label="Languages" count={state.langs.length} width="w-64">
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

          <FilterSelect
            value={state.searchType}
            onChange={(v) => apply({ searchType: v as BrowseState['searchType'] })}
            options={SEARCH_TYPES.map(([value, label]) => ({ value, label }))}
            ariaLabel="Torrent state"
          />
          <FilterSelect
            value={state.searchIn}
            onChange={(v) => apply({ searchIn: v as BrowseState['searchIn'] })}
            options={SEARCH_INS.map(([value, label]) => ({ value, label }))}
            ariaLabel="Where to search"
          />
          <FilterSelect
            value={state.sort}
            onChange={(v) => apply({ sort: v })}
            options={SORT_OPTIONS}
            align="end"
            ariaLabel="Sort order"
            className="ml-auto"
          />
        </FilterRow>
      </FilterBar>

      <FilterSummary
        chips={chips}
        onClearAll={() => apply({ mainCat: [], cat: [], langs: [], flags: [], searchType: 'all', searchIn: 'torrents', authorID: null, narratorID: null, seriesID: null })}
        meta={loading ? 'Searching…' : state.seriesID && seriesViewOn ? `${fmtInt(found)} results · grouped by part` : `${fmtInt(found)} results · ${sortLabel}`}
      >
        <ViewToggle view={view} onChange={setViewMode} />
        {view === 'list' && <ColumnsMenu cols={cols} onToggle={toggleCol} />}
        {!loading && shownItems.length > 0 && (
          <ResultActions
            items={shownItems}
            bookmarksView={state.searchIn === 'bookmarks'}
            onBookmark={setBookmarked}
            onRemoved={dropOnUnbookmark}
            onCleaned={(type, removed) => (type === 'all' ? clearList() : void refreshAfterCleanup(removed))}
          />
        )}
      </FilterSummary>

      {state.seriesID != null && seriesGroups.length > 0 && (
        <SeriesHeader name={seriesName ?? 'This series'} groups={seriesGroups} total={found} />
      )}

      <Card className="overflow-hidden py-0">
        {loading && view === 'list' && (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[96px_1fr_auto] items-center gap-[18px] px-[22px] py-3.5 sm:grid-cols-[132px_1fr_auto]">
                <Skeleton className="mx-auto h-[96px] w-[64px] rounded-[4px_7px_7px_4px] sm:h-[132px] sm:w-[88px]" />
                <div className="min-w-0">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="mt-2 h-3 w-2/5" />
                  <Skeleton className="mt-2.5 h-4 w-28" />
                </div>
                <Skeleton className="h-4 w-72 max-w-full" />
              </div>
            ))}
          </div>
        )}
        {loading && view === 'grid' && (
          <div className="grid grid-cols-3 items-end gap-x-[22px] gap-y-7 p-[26px] sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i}>
                <Skeleton className="aspect-[3/4.5] w-full rounded-[4px_7px_7px_4px]" />
                <Skeleton className="mt-2.5 h-3.5 w-3/4" />
                <Skeleton className="mt-1.5 h-3 w-1/2" />
              </div>
            ))}
          </div>
        )}
        {!loading && error && items.length === 0 && (
          <div className="py-10 text-center text-sm text-destructive">
            {error}. <button className="underline" onClick={() => void run(state)}>try again</button>
          </div>
        )}
        {!loading && !error && items.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {state.searchIn === 'bookmarks'
              ? 'No bookmarks yet. Bookmark a torrent and it shows up here.'
              : state.searchIn === 'mine'
                ? "You haven't uploaded any torrents yet."
                : 'Nothing on these shelves. Loosen a filter or try different words.'}
          </div>
        )}
        {!loading && !error && items.length > 0 && shownItems.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            All {fmtInt(hiddenCount)} loaded results are hidden ({hiddenParts}).{' '}
            <button className="underline" onClick={() => setShowHidden(true)}>Show them</button>
          </div>
        )}
        {!loading && shownItems.length > 0 && (!state.seriesID || !seriesViewOn) && view === 'list' && (
          <div className="divide-y divide-border">
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
          <div className="grid grid-cols-3 items-end gap-x-[22px] gap-y-7 p-[26px] sm:grid-cols-4 lg:grid-cols-6">
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
                <div className="grid grid-cols-3 items-end gap-x-[22px] gap-y-7 p-[26px] sm:grid-cols-4 lg:grid-cols-6">
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
                    <h3 className="border-t px-[22px] pt-4 pb-1 font-display text-[13px] font-semibold">Boxsets and collections</h3>
                  )}
                  <h3 className="flex items-center gap-2.5 bg-muted/40 px-[22px] py-1.5 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
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
                {error}. <button className="underline" onClick={() => void run(state, { append: true })}>try again</button>
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
              {`Showing ${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(found)}`}
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
        {!state.seriesID && (
          <FilterSelect
            value={String(state.perpage)}
            onChange={(v) => apply({ perpage: Number(v) })}
            options={PERPAGE_OPTIONS.map((n) => ({ value: String(n), label: `${n} / page` }))}
            align="end"
            ariaLabel="Results per page"
          />
        )}
      </div>
    </div>
  )
}
