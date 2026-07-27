import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlignJustify, ChevronDown, Download, Filter, LayoutGrid, Loader2, Search, X } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { searchTorrents, parsePeople, downloadUrl, coverUrl, torrentUrl, type SearchQuery, type SearchTorrent } from '@/lib/mam-api'
import { CONTENT_FLAGS, LANGUAGES, MAIN_CATS, SORT_OPTIONS } from '@/lib/mam-facets'
import { fmtInt, relTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Book } from '@/components/book'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

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

const VIEW_KEY = 'muisstil:browse-view'
type ViewMode = 'list' | 'grid'

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
    sort: p.get('tor[sortType]') || 'default',
    start: Number(p.get('tor[startNumber]')) || 0,
    perpage: Number(p.get('perpage')) || 25,
    ...(p.get('s') ? stateFromSearchJson(p.get('s')!, myUid) ?? {} : {}),
  }
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
  p.set('tor[sortType]', s.sort)
  p.set('tor[startNumber]', String(s.start))
  if (s.perpage !== 25) p.set('perpage', String(s.perpage))
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
    sortType: s.sort,
    startNumber: s.start,
    perpage: s.perpage,
  }
}

function catName(id: number): string {
  for (const m of MAIN_CATS) for (const c of m.cats) if (c.id === id) return c.name
  return `cat ${id}`
}

/** Row cover with a large natural-ratio peek beside it while hovered. */
function RowCover({ t }: { t: SearchTorrent }) {
  const poster = t.poster_type ? coverUrl(t.id) : null
  const cover = (
    <a href={torrentUrl(t.id)} tabIndex={-1} className="block text-[9px]">
      <Book poster={poster} title={t.title} size="row" plain className="transition-shadow group-hover:shadow-book-lift" />
    </a>
  )
  if (!poster) return cover
  return (
    <HoverCard>
      <HoverCardTrigger asChild delay={250} closeDelay={100}>{cover}</HoverCardTrigger>
      <HoverCardContent side="right" sideOffset={16} className="w-[230px] rounded-none border-0 bg-transparent p-0 shadow-none">
        <span className="block rounded-[6px_10px_10px_6px] shadow-book-lift">
          <Book poster={poster} title={t.title} naturalRatio size="hero" className="rounded-[6px_10px_10px_6px]" />
        </span>
      </HoverCardContent>
    </HoverCard>
  )
}

