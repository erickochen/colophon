import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { searchTorrents, parsePeople, coverUrl, type SearchTorrent } from '@/lib/mam-api'
import { coverShape } from '@/lib/cover-shape'
import { MAIN_CATS } from '@/lib/mam-facets'
import { fmtInt } from '@/lib/format'
import { pinnedSet } from '@/lib/saved-filters'
import { useFeature } from '@/lib/settings'
import { useSnatchIndex } from '@/lib/snatch-index'
import { placed, weeksOf, type Available, type Top10Query } from '@/lib/top10-period'
import { PageHeader } from '@/app/shell/bits'
import { Book } from '@/components/book'
import { SnatchMark, snatchMarked } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  FacetSection, FilterBar, FilterFacet, FilterRow, FilterSaved, FilterSavedActions, FilterSegments,
  FilterSelect, FilterSummary, toggleValue, useSavedViews,
} from '@/components/filters'
import { mamFetch } from '@/lib/mam-fetch'

// The category and mediatype facet MAM feeds #filterContainer from
// categories.php; we reuse browse's MAIN_CATS and pass main_cat[]/cat[] to the
// search endpoint. The period plus its index live in lib/top10-period.
const TOP10_PAGE = 'top10'

const METRICS = [
  { value: 'snatchedDesc', label: 'Most snatched' },
  { value: 'seedersDesc', label: 'Most seeders' },
  { value: 'leechersDesc', label: 'Most leechers' },
]

function catName(id: number): string {
  for (const m of MAIN_CATS) for (const c of m.cats) if (c.id === id) return c.name
  return `cat ${id}`
}

const OPEN_WITH: Top10Query = { year: 'all', week: 'all', metric: METRICS[0].value, mainCat: [], cat: [] }

/** Years reach the search as a date range built from the number itself, so this
 * is the shape a stored one has to have. */
const YEAR = /^\d{4}$/

/** How long an opening search waits for the week index before going out without
 * it. Well past what the small JSON needs, short of leaving the page waiting. */
const AVAIL_WAIT_MS = 8000

/** A stored set read back. Anything the set does not carry returns to the value
 * the page opens with, so applying one never leaves an older pick behind. */
function queryFrom(raw: Record<string, unknown> | undefined): Top10Query {
  if (!raw) return OPEN_WITH
  const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [])
  return {
    year: typeof raw.year === 'string' && (raw.year === 'all' || YEAR.test(raw.year)) ? raw.year : OPEN_WITH.year,
    week: typeof raw.week === 'string' ? raw.week : OPEN_WITH.week,
    metric: METRICS.some((m) => m.value === raw.metric) ? (raw.metric as string) : OPEN_WITH.metric,
    mainCat: ids(raw.mainCat),
    cat: ids(raw.cat),
  }
}

