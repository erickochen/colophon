import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Gift, History, Coins, Gauge, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'
import type { PageProps } from '@/app/router'
import { fmtInt, relTime } from '@/lib/format'
import { PageHeader, UserLink } from '@/app/shell/bits'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Skeleton } from '@/components/ui/skeleton'

// The tracker's own graph (userBonusPointHistoryJSON.php): a multi-series time
// series of seeding, bonus points, ratio and transfer, 15 min apart. We split
// its 9 Plotly traces into a few focused shadcn charts instead of one 6-axis wall.
interface Trend {
  t: string
  leeching: number; unsat: number; sat: number
  wedges: number; pph: number; bonus: number
  up: number; down: number; ratio: number
}
interface BonusEvent {
  timestamp: number; amount: number; type: string
  tid: number | null; title: string | null
  other_userid: number | null; other_name: string | null
}

const chartConfig = {
  sat: { label: 'Satisfied seeding', color: 'var(--chart-3)' },
  unsat: { label: 'Unsatisfied seeding', color: 'var(--warn)' },
  leeching: { label: 'Leeching', color: 'var(--user-2)' },
  bonus: { label: 'Bonus points', color: 'var(--brand)' },
  pph: { label: 'Points / hour', color: 'var(--chart-2)' },
  ratio: { label: 'Ratio', color: 'var(--chart-5)' },
  wedges: { label: 'FL wedges', color: 'var(--chart-4)' },
} satisfies ChartConfig


/* The shadcn chart look: series fade from their color into the paper. */
function Grad({ id }: { id: string }) {
  return (
    <linearGradient id={`fill-${id}`} x1="0" y1="0" x2="0" y2="1">
      <stop offset="5%" stopColor={`var(--color-${id})`} stopOpacity={0.8} />
      <stop offset="95%" stopColor={`var(--color-${id})`} stopOpacity={0.1} />
    </linearGradient>
  )
}

const compactTick = (v: number) => (Math.abs(v) >= 1000 ? `${Math.round(v / 1000)}k` : String(v))

/* Quarter-hour samples draw as sawtooth; average them into ~72 buckets so
 * the curves read as trends, the way modern dashboards do. */
function downsample(rows: Trend[], target: number): Trend[] {
  if (rows.length <= target) return rows
  const NUMERIC = ['leeching', 'unsat', 'sat', 'wedges', 'pph', 'bonus', 'up', 'down', 'ratio'] as const
  const size = rows.length / target
  const out: Trend[] = []
  for (let i = 0; i < target; i++) {
    const start = Math.floor(i * size)
    const end = Math.max(Math.floor((i + 1) * size), start + 1)
    const slice = rows.slice(start, end)
    const mid = { ...slice[Math.floor(slice.length / 2)] }
    for (const k of NUMERIC) {
      let sum = 0
      for (const r of slice) sum += r[k]
      mid[k] = sum / slice.length
    }
    out.push(mid)
  }
  out[out.length - 1] = rows[rows.length - 1]
  return out
}

const RANGES = [
  { k: 'day', label: '24h', pts: 96 },
  { k: 'week', label: '7d', pts: 672 },
  { k: 'all', label: 'All', pts: Infinity },
] as const
type RangeKey = (typeof RANGES)[number]['k']

function tick(t: string): string {
  // Server timestamp -> "Jul 17"; day granularity keeps the axis readable.
  const d = new Date(t.replace(' ', 'T'))
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

function eventLabel(e: BonusEvent): string {
  switch (e.type) {
    case 'giftPoints': return 'Gift received'
    case 'giftSent': return 'Gift sent'
    default: return e.type.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase()).trim()
  }
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-accent-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-[11.5px] text-muted-foreground">{label}{hint && <span className="text-muted-foreground/70"> · {hint}</span>}</div>
        </div>
      </CardContent>
    </Card>
  )
}

