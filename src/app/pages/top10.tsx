import { useCallback, useEffect, useRef, useState } from 'react'
import { Filter } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { searchTorrents, parsePeople, coverUrl, type SearchTorrent } from '@/lib/mam-api'
import { coverShape } from '@/lib/cover-shape'
import { MAIN_CATS } from '@/lib/mam-facets'
import { fmtInt } from '@/lib/format'
import { PageHeader } from '@/app/shell/bits'
import { Book } from '@/components/book'
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

// Periods come from cdn top10TorAvailable.php: year -> month -> week -> [start, end].
type Available = Record<string, { all: boolean } & Record<string, { all: boolean } & Record<string, [number, number, number]>>>

// Same category/mediatype facet MAM feeds #filterContainer from categories.php;
// we reuse browse's MAIN_CATS and pass main_cat[]/cat[] to the search endpoint.
interface Top10Query {
  year: string
  week: string
  metric: string
  mainCat: number[]
  cat: number[]
}

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

export function Top10View(_props: PageProps) {
  const [avail, setAvail] = useState<Available | null>(null)
  const [year, setYear] = useState<string>('all')
  const [week, setWeek] = useState<string>('all')
  const [metric, setMetric] = useState(METRICS[0].value)
  const [mainCat, setMainCat] = useState<number[]>([])
  const [cat, setCat] = useState<number[]>([])
  const [rows, setRows] = useState<SearchTorrent[] | null>(null)
  const seq = useRef(0)

  const load = useCallback(async (q: Top10Query, av: Available | null) => {
    const mine = ++seq.current
    setRows(null)
    let startDate: string | undefined
    let endDate: string | undefined
    if (q.year !== 'all' && av) {
      const yearData = av[q.year]
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

  useEffect(() => {
    mamFetch('https://cdn.myanonamouse.net/stats/js/top10TorAvailable.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: Available) => setAvail(j))
      .catch(() => setAvail(null))
    void load({ year: 'all', week: 'all', metric: METRICS[0].value, mainCat: [], cat: [] }, null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (patch: Partial<Top10Query>) => {
    const next: Top10Query = {
      year,
      week: patch.year !== undefined && patch.year !== year ? 'all' : week,
      metric,
      mainCat,
      cat,
      ...patch,
    }
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
    onApply: (saved) => {
      const ids = (v: unknown) => (Array.isArray(v) ? v.map(Number).filter((n) => Number.isFinite(n)) : [])
      apply({
        year: typeof saved.year === 'string' ? saved.year : 'all',
        week: typeof saved.week === 'string' ? saved.week : 'all',
        metric: METRICS.some((m) => m.value === saved.metric) ? (saved.metric as string) : metric,
        mainCat: ids(saved.mainCat),
        cat: ids(saved.cat),
      })
    },
    // Nothing here is ever unfiltered, so switching a set off means the list
    // this page opens with.
    onClear: () => apply({ year: 'all', week: 'all', metric: METRICS[0].value, mainCat: [], cat: [] }),
  })

  const years = avail ? Object.keys(avail).sort((a, b) => Number(b) - Number(a)) : []
  const weeks: string[] = []
  if (avail && year !== 'all' && avail[year]) {
    for (const m of Object.values(avail[year])) {
      if (typeof m === 'object' && m) for (const k of Object.keys(m)) if (k !== 'all' && !weeks.includes(k)) weeks.push(k)
    }
    weeks.sort((a, b) => Number(a) - Number(b))
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Top 10"
        sub="The library's most wanted"
      />

      <FilterBar>
        <FilterSaved views={views} />
        <FilterRow>
          <FilterSegments options={METRICS} value={metric} onChange={(v) => apply({ metric: v })} />
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
            options={MAIN_CATS.map((m) => ({ value: String(m.id), label: m.name }))}
            value={mainCat.map(String)}
            onChange={(v) => apply({ mainCat: v.map(Number), cat: [] })}
          />
          <FilterFacet label="Categories" count={cat.length} width="w-[420px]" icon={<Filter className="size-3.5" />}>
            <FacetSection title="Categories">
              <div className="grid max-h-72 grid-cols-2 gap-x-3 overflow-y-auto">
                {(mainCat.length ? MAIN_CATS.filter((m) => mainCat.includes(m.id)) : MAIN_CATS).map((m) => (
                  <div key={m.id} className="pb-1.5">
                    <div className="py-1 text-[11.5px] font-medium text-muted-foreground">{m.name}</div>
                    {m.cats.map((c) => (
                      <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
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
          return (
            <BlurFade key={t.id} delay={0.05 * i} direction="up" offset={8}>
            <a href={`/t/${t.id}`} className="group block">
              <Card className="py-3.5 transition-colors group-hover:border-brand/40">
                <CardContent className="flex items-center gap-4">
                  <span
                    className={'w-10 shrink-0 text-center font-display text-[28px] font-semibold tabular-nums ' + (i < 3 ? '' : 'text-muted-foreground/45')}
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
                    <div className="truncate font-display text-[14.5px] font-medium group-hover:underline">{t.title}</div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {authors.map((a) => a.name).join(', ')}{t.catname ? ` · ${t.catname}` : ''}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {t.vip === 1 && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
                    <Badge variant="outline" className="font-mono uppercase">{t.filetype?.split(' ')[0]}</Badge>
                  </div>
                  <div className="w-24 shrink-0 text-right font-mono text-[12.5px] tabular-nums">
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