export function Top10View(_props: PageProps) {
  const [avail, setAvail] = useState<Available | null>(null)
  // The pinned set is what this page opens with. Read once, so pinning another
  // set later does not move the list under the reader.
  const opening = useMemo(() => queryFrom(pinnedSet(TOP10_PAGE)?.state), [])
  const [year, setYear] = useState<string>(opening.year)
  const [week, setWeek] = useState<string>(opening.week)
  const [metric, setMetric] = useState(opening.metric)
  const [mainCat, setMainCat] = useState<number[]>(opening.mainCat)
  const [cat, setCat] = useState<number[]>(opening.cat)
  const [rows, setRows] = useState<SearchTorrent[] | null>(null)
  const [checkOn] = useFeature('snatchCheck')
  // What this member already holds, which the search flag only half answers: it
  // knows nothing about seeding state plus it runs minutes behind.
  const { index: snatches } = useSnatchIndex(checkOn)
  // True where a stored week could not be read, so the list covers its year.
  const [periodFailed, setPeriodFailed] = useState(false)
  const seq = useRef(0)
  // The query the shown list was asked for. The index lands on its own clock, so
  // it has to answer for whatever stands here by then.
  const asked = useRef<Top10Query>(opening)

  const load = useCallback(async (q: Top10Query, av: Available | null) => {
    const mine = ++seq.current
    asked.current = q
    setRows(null)
    let startDate: string | undefined
    let endDate: string | undefined
    // Only the week needs the index. A year turns into a range on its own, so it
    // narrows the list whether the index is in or not.
    if (q.year !== 'all') {
      const yearData = av?.[q.year]
      if (q.week !== 'all' && yearData) {
        for (const month of Object.values(yearData)) {
          if (typeof month === 'object' && month && q.week in month) {
            const w = (month as Record<string, [number, number, number]>)[q.week]
            if (Array.isArray(w)) {
              startDate = String(w[0])
              endDate = String(w[1])
            }
          }
        }
      }
      if (!startDate) {
        startDate = String(Date.UTC(Number(q.year), 0, 1) / 1000)
        endDate = String(Date.UTC(Number(q.year) + 1, 0, 1) / 1000)
      }
    }
    try {
      const res = await searchTorrents({
        sortType: q.metric,
        perpage: 10,
        startDate,
        endDate,
        srchIn: ['title'],
        mainCat: q.mainCat.length ? q.mainCat : undefined,
        cat: q.cat.length ? q.cat : undefined,
      })
      if (seq.current === mine) setRows(res.data)
    } catch {
      if (seq.current === mine) setRows([])
    }
  }, [])

  // Only a stored week has to wait for the index: a year turns into a range on
  // its own. Waiting keeps the opening search down to one request. The deadline
  // keeps an answer that never comes from leaving the page on skeletons.
  useEffect(() => {
    const waits = opening.year !== 'all' && opening.week !== 'all'
    if (!waits) void load(opening, null)
    /** No index means no week, so the list covers the year plus the bar says why
     * the week it was asked for is not on it. */
    const wholeYear = () => {
      if (asked.current.week === 'all') return
      setWeek('all')
      setPeriodFailed(true)
      void load({ ...asked.current, week: 'all' }, null)
    }
    const deadline = waits ? setTimeout(wholeYear, AVAIL_WAIT_MS) : undefined
    mamFetch('https://cdn.myanonamouse.net/stats/js/top10TorAvailable.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: Available) => {
        clearTimeout(deadline)
        setAvail(j)
        const next = placed(asked.current, j)
        if (next.week !== asked.current.week) setWeek(next.week)
        // Searches an untouched page, plus a week only the index can place. Any
        // other list on screen was asked for by the reader, so it stays.
        if (seq.current === 0 || next.week !== 'all') void load(next, j)
      })
      .catch(() => {
        clearTimeout(deadline)
        setAvail(null)
        wholeYear()
      })
    return () => clearTimeout(deadline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (patch: Partial<Top10Query>) => {
    const picked: Top10Query = {
      year,
      week: patch.year !== undefined && patch.year !== year ? 'all' : week,
      metric,
      mainCat,
      cat,
      ...patch,
    }
    // A stored set can name a week this year does not have. Without the index
    // yet the week stands, since the effect above settles it once it lands.
    const next = avail ? placed(picked, avail) : picked
    setYear(next.year)
    setWeek(next.week)
    setMetric(next.metric)
    setMainCat(next.mainCat)
    setCat(next.cat)
    void load(next, avail)
  }


  const savedName = [
    METRICS.find((m) => m.value === metric)?.label,
    year === 'all' ? '' : week === 'all' ? year : `${year} week ${week}`,
    ...mainCat.map((m) => MAIN_CATS.find((x) => x.id === m)?.name),
    ...cat.map(catName),
  ]
    .filter(Boolean)
    .join(' · ')

  const views = useSavedViews({
    page: TOP10_PAGE,
    state: { year, week, metric, mainCat, cat },
    name: savedName,
    // A set at the opening values would light up again the moment it is switched
    // off, so Save waits until something here is actually picked.
    filtered:
      year !== 'all' || week !== 'all' || metric !== METRICS[0].value || mainCat.length > 0 || cat.length > 0,
    onApply: (saved) => apply(queryFrom(saved)),
    // Nothing here is ever unfiltered, so switching a set off means the list
    // this page opens with.
    onClear: () => apply(OPEN_WITH),
  })

  const indexed = avail ? Object.keys(avail).sort((a, b) => Number(b) - Number(a)) : []
  // A year outside the index still searches, so the select carries it rather
  // than showing a value that is not on it.
  const years = year !== 'all' && !indexed.includes(year) ? [year, ...indexed] : indexed
  const weeks = weeksOf(avail, year)

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Top 10"
        sub="The library's most wanted"
      />
      {/* Only while it still holds: picking a week clears it, plus dropping the
          year makes the whole thing moot. */}
      {periodFailed && year !== 'all' && week === 'all' && (
        <p className="text-12-5 text-muted-foreground">
          Could not read which weeks are on record in time, so this covers the whole year.
        </p>
      )}

      <FilterBar>
        <FilterSaved views={views} />
        <FilterRow>
          <FilterSegments ariaLabel="Ranked by" options={METRICS} value={metric} onChange={(v) => apply({ metric: v })} />
          <FilterSelect
            value={year}
            onChange={(v) => apply({ year: v })}
            options={[{ value: 'all', label: 'All time' }, ...years.map((y) => ({ value: y, label: y }))]}
            ariaLabel="Year"
          />
          {year !== 'all' && weeks.length > 0 && (
            <FilterSelect
              value={week}
              onChange={(v) => apply({ week: v })}
              options={[{ value: 'all', label: 'Whole year' }, ...weeks.map((w) => ({ value: w, label: `Week ${w}` }))]}
              ariaLabel="Week"
            />
          )}
        </FilterRow>
        <FilterRow>
          <FilterSegments
            type="multiple"
            ariaLabel="Media type"
            options={MAIN_CATS.map((m) => ({ value: String(m.id), label: m.name }))}
            value={mainCat.map(String)}
            onChange={(v) => apply({ mainCat: v.map(Number), cat: [] })}
          />
          <FilterFacet label="Categories" count={cat.length} width="w-[420px]" icon={<Filter className="size-3.5" />}>
            <FacetSection title="Categories">
              <div className="grid max-h-72 grid-cols-2 gap-x-3 overflow-y-auto">
                {(mainCat.length ? MAIN_CATS.filter((m) => mainCat.includes(m.id)) : MAIN_CATS).map((m) => (
                  <div key={m.id} className="pb-1.5">
                    <div className="py-1 text-11-5 font-medium text-muted-foreground">{m.name}</div>
                    {m.cats.map((c) => (
                      <Label key={c.id} className="flex items-center gap-2 py-1 text-12-5 font-normal">
                        <Checkbox
                          checked={cat.includes(c.id)}
                          onCheckedChange={() => apply({ cat: toggleValue(cat, c.id) })}
                        />
                        {c.name}
                      </Label>
                    ))}
                  </div>
                ))}
              </div>
            </FacetSection>
          </FilterFacet>
        </FilterRow>
      </FilterBar>

      <FilterSummary
        chips={cat.map((c) => ({ key: `c${c}`, label: catName(c), onRemove: () => apply({ cat: toggleValue(cat, c) }) }))}
        onClearAll={() => apply({ cat: [], mainCat: [] })}
        actions={views.hasActions ? <FilterSavedActions views={views} /> : undefined}
      />

      <div className="grid gap-2.5">
        {rows === null &&
          Array.from({ length: 10 }).map((_, i) => (
            <Card key={i} className="py-4"><CardContent className="flex gap-4"><Skeleton className="size-10" /><div className="flex-1"><Skeleton className="mb-2 h-4 w-1/2" /><Skeleton className="h-3 w-1/3" /></div></CardContent></Card>
          ))}
        {rows?.length === 0 && (
          <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Nothing found for this period.</CardContent></Card>
        )}
        {rows?.map((t, i) => {
          const authors = parsePeople(t.author_info)
          const pile = snatches?.have.get(t.id) ?? null
          return (
            <BlurFade key={t.id} delay={0.05 * i} direction="up" offset={8}>
            <a href={`/t/${t.id}`} className="group block">
              <Card className="py-3.5 transition-colors group-hover:border-brand/40">
                <CardContent className="flex items-center gap-4">
                  <span
                    className={'w-10 shrink-0 text-center font-display text-28 font-semibold tabular-nums ' + (i < 3 ? '' : 'text-muted-foreground')}
                    style={i < 3 ? { color: ['oklch(0.78 0.13 85)', 'oklch(0.62 0.02 260)', 'oklch(0.55 0.11 50)'][i] } : undefined}
                  >
                    {i + 1}
                  </span>
                  <Book
                    poster={t.poster_type ? coverUrl(t.id, t.poster_type) : null}
                    title={t.title}
                    author={authors[0]?.name}
                    shape={coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })}
                    size="row"
                    plain
                    className="w-18 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-display text-14-5 font-medium group-hover:underline">{t.title}</div>
                    <div className="truncate text-12 text-muted-foreground">
                      {authors.map((a) => a.name).join(', ')}{t.catname ? ` · ${t.catname}` : ''}
                    </div>
                    {/* With the title rather than beside the numbers, since the
                        columns on the right sit past the fold on a phone. */}
                    {snatchMarked(pile, t.my_snatched === 1) && (
                      <div className="mt-1 flex">
                        <SnatchMark pile={pile} snatched={t.my_snatched === 1} dense />
                      </div>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.vip === 1 && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
                    <Badge variant="outline" className="font-mono uppercase">{t.filetype?.split(' ')[0]}</Badge>
                  </div>
                  <div className="w-24 shrink-0 text-right font-mono text-12-5 tabular-nums">
                    {metric === 'snatchedDesc' && <><b>{fmtInt(t.times_completed)}</b> <span className="text-muted-foreground">✓</span></>}
                    {metric === 'seedersDesc' && <><b className="text-ok">{fmtInt(t.seeders)}</b> <span className="text-muted-foreground">seed</span></>}
                    {metric === 'leechersDesc' && <><b className="text-warn">{fmtInt(t.leechers)}</b> <span className="text-muted-foreground">leech</span></>}
                  </div>
                </CardContent>
              </Card>
            </a>
            </BlurFade>
          )
        })}
      </div>
    </div>
  )
}