function TorrentRow({ t }: { t: SearchTorrent }) {
  const authors = parsePeople(t.author_info)
  const narrators = parsePeople(t.narrator_info)
  const series = parsePeople(t.series_info)
  return (
    <div className="group grid grid-cols-[88px_1fr_auto_auto] items-center gap-[18px] px-[22px] py-3.5 transition-colors hover:bg-foreground/[0.028]">
      <RowCover t={t} />
      <a href={torrentUrl(t.id)} className="min-w-0">
        <h3 className="font-display text-[15px] font-medium leading-[1.3] transition-colors group-hover:text-brand">{t.title}</h3>
        {(authors.length > 0 || narrators.length > 0 || series.length > 0) && (
          <p className="mt-0.5 text-[12px] leading-snug text-muted-foreground">
            {authors.map((a) => a.name).join(', ')}
            {narrators.length > 0 && (
              <span className="text-muted-foreground/75">
                {authors.length > 0 && ' · '}read by {narrators.map((n) => n.name).join(', ')}
              </span>
            )}
            {series.length > 0 && (
              <span className="italic text-muted-foreground/75">
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
      <div className="grid grid-cols-[52px_84px_88px_76px] items-baseline gap-x-[18px] text-right tabular-nums">
        <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
          {t.filetype?.split(' ')[0] ?? '–'}
        </span>
        <span className="font-mono text-[12.5px] text-muted-foreground">
          {t.size}
          <span className="block font-sans text-[11px] text-muted-foreground/75">{fmtInt(t.numfiles)} file{t.numfiles === 1 ? '' : 's'}</span>
        </span>
        <span className="font-mono text-[12.5px]">
          <span className="text-ok" title="Seeders">{fmtInt(t.seeders)}</span>
          <span className="text-muted-foreground/60"> / </span>
          <span className="text-warn" title="Leechers">{fmtInt(t.leechers)}</span>
          <span className="block font-sans text-[11px] text-muted-foreground/75" title="Times snatched">{fmtInt(t.times_completed)} snatched</span>
        </span>
        <span className="font-mono text-[12px] text-muted-foreground/80">{relTime(t.added)}</span>
      </div>
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={downloadUrl(t.id)}
            aria-label="Download .torrent"
            className="grid size-[34px] place-items-center rounded-full border border-input text-muted-foreground opacity-0 outline-none transition-opacity duration-200 group-hover:opacity-100 hover:border-transparent hover:bg-primary hover:text-primary-foreground focus-visible:border-ring focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <Download className="size-[15px]" />
          </a>
        </TooltipTrigger>
        <TooltipContent>Download .torrent</TooltipContent>
      </Tooltip>
    </div>
  )
}

function GalleryItem({ t }: { t: SearchTorrent }) {
  const authors = parsePeople(t.author_info)
  const authorsText = authors.map((a) => a.name).join(', ')
  return (
    <a href={torrentUrl(t.id)} className="group block">
      <span className="block text-[11px] transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 motion-reduce:transition-none">
        <Book
          poster={t.poster_type ? coverUrl(t.id) : null}
          title={t.title}
          author={authorsText || undefined}
          naturalRatio
          size="shelf"
          className="group-hover:shadow-book-lift"
        />
      </span>
      <span className="font-display mt-2.5 line-clamp-2 block text-[13px] font-medium leading-[1.35]">{t.title}</span>
      {authorsText && <span className="mt-0.5 line-clamp-1 block text-[11.5px] text-muted-foreground">{authorsText}</span>}
    </a>
  )
}

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const base = 'grid h-[26px] w-7 place-items-center border transition-colors outline-none focus-visible:z-10 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50'
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
  const [state, setState] = useState<BrowseState>(() => stateFromUrl(props.page.user.uid != null ? String(props.page.user.uid) : null))
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
  const seq = useRef(0)

  const setViewMode = (v: ViewMode) => {
    setView(v)
    try {
      localStorage.setItem(VIEW_KEY, v)
    } catch {
      // storage may be unavailable
    }
  }

  const run = useCallback(async (s: BrowseState, opts: { append?: boolean; push?: boolean } = {}) => {
    const { append = false, push = true } = opts
    const mine = ++seq.current
    if (append) {
      setLoadingMore(true)
    } else {
      setLoading(true)
      setItems([])
    }
    setError(null)
    if (push) history.replaceState(null, '', urlFromState(s))
    try {
      const res = await searchTorrents(toQuery(s))
      if (seq.current !== mine) return
      setFound(res.found)
      setItems((prev) => (append ? [...prev, ...res.data] : res.data))
      if (!append) setBaseStart(s.start)
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
    void run(next)
  }

  const loadMore = () => {
    const next = { ...state, start: state.start + state.perpage }
    setState(next)
    void run(next, { append: true })
  }

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const from = items.length === 0 ? 0 : baseStart + 1
  const to = Math.min(found, baseStart + items.length)
  const remaining = Math.max(0, found - to)
  const activeFilters = state.cat.length + state.langs.length + state.flags.length
  const sortLabel = SORT_OPTIONS.find((o) => o.value === state.sort)?.label ?? state.sort

  const facetSummary = useMemo(() => {
    const parts: string[] = []
    if (state.mainCat.length) parts.push(state.mainCat.map((m) => MAIN_CATS.find((x) => x.id === m)?.name ?? m).join(', '))
    if (state.cat.length) parts.push(`${state.cat.length} categories`)
    if (state.langs.length) parts.push(`${state.langs.length} languages`)
    return parts.join(' · ')
  }, [state.mainCat, state.cat, state.langs])

  const chips: { key: string; label: string; onRemove: () => void }[] = [
    ...state.cat.map((c) => ({ key: `c${c}`, label: catName(c), onRemove: () => apply({ cat: toggle(state.cat, c) }) })),
    ...state.langs.map((l) => ({
      key: `l${l}`,
      label: LANGUAGES.find((x) => x.id === l)?.name ?? String(l),
      onRemove: () => apply({ langs: toggle(state.langs, l) }),
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
  ]

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-tight">Browse the library</h1>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {loading ? 'Searching…' : `${fmtInt(found)} torrents${facetSummary ? ` · ${facetSummary}` : ''}`}
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3 pt-0">
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              apply({})
            }}
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={state.text}
                onChange={(e) => setState((s) => ({ ...s, text: e.target.value }))}
                placeholder="Search titles, authors, narrators, series…"
                className="h-10 pl-9"
              />
            </div>
            <Button type="submit" className="h-10 px-5">Search</Button>
          </form>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="pr-1 text-[12px] text-muted-foreground">in</span>
            {SRCH_FIELDS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => apply({ srchIn: toggle(state.srchIn, key) })}
                className={
                  'rounded-md border px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                  (state.srchIn.includes(key)
                    ? 'border-transparent bg-brand-soft text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50')
                }
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {MAIN_CATS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => apply({ mainCat: toggle(state.mainCat, m.id), cat: [] })}
                className={
                  'rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
                  (state.mainCat.includes(m.id)
                    ? 'border-brand/40 bg-brand-soft text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50')
                }
              >
                {m.name}
              </button>
            ))}

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12.5px]">
                  <Filter className="size-3.5" />
                  Filters
                  {activeFilters > 0 && <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]" variant="secondary">{activeFilters}</Badge>}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-[420px] p-0">
                <div className="grid max-h-[440px] grid-cols-2 overflow-y-auto p-3">
                  <div className="col-span-2 pb-2">
                    <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categories</div>
                    <div className="grid max-h-48 grid-cols-2 gap-x-3 overflow-y-auto pr-1">
                      {(state.mainCat.length ? MAIN_CATS.filter((m) => state.mainCat.includes(m.id)) : MAIN_CATS).map((m) => (
                        <div key={m.id} className="pb-1.5">
                          <div className="py-1 text-[11.5px] font-medium text-muted-foreground">{m.name}</div>
                          {m.cats.map((c) => (
                            <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                              <Checkbox
                                checked={state.cat.includes(c.id)}
                                onCheckedChange={() => apply({ cat: toggle(state.cat, c.id) })}
                              />
                              {c.name}
                            </Label>
                          ))}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-2 pt-2">
                    <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Content flags · {state.flagsMode === 0 ? 'hide torrents containing' : 'show only torrents containing'}
                    </div>
                    <button
                      type="button"
                      className="mb-1.5 text-[12px] text-brand underline"
                      onClick={() => apply({ flagsMode: state.flagsMode === 0 ? 1 : 0 })}
                    >
                      switch to “{state.flagsMode === 0 ? 'show only' : 'hide'}”
                    </button>
                    <div className="grid grid-cols-2">
                      {CONTENT_FLAGS.map((f) => (
                        <Label key={f.bit} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                          <Checkbox
                            checked={state.flags.includes(f.bit)}
                            onCheckedChange={() => apply({ flags: toggle(state.flags, f.bit) })}
                          />
                          {f.name}
                        </Label>
                      ))}
                    </div>
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 gap-1.5 text-[12.5px]">
                  Languages
                  {state.langs.length > 0 && <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]" variant="secondary">{state.langs.length}</Badge>}
                  <ChevronDown className="size-3.5 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-0">
                <Command>
                  <CommandInput placeholder="Filter languages…" />
                  <CommandList className="max-h-64">
                    <CommandEmpty>No language found.</CommandEmpty>
                    <CommandGroup>
                      {LANGUAGES.map((l) => (
                        <CommandItem key={l.id} value={l.name} onSelect={() => apply({ langs: toggle(state.langs, l.id) })}>
                          <Checkbox checked={state.langs.includes(l.id)} className="pointer-events-none" />
                          {l.name}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>

            <Select value={state.searchType} onValueChange={(v) => apply({ searchType: v as BrowseState['searchType'] })}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEARCH_TYPES.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={state.searchIn} onValueChange={(v) => apply({ searchIn: v as BrowseState['searchIn'] })}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SEARCH_INS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="ml-auto">
              <Select value={state.sort} onValueChange={(v) => apply({ sort: v })}>
                <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
                <SelectContent align="end">
                  {SORT_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-2 px-1">
        {chips.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1.5 rounded-full border border-input bg-card py-[3px] pl-2.5 pr-2 text-[12px] text-muted-foreground">
            {c.label}
            <button
              type="button"
              aria-label={`Remove ${c.label}`}
              onClick={c.onRemove}
              className="text-muted-foreground/70 transition-colors hover:text-foreground"
            >
              <X className="size-3" />
            </button>
          </span>
        ))}
        {chips.length > 0 && (
          <button type="button" onClick={() => apply({ cat: [], langs: [], searchType: 'all', searchIn: 'torrents' })} className="text-[12px] text-brand hover:underline">
            Clear all
          </button>
        )}
        <span className="ml-auto text-[12px] tabular-nums text-muted-foreground">
          {loading ? 'Searching…' : `${fmtInt(found)} results · ${sortLabel}`}
        </span>
        <ViewToggle view={view} onChange={setViewMode} />
      </div>

      <Card className="overflow-hidden py-0">
        {loading && view === 'list' && (
          <div className="divide-y divide-border">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="grid grid-cols-[88px_1fr_auto] items-center gap-[18px] px-[22px] py-3.5">
                <Skeleton className="aspect-[3/4.5] w-[76px] rounded-[4px_7px_7px_4px]" />
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
        {!loading && items.length > 0 && view === 'list' && (
          <div className="divide-y divide-border">
            {items.map((t) => <TorrentRow key={t.id} t={t} />)}
          </div>
        )}
        {!loading && items.length > 0 && view === 'grid' && (
          <div className="grid grid-cols-3 items-end gap-x-[22px] gap-y-7 p-[26px] sm:grid-cols-4 lg:grid-cols-6">
            {items.map((t) => <GalleryItem key={t.id} t={t} />)}
          </div>
        )}
        {!loading && items.length > 0 && (remaining > 0 || loadingMore || error) && (
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

      <div className="flex items-center justify-between">
        <span className="text-[12.5px] tabular-nums text-muted-foreground">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : `Showing ${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(found)}`}
        </span>
        <Select value={String(state.perpage)} onValueChange={(v) => apply({ perpage: Number(v) })}>
          <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
          <SelectContent align="end">
            {[25, 50, 100].map((n) => (
              <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
