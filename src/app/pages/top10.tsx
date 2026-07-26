import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, Filter, X } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { searchTorrents, parsePeople, coverUrl, type SearchTorrent } from '@/lib/mam-api'
import { MAIN_CATS } from '@/lib/mam-facets'
import { fmtInt } from '@/lib/format'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

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
  const [metric, setMetric] = useState('snatchedDesc')
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
    fetch('https://cdn.myanonamouse.net/stats/js/top10TorAvailable.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: Available) => setAvail(j))
      .catch(() => setAvail(null))
    void load({ year: 'all', week: 'all', metric: 'snatchedDesc', mainCat: [], cat: [] }, null)
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

  const toggle = <T,>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])

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
        action={
          <div className="flex flex-wrap gap-2">
            <Select value={year} onValueChange={(v) => apply({ year: v })}>
              <SelectTrigger size="sm" className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent align="end" className="max-h-72">
                <SelectItem value="all">All time</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
            {year !== 'all' && weeks.length > 0 && (
              <Select value={week} onValueChange={(v) => apply({ week: v })}>
                <SelectTrigger size="sm" className="h-9 w-auto"><SelectValue /></SelectTrigger>
                <SelectContent align="end" className="max-h-72">
                  <SelectItem value="all">Whole year</SelectItem>
                  {weeks.map((w) => <SelectItem key={w} value={w}>Week {w}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
        }
      />

      <div className="grid gap-3">
        <ToggleGroup
          type="single"
          variant="outline"
          value={metric}
          onValueChange={(v) => v && apply({ metric: v })}
          className="justify-start"
        >
          {METRICS.map((m) => <ToggleGroupItem key={m.value} value={m.value} className="px-3 text-[12.5px]">{m.label}</ToggleGroupItem>)}
        </ToggleGroup>

        <div className="flex flex-wrap items-center gap-2">
          {MAIN_CATS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => apply({ mainCat: toggle(mainCat, m.id), cat: [] })}
              className={
                'rounded-md border px-3 py-1.5 text-[12.5px] font-medium transition-colors ' +
                (mainCat.includes(m.id)
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
                Categories
                {cat.length > 0 && <Badge className="ml-0.5 h-4 min-w-4 rounded-full px-1 text-[10px]" variant="secondary">{cat.length}</Badge>}
                <ChevronDown className="size-3.5 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[420px] p-0">
              <div className="grid max-h-[440px] overflow-y-auto p-3">
                <div className="pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Categories</div>
                <div className="grid max-h-72 grid-cols-2 gap-x-3 overflow-y-auto pr-1">
                  {(mainCat.length ? MAIN_CATS.filter((m) => mainCat.includes(m.id)) : MAIN_CATS).map((m) => (
                    <div key={m.id} className="pb-1.5">
                      <div className="py-1 text-[11.5px] font-medium text-muted-foreground">{m.name}</div>
                      {m.cats.map((c) => (
                        <Label key={c.id} className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                          <Checkbox
                            checked={cat.includes(c.id)}
                            onCheckedChange={() => apply({ cat: toggle(cat, c.id) })}
                          />
                          {c.name}
                        </Label>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {cat.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {cat.map((c) => (
                <Badge key={`c${c}`} variant="secondary" className="gap-1">
                  {catName(c)}
                  <button onClick={() => apply({ cat: toggle(cat, c) })}><X className="size-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

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
                  <span className="block h-16 w-11 shrink-0 overflow-hidden rounded-[4px] border bg-muted shadow-sm">
                    {t.poster_type && (
                      <img src={coverUrl(t.id)} alt="" loading="lazy" className="size-full object-cover" onError={(e) => e.currentTarget.remove()} />
                    )}
                  </span>
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