export function BonusHistoryView({ page }: PageProps) {
  const [trends, setTrends] = useState<Trend[] | null>(null)
  const [events, setEvents] = useState<BonusEvent[] | null>(null)
  const [range, setRange] = useState<RangeKey>('all')

  useEffect(() => {
    const uid = page.user.uid
    if (uid == null) { setTrends([]); return }
    fetch(`/stats/userBonusPointHistoryJSON.php?uid=${uid}&limited=true`, { credentials: 'include' })
      .then((r) => r.json())
      .then((j: { timestamps: string[]; entries: { name: string; y: number[] }[] }) => {
        const y = (n: string) => j.entries.find((e) => e.name === n)?.y ?? []
        const L = j.timestamps ?? []
        const [le, un, sa, we, pp, bo, up, dn, ra] = [
          y('leeching'), y('unsatisfied seeding'), y('satisfied seeding'), y('Freeleech Wedges'),
          y('points/hour earned'), y('total bonus points'), y('Upload'), y('Download'), y('Ratio'),
        ]
        setTrends(L.map((t, i) => ({
          t, leeching: le[i] ?? 0, unsat: un[i] ?? 0, sat: sa[i] ?? 0, wedges: we[i] ?? 0,
          pph: pp[i] ?? 0, bonus: bo[i] ?? 0, up: up[i] ?? 0, down: dn[i] ?? 0, ratio: ra[i] ?? 0,
        })))
      })
      .catch(() => setTrends([]))
  }, [page.user.uid])

  useEffect(() => {
    fetch('/json/userBonusHistory.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: BonusEvent[]) => setEvents(Array.isArray(j) ? j : []))
      .catch(() => setEvents([]))
  }, [])

  const view = useMemo(() => {
    if (!trends) return []
    const pts = RANGES.find((r) => r.k === range)!.pts
    const rows = pts === Infinity ? trends : trends.slice(-pts)
    return downsample(rows, 72)
  }, [trends, range])

  const stats = useMemo(() => {
    const agg = (pick: (r: Trend) => number) => {
      if (!view.length) return { min: 0, max: 0, avg: 0 }
      let min = Infinity, max = -Infinity, sum = 0
      for (const r of view) { const v = pick(r); if (v < min) min = v; if (v > max) max = v; sum += v }
      return { min, max, avg: sum / view.length }
    }
    return {
      pph: agg((r) => r.pph),
      seeding: agg((r) => r.sat + r.unsat),
      bonus: agg((r) => r.bonus),
      wedges: agg((r) => r.wedges),
      ratio: agg((r) => r.ratio),
    }
  }, [view])

  const last = view.at(-1)
  const loading = trends === null
  const rangeLabel = view.length ? `${tick(view[0].t)} to ${tick(view[view.length - 1].t)}` : ''


  const xAxis = <XAxis dataKey="t" tickFormatter={tick} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={150} tickMargin={8} className="text-[11px]" />

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader title="Bonus history" sub="Seeding, points and ratio over time, from the tracker" />
        <ToggleGroup type="single" variant="outline" value={range} onValueChange={(v) => v && setRange(v as RangeKey)}>
          {RANGES.map((r) => <ToggleGroupItem key={r.k} value={r.k} className="px-3 text-[12.5px]">{r.label}</ToggleGroupItem>)}
        </ToggleGroup>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Coins className="size-5" />} label="bonus points" value={loading ? '–' : <NumberTicker value={Math.round(last?.bonus ?? 0)} />} />
        <Stat icon={<TrendingUp className="size-5" />} label="avg points / hour" hint={`peak ${stats.pph.max.toFixed(1)}`} value={loading ? '–' : stats.pph.avg.toFixed(2)} />
        <Stat icon={<Gauge className="size-5" />} label="ratio" value={loading ? '–' : fmtInt(Math.round(last?.ratio ?? 0))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bonus points</CardTitle>
          <CardDescription>Cumulative points earned in this range.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[250px] w-full" /> : view.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">The tracker did not return any history.</p>
          ) : (
            <ChartContainer config={chartConfig} className="h-[250px] w-full">
              <AreaChart accessibilityLayer data={view} margin={{ left: 12, right: 12 }}>
                <defs><Grad id="bonus" /></defs>
                <CartesianGrid vertical={false} />
                {xAxis}
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                <Area dataKey="bonus" name="Bonus points" type="natural" fill="url(#fill-bonus)" fillOpacity={0.4} stroke="var(--color-bonus)" strokeWidth={2} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        <CardFooter>
          <div className="grid gap-1.5 text-sm">
            <div className="flex items-center gap-2 leading-none font-medium">
              Earned {fmtInt(Math.round(last?.bonus ?? 0))} points this range <TrendingUp className="size-4" />
            </div>
            <div className="leading-none text-muted-foreground">{rangeLabel}</div>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seeding</CardTitle>
          <CardDescription>Satisfied and unsatisfied seeding, plus anything still leeching.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-52 w-full" /> : view.length > 0 && (
            <ChartContainer config={chartConfig} className="h-52 w-full">
              <AreaChart accessibilityLayer data={view} margin={{ left: 12, right: 12 }}>
                <defs><Grad id="sat" /><Grad id="unsat" /><Grad id="leeching" /></defs>
                <CartesianGrid vertical={false} />
                {xAxis}
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
                <Area dataKey="leeching" name="Leeching" stackId="a" type="natural" fill="url(#fill-leeching)" fillOpacity={0.4} stroke="var(--color-leeching)" />
                <Area dataKey="unsat" name="Unsatisfied seeding" stackId="a" type="natural" fill="url(#fill-unsat)" fillOpacity={0.4} stroke="var(--color-unsat)" />
                <Area dataKey="sat" name="Satisfied seeding" stackId="a" type="natural" fill="url(#fill-sat)" fillOpacity={0.4} stroke="var(--color-sat)" />
                <ChartLegend content={<ChartLegendContent />} />
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        <CardFooter>
          <div className="grid gap-1.5 text-sm">
            <div className="leading-none font-medium">
              Seeding {Math.round((last?.sat ?? 0) + (last?.unsat ?? 0))} torrents right now
            </div>
            <div className="leading-none text-muted-foreground">{rangeLabel}</div>
          </div>
        </CardFooter>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {([
          ['ratio', 'Ratio', 'Share ratio over time.'],
          ['wedges', 'Freeleech wedges', 'Wedges in hand over time.'],
        ] as const).map(([key, title, note]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{note}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-44 w-full" /> : view.length > 0 && (
                <ChartContainer config={chartConfig} className="h-44 w-full">
                  <AreaChart accessibilityLayer data={view} margin={{ left: 12, right: 12 }}>
                    <defs><Grad id={key} /></defs>
                    <CartesianGrid vertical={false} />
                    {xAxis}
                    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                    <Area dataKey={key} name={title} type="natural" fill={`url(#fill-${key})`} fillOpacity={0.4} stroke={`var(--color-${key})`} strokeWidth={2} />
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5"><CardTitle>Range summary</CardTitle></CardHeader>
        <CardContent className="px-0 pb-1">
          <div className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-x-4 bg-muted/50 px-6 py-2 text-[11.5px] font-medium uppercase tracking-wide text-muted-foreground">
            <span>Metric</span><span className="text-right">Min</span><span className="text-right">Max</span><span className="text-right">Average</span>
          </div>
          {([
            ['Points / hour', stats.pph, 2],
            ['Seeding (total)', stats.seeding, 1],
            ['Bonus points', stats.bonus, 0],
            ['Freeleech wedges', stats.wedges, 1],
            ['Ratio', stats.ratio, 0],
          ] as [string, { min: number; max: number; avg: number }, number][]).map(([label, s, dp]) => (
            <div key={label} className="grid grid-cols-[1.4fr_repeat(3,1fr)] gap-x-4 px-6 py-2 text-[13px] tabular-nums">
              <span className="font-medium">{label}</span>
              <span className="text-right text-muted-foreground">{loading ? '–' : s.min.toFixed(dp)}</span>
              <span className="text-right text-muted-foreground">{loading ? '–' : s.max.toFixed(dp)}</span>
              <span className="text-right">{loading ? '–' : s.avg.toFixed(dp)}</span>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle className="flex items-center gap-2"><History className="size-4" /> Recent point events</CardTitle>
        </CardHeader>
        <CardContent className="grid px-0 py-1">
          {events?.length === 0 && <p className="px-6 py-8 text-center text-sm text-muted-foreground">No recent point events.</p>}
          {events?.map((e, i) => (
            <div key={i} className="flex items-center justify-between gap-4 px-6 py-2.5 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <Gift className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{eventLabel(e)}</span>
                {e.other_name && <> · <UserLink name={e.other_name} href={e.other_userid ? `/u/${e.other_userid}` : null} /></>}
                {e.title && <span className="truncate text-muted-foreground"> · {e.title}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={'font-mono tabular-nums ' + (e.amount >= 0 ? 'text-ok' : 'text-destructive')}>{e.amount >= 0 ? '+' : ''}{fmtInt(e.amount)}</span>
                <span className="w-16 text-right text-[11.5px] text-muted-foreground">{relTime(new Date(e.timestamp * 1000).toISOString())}</span>
              </span>
            </div>
          ))}
          {events === null && <div className="grid gap-2 px-6 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>}
        </CardContent>
      </Card>
    </div>
  )
}

/** Small colour-keyed legend, matching chartConfig labels. */
function Legend({ items }: { items: (keyof typeof chartConfig)[] }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-[11.5px] text-muted-foreground">
      {items.map((k) => (
        <span key={k} className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px]" style={{ background: chartConfig[k].color }} />
          {chartConfig[k].label}
        </span>
      ))}
    </div>
  )
}
