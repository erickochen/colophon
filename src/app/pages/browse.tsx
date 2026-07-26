import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BookOpen, ChevronDown, ChevronLeft, ChevronRight, Download, Filter, Loader2, Search, X } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { searchTorrents, parsePeople, downloadUrl, coverUrl, type SearchQuery, type SearchResult, type SearchTorrent } from '@/lib/mam-api'
import { CONTENT_FLAGS, LANGUAGES, MAIN_CATS, SORT_OPTIONS } from '@/lib/mam-facets'
import { fmtInt, relTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from '@/components/ui/command'

const SRCH_FIELDS = [
  ['title', 'Title'], ['author', 'Author'], ['narrator', 'Narrator'], ['series', 'Series'],
  ['description', 'Description'], ['tags', 'Tags'], ['fileTypes', 'Filetype'], ['filenames', 'Filenames'],
] as const

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

function TorrentRow({ t }: { t: SearchTorrent }) {
  const authors = parsePeople(t.author_info)
  const narrators = parsePeople(t.narrator_info)
  const series = parsePeople(t.series_info)
  return (
    <TableRow className="group">
      <TableCell className="w-14 align-top">
        <a href={`/t/${t.id}`} className="flex h-16 w-11 items-center justify-center overflow-hidden rounded-[4px] border bg-muted shadow-sm">
          {t.poster_type ? (
            <img src={coverUrl(t.id)} alt="" loading="lazy" className="size-full object-cover" onError={(e) => e.currentTarget.remove()} />
          ) : (
            <BookOpen className="size-4 text-muted-foreground/60" />
          )}
        </a>
      </TableCell>
      <TableCell className="whitespace-normal align-top">
        <a href={`/t/${t.id}`} className="grid gap-1">
          <span className="font-display text-[14px] font-medium leading-snug group-hover:underline">{t.title}</span>
          <span className="text-[12px] leading-snug text-muted-foreground">
            {authors.length > 0 && <>by {authors.map((a) => a.name).join(', ')}</>}
            {narrators.length > 0 && <> · read by {narrators.map((a) => a.name).join(', ')}</>}
            {series.length > 0 && (
              <> · {series.map((s) => s.name + (s.part ? ` #${s.part}` : '')).join(', ')}</>
            )}
          </span>
          <span className="flex flex-wrap items-center gap-1 pt-0.5">
            {t.vip === 1 && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
            {(t.free === 1 || t.personal_freeleech === 1) && <Badge className="bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>}
            {t.my_snatched === 1 && <Badge variant="secondary">Snatched</Badge>}
            <Badge variant="outline">{t.catname || catName(t.category)}</Badge>
            {t.lang_code && t.lang_code !== 'ENG' && <Badge variant="outline">{t.lang_code}</Badge>}
          </span>
        </a>
      </TableCell>
      <TableCell className="text-center align-top">
        <Badge variant="outline" className="font-mono text-[10.5px] uppercase">{t.filetype?.split(' ')[0] ?? '–'}</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right align-top font-mono text-[12.5px] tabular-nums">
        {t.size}
        <div className="text-muted-foreground">{fmtInt(t.numfiles)} file{t.numfiles === 1 ? '' : 's'}</div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right align-top font-mono text-[12.5px] tabular-nums">
        <span className="text-ok" title="Seeders">{fmtInt(t.seeders)}</span>
        <span className="text-muted-foreground"> / </span>
        <span className="text-warn" title="Leechers">{fmtInt(t.leechers)}</span>
        <div className="font-sans text-[11px] text-muted-foreground">{fmtInt(t.times_completed)} snatched</div>
      </TableCell>
      <TableCell className="whitespace-nowrap text-right align-top text-[12.5px] text-muted-foreground">
        {relTime(t.added)}
      </TableCell>
      <TableCell className="text-right align-top">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild size="icon" variant="ghost" className="size-8">
              <a href={downloadUrl(t.id)} title="">
                <Download className="size-4" />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Download .torrent</TooltipContent>
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

export function BrowseView(props: PageProps) {
  const [state, setState] = useState<BrowseState>(() => stateFromUrl(props.page.user.uid != null ? String(props.page.user.uid) : null))
  const [result, setResult] = useState<SearchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)

  const run = useCallback(async (s: BrowseState, push = true) => {
    const mine = ++seq.current
    setLoading(true)
    setError(null)
    if (push) history.replaceState(null, '', urlFromState(s))
    try {
      const res = await searchTorrents(toQuery(s))
      if (seq.current === mine) setResult(res)
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : 'Search failed')
    } finally {
      if (seq.current === mine) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void run(state, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (patch: Partial<BrowseState>, resetStart = true) => {
    const next = { ...state, ...patch, ...(resetStart ? { start: 0 } : {}) }
    setState(next)
    void run(next)
  }

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

  const found = result?.found ?? 0
  const from = found === 0 ? 0 : state.start + 1
  const to = Math.min(found, state.start + (result?.data.length ?? 0))
  const activeFilters = state.cat.length + state.langs.length + state.flags.length

  const facetSummary = useMemo(() => {
    const parts: string[] = []
    if (state.mainCat.length) parts.push(state.mainCat.map((m) => MAIN_CATS.find((x) => x.id === m)?.name ?? m).join(', '))
    if (state.cat.length) parts.push(`${state.cat.length} categories`)
    if (state.langs.length) parts.push(`${state.langs.length} languages`)
    return parts.join(' · ')
  }, [state.mainCat, state.cat, state.langs])

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
                onClick={() => apply({ srchIn: toggle(state.srchIn, key) }, false)}
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
                <SelectItem value="all">All torrents</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
                <SelectItem value="fl">Freeleech</SelectItem>
                <SelectItem value="VIP">VIP</SelectItem>
                <SelectItem value="fl-VIP">Freeleech or VIP</SelectItem>
                <SelectItem value="nVIP">Not VIP</SelectItem>
              </SelectContent>
            </Select>

            <Select value={state.searchIn} onValueChange={(v) => apply({ searchIn: v as BrowseState['searchIn'] })}>
              <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="torrents">Everywhere</SelectItem>
                <SelectItem value="bookmarks">My bookmarks</SelectItem>
                <SelectItem value="new">Flagged new</SelectItem>
                <SelectItem value="mine">My uploads</SelectItem>
                <SelectItem value="allReseed">All reseed requests</SelectItem>
                <SelectItem value="myReseed">I could reseed</SelectItem>
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

          {(state.cat.length > 0 || state.langs.length > 0) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {state.cat.map((c) => (
                <Badge key={`c${c}`} variant="secondary" className="gap-1">
                  {catName(c)}
                  <button onClick={() => apply({ cat: toggle(state.cat, c) })}><X className="size-3" /></button>
                </Badge>
              ))}
              {state.langs.map((l) => (
                <Badge key={`l${l}`} variant="secondary" className="gap-1">
                  {LANGUAGES.find((x) => x.id === l)?.name ?? l}
                  <button onClick={() => apply({ langs: toggle(state.langs, l) })}><X className="size-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="overflow-hidden py-0">
        <Table className="[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-14" />
              <TableHead>Title</TableHead>
              <TableHead className="text-center">Format</TableHead>
              <TableHead className="text-right">Size</TableHead>
              <TableHead className="text-right">
                <Tooltip><TooltipTrigger className="cursor-default">Seed / Leech</TooltipTrigger><TooltipContent>Seeders / leechers, then times snatched</TooltipContent></Tooltip>
              </TableHead>
              <TableHead className="text-right">Added</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-16 w-11 rounded-[4px]" /></TableCell>
                  <TableCell><Skeleton className="mb-1.5 h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-10" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-12" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-14" /></TableCell>
                  <TableCell />
                </TableRow>
              ))}
            {!loading && error && (
              <TableRow>
                <TableCell colSpan={7} className="py-10 text-center text-sm text-destructive">
                  {error}. <button className="underline" onClick={() => run(state)}>try again</button>
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && result?.data.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} className="py-12 text-center text-sm text-muted-foreground">
                  {state.searchIn === 'bookmarks'
                    ? 'No bookmarks yet. Bookmark a torrent and it shows up here.'
                    : state.searchIn === 'mine'
                      ? "You haven't uploaded any torrents yet."
                      : 'Nothing on these shelves. Loosen a filter or try different words.'}
                </TableCell>
              </TableRow>
            )}
            {!loading && !error && result?.data.map((t) => <TorrentRow key={t.id} t={t} />)}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-muted-foreground">
          {loading ? <Loader2 className="size-3.5 animate-spin" /> : `Showing ${fmtInt(from)}–${fmtInt(to)} of ${fmtInt(found)}`}
        </span>
        <div className="flex items-center gap-2">
          <Select value={String(state.perpage)} onValueChange={(v) => apply({ perpage: Number(v) })}>
            <SelectTrigger size="sm" className="h-8 w-auto text-[12.5px]"><SelectValue /></SelectTrigger>
            <SelectContent align="end">
              {[25, 50, 100].map((n) => (
                <SelectItem key={n} value={String(n)}>{n} / page</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline" size="sm" className="h-8"
            disabled={state.start === 0 || loading}
            onClick={() => apply({ start: Math.max(0, state.start - state.perpage) }, false)}
          >
            <ChevronLeft className="size-4" /> Prev
          </Button>
          <Button
            variant="outline" size="sm" className="h-8"
            disabled={loading || to >= found}
            onClick={() => apply({ start: state.start + state.perpage }, false)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
