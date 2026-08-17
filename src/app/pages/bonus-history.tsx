import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Gift, History, Coins, Gauge, Ticket, TrendingDown, TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import type { PageProps } from '@/app/router'
import { fmtInt, relTime } from '@/lib/format'
import { PageHeader, UserLink } from '@/app/shell/bits'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import {
  ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent, type ChartConfig,
} from '@/components/ui/chart'
import { FilterSegments } from '@/components/filters'
import { NumberRoll } from '@/components/ui/number-roll'
import { Skeleton } from '@/components/ui/skeleton'
import { mamFetch } from '@/lib/mam-fetch'

// The tracker's own graph (userBonusPointHistoryJSON.php): a multi-series time
// series of seeding, bonus points, ratio and transfer, 15 min apart. We split
// its 9 Plotly traces into a few focused charts instead of one 6-axis wall.
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

type MetricKey = 'sat' | 'unsat' | 'leeching' | 'bonus' | 'pph' | 'ratio' | 'wedges' | 'up' | 'down'

const METRICS = {
  sat: { label: 'Satisfied seeding', color: 'var(--chart-3)' },
  unsat: { label: 'Unsatisfied seeding', color: 'var(--chart-4)' },
  leeching: { label: 'Leeching', color: 'var(--chart-2)' },
  bonus: { label: 'Bonus points', color: 'var(--chart-1)' },
  pph: { label: 'Points / hour', color: 'var(--chart-2)' },
  ratio: { label: 'Ratio', color: 'var(--chart-5)' },
  wedges: { label: 'FL wedges', color: 'var(--chart-4)' },
  up: { label: 'Upload (GiB)', color: 'var(--chart-3)' },
  down: { label: 'Download (GiB)', color: 'var(--chart-4)' },
} satisfies Record<MetricKey, { label: string; color: string }> & ChartConfig

/* A band is a gradient area under its own line. Stacked bands share a stackId
 * so they sit on top of each other rather than overlapping. Animation stays off:
 * a range holds hundreds of points and every one of them would tween. */
function band(key: MetricKey, opts: { stacked?: boolean; width?: number } = {}) {
  return (
    <Area
      key={key}
      dataKey={key}
      type="monotone"
      stackId={opts.stacked ? 'a' : undefined}
      stroke={`var(--color-${key})`}
      strokeWidth={opts.width ?? 2}
      fill={`url(#fill-${key})`}
      isAnimationActive={false}
      dot={false}
      activeDot={{ r: 3.5, strokeWidth: 2 }}
    />
  )
}

const FILL_TOP = 0.35
const FILL_BOTTOM = 0.04

function fills(keys: readonly MetricKey[]) {
  return (
    <defs>
      {keys.map((k) => (
        <linearGradient key={k} id={`fill-${k}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="5%" stopColor={`var(--color-${k})`} stopOpacity={FILL_TOP} />
          <stop offset="95%" stopColor={`var(--color-${k})`} stopOpacity={FILL_BOTTOM} />
        </linearGradient>
      ))}
    </defs>
  )
}

/** Axis numbers stay short: 12,400 reads as 12.4k so the lane stays narrow. A
 * decimal that lands on zero is dropped, so 6.0k and 12k do not sit under each
 * other written two different ways. */
function compact(v: number): string {
  const n = Math.abs(v)
  const trim = (s: string) => s.replace(/\.0$/, '')
  if (n >= 1_000_000) return `${trim((v / 1_000_000).toFixed(1))}M`
  if (n >= 1_000) return `${trim((v / 1_000).toFixed(n >= 10_000 ? 0 : 1))}k`
  return String(Math.round(v * 100) / 100)
}

const Y_AXIS_W = 46
// Room for the last axis label so it does not clip against the card edge.
const CHART_MARGIN = { left: 4, right: 12, top: 8 }

// A wide chart is around this many pixels wide. A point per pixel is all one
// can show, so every sample the tracker took is drawn below this.
const MAX_POINTS = 900

/** Thin a long series without flattening it. Each bucket keeps its lowest plus
 * its highest row in time order, so a spike or a dip survives the pass. Height
 * is the top of the drawing: the sum for stacked bands, the tallest series
 * otherwise. */
function sample(rows: Trend[], keys: readonly MetricKey[], stacked = false): Trend[] {
  if (rows.length <= MAX_POINTS) return rows
  const height = (r: Trend) =>
    stacked ? keys.reduce((sum, k) => sum + r[k], 0) : Math.max(...keys.map((k) => r[k]))
  const buckets = Math.floor(MAX_POINTS / 2)
  const size = rows.length / buckets
  const out: Trend[] = []
  for (let i = 0; i < buckets; i++) {
    const start = Math.floor(i * size)
    const end = Math.min(rows.length, Math.max(Math.floor((i + 1) * size), start + 1))
    let lo = start
    let hi = start
    for (let j = start + 1; j < end; j++) {
      if (height(rows[j]) < height(rows[lo])) lo = j
      if (height(rows[j]) > height(rows[hi])) hi = j
    }
    out.push(rows[Math.min(lo, hi)])
    if (lo !== hi) out.push(rows[Math.max(lo, hi)])
  }
  // The newest reading always ends the curve, otherwise the right edge can
  // disagree with the totals beside it.
  const last = rows[rows.length - 1]
  if (out[out.length - 1] !== last) out.push(last)
  return out
}

const DAY_MS = 24 * 60 * 60 * 1000

// Ranges cut on time rather than on a sample count, so a gap in the tracker's
// history cannot stretch a range past the days it names.
const RANGES = [
  { k: 'day', label: '24h', span: DAY_MS },
  { k: 'week', label: '7d', span: 7 * DAY_MS },
  { k: 'all', label: 'All', span: Infinity },
] as const
type RangeKey = (typeof RANGES)[number]['k']
// Up to this span the axis reads as clock times, above it as dates.
const CLOCK_SPAN_MS = 2 * DAY_MS

const parseTs = (t: string) => new Date(t.replace(' ', 'T'))

function tick(t: string): string {
  const d = parseTs(t)
  return Number.isNaN(d.getTime()) ? t : d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
}

/** Axis label. A day of history needs hours, a month needs dates. */
function labelFor(spanMs: number) {
  return (t: string): string => {
    const d = parseTs(t)
    if (Number.isNaN(d.getTime())) return t
    return spanMs <= CLOCK_SPAN_MS
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      : d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  }
}

// Labels past this crowd the lane on a narrow card.
const MAX_TICKS = 8

/** Tick values on day boundaries. A short range switches to hour boundaries.
 * Spacing the axis by distance instead would print the same date twice, since
 * a day holds many samples. */
function axisTicks(rows: Trend[], spanMs: number): string[] {
  const bucket = (t: string) => (spanMs <= CLOCK_SPAN_MS ? t.slice(0, 13) : t.slice(0, 10))
  const firsts: string[] = []
  let prev = ''
  for (const r of rows) {
    const key = bucket(r.t)
    if (key !== prev) {
      firsts.push(r.t)
      prev = key
    }
  }
  const step = Math.max(1, Math.ceil(firsts.length / MAX_TICKS))
  return firsts.filter((_, i) => i % step === 0)
}

/** Tooltip heading: the exact moment, since the axis only carries a rough one.
 * The label arrives as a node, so anything that is not our timestamp goes back
 * out untouched. */
function stamp(label: ReactNode): ReactNode {
  if (typeof label !== 'string') return label
  const d = parseTs(label)
  if (Number.isNaN(d.getTime())) return label
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

/** MAM files a gift under one type whichever way it went, so the sign is what
 * says who gave. */
function eventLabel(e: BonusEvent): string {
  const sent = e.amount < 0
  switch (e.type) {
    case 'giftPoints': return sent ? 'Gift sent' : 'Gift received'
    case 'giftWedge': return sent ? 'Wedge sent' : 'Wedge received'
    case 'wedgePF': return 'Wedge spent'
    default: return e.type.replace(/([A-Z])/g, ' $1').replace(/^\w/, (c) => c.toUpperCase()).trim()
  }
}

/** A gift moved between two members, a wedge landed on a torrent plus anything
 * else is the balance itself. */
function eventIcon(type: string) {
  if (type.startsWith('gift')) return Gift
  if (/wedge/i.test(type)) return Ticket
  return Coins
}

function Stat({ icon, label, value, hint }: { icon: ReactNode; label: string; value: ReactNode; hint?: string }) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-accent-foreground">{icon}</span>
        <div className="min-w-0">
          <div className="font-display text-2xl font-semibold tabular-nums">{value}</div>
          <div className="text-[11.5px] text-muted-foreground">{label}{hint && <span> · {hint}</span>}</div>
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
    mamFetch(`/stats/userBonusPointHistoryJSON.php?uid=${uid}&limited=true`, { credentials: 'include' })
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
          pph: pp[i] ?? 0, bonus: bo[i] ?? 0, up: (up[i] ?? 0) / 2 ** 30, down: (dn[i] ?? 0) / 2 ** 30, ratio: ra[i] ?? 0,
        })))
      })
      .catch(() => setTrends([]))
  }, [page.user.uid])

  useEffect(() => {
    mamFetch('/json/userBonusHistory.php', { credentials: 'include' })
      .then((r) => r.json())
      .then((j: BonusEvent[]) => setEvents(Array.isArray(j) ? j : []))
      .catch(() => setEvents([]))
  }, [])

  const fullView = useMemo(() => {
    if (!trends?.length) return []
    const span = RANGES.find((r) => r.k === range)!.span
    if (span === Infinity) return trends
    // Measured back from the last sample, so the range holds whatever the
    // tracker recorded rather than whatever the clock says.
    const end = parseTs(trends[trends.length - 1].t).getTime()
    if (Number.isNaN(end)) return trends
    return trends.filter((r) => {
      const at = parseTs(r.t).getTime()
      return Number.isNaN(at) || at >= end - span
    })
  }, [trends, range])

  // Each chart thins on the series it draws, so no peak is lost to a metric
  // that sits still on another card.
  const bonusView = useMemo(() => sample(fullView, ['bonus']), [fullView])
  const seedView = useMemo(() => sample(fullView, ['leeching', 'unsat', 'sat'], true), [fullView])
  const transferView = useMemo(() => sample(fullView, ['down', 'up']), [fullView])
  const singleViews = useMemo(
    () => ({
      pph: sample(fullView, ['pph']),
      ratio: sample(fullView, ['ratio']),
      wedges: sample(fullView, ['wedges']),
    }),
    [fullView]
  )

  const stats = useMemo(() => {
    const agg = (pick: (r: Trend) => number) => {
      if (!fullView.length) return { min: 0, max: 0, avg: 0 }
      let min = Infinity, max = -Infinity, sum = 0
      for (const r of fullView) { const v = pick(r); if (v < min) min = v; if (v > max) max = v; sum += v }
      return { min, max, avg: sum / fullView.length }
    }
    return {
      pph: agg((r) => r.pph),
      seeding: agg((r) => r.sat + r.unsat),
      bonus: agg((r) => r.bonus),
      wedges: agg((r) => r.wedges),
      ratio: agg((r) => r.ratio),
    }
  }, [fullView])

  const last = fullView.at(-1)
  const loading = trends === null
  const rangeLabel = fullView.length ? `${tick(fullView[0].t)} to ${tick(fullView[fullView.length - 1].t)}` : ''

  /** What the balance did across the range, walked step by step: everything the
   * tracker added, everything spent plus where the two leave you. */
  const flow = useMemo(() => {
    let earned = 0
    let spent = 0
    for (let i = 1; i < fullView.length; i++) {
      const step = fullView[i].bonus - fullView[i - 1].bonus
      if (step > 0) earned += step
      else spent -= step
    }
    return { earned: Math.round(earned), spent: Math.round(spent), net: Math.round(earned - spent) }
  }, [fullView])

  const span = useMemo(() => {
    if (fullView.length < 2) return 0
    const from = parseTs(fullView[0].t).getTime()
    const to = parseTs(fullView[fullView.length - 1].t).getTime()
    return Number.isFinite(from) && Number.isFinite(to) ? Math.abs(to - from) : 0
  }, [fullView])
  const xLabel = useMemo(() => labelFor(span), [span])
  // Ticks come from the rows a chart actually draws: a thinned series may not
  // hold the row a shared tick list would point at.
  const xTicks = useMemo(
    () => ({
      bonus: axisTicks(bonusView, span),
      seed: axisTicks(seedView, span),
      transfer: axisTicks(transferView, span),
      pph: axisTicks(singleViews.pph, span),
      ratio: axisTicks(singleViews.ratio, span),
      wedges: axisTicks(singleViews.wedges, span),
    }),
    [bonusView, seedView, transferView, singleViews, span]
  )


  return (
    <div className="grid gap-4">
      <PageHeader
        title="Bonus history"
        sub="Seeding, points and ratio over time, from the tracker"
        action={
          <FilterSegments
            options={RANGES.map((r) => ({ value: r.k, label: r.label }))}
            value={range}
            onChange={(v) => setRange(v as RangeKey)}
          />
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={<Coins className="size-5" />} label="bonus points" value={loading ? '–' : <NumberRoll value={Math.round(last?.bonus ?? 0)} />} />
        <Stat icon={<TrendingUp className="size-5" />} label="avg points / hour" hint={`peak ${stats.pph.max.toFixed(1)}`} value={loading ? '–' : stats.pph.avg.toFixed(2)} />
        <Stat icon={<Gauge className="size-5" />} label="ratio" value={loading ? '–' : fmtInt(Math.round(last?.ratio ?? 0))} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Bonus points</CardTitle>
          <CardDescription>What your balance did over this range. Every drop is something you bought.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-[250px] w-full" /> : bonusView.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">The tracker did not return any history.</p>
          ) : (
            <ChartContainer config={METRICS} className="aspect-auto h-[250px] w-full">
              <AreaChart accessibilityLayer data={bonusView} margin={CHART_MARGIN}>
                {fills(['bonus'])}
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} ticks={xTicks.bonus} tickFormatter={xLabel} />
                <YAxis tickLine={false} axisLine={false} width={Y_AXIS_W} tickFormatter={compact} />
                <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={stamp} />} />
                {band('bonus')}
              </AreaChart>
            </ChartContainer>
          )}
        </CardContent>
        <CardFooter>
          <div className="grid gap-1.5 text-sm">
            <div className="flex items-center gap-2 leading-none font-medium">
              Earned {fmtInt(flow.earned)} points this range
              {flow.net >= 0 ? <TrendingUp className="size-4 text-ok" /> : <TrendingDown className="size-4 text-warn" />}
            </div>
            <div className="leading-none text-muted-foreground">
              {flow.spent > 0 ? `Spent ${fmtInt(flow.spent)}, so ${flow.net >= 0 ? '+' : '−'}${fmtInt(Math.abs(flow.net))} on balance · ` : ''}
              {rangeLabel}
            </div>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seeding</CardTitle>
          <CardDescription>Satisfied and unsatisfied seeding, plus anything still leeching.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? <Skeleton className="h-52 w-full" /> : seedView.length > 0 && (
            <ChartContainer config={METRICS} className="aspect-auto h-52 w-full">
              <AreaChart accessibilityLayer data={seedView} margin={CHART_MARGIN}>
                {fills(['leeching', 'unsat', 'sat'])}
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} ticks={xTicks.seed} tickFormatter={xLabel} />
                <YAxis tickLine={false} axisLine={false} width={Y_AXIS_W} tickFormatter={compact} />
                <ChartTooltip content={<ChartTooltipContent labelFormatter={stamp} />} />
                <ChartLegend content={<ChartLegendContent />} />
                {band('leeching', { stacked: true, width: 1 })}
                {band('unsat', { stacked: true, width: 1 })}
                {band('sat', { stacked: true, width: 1 })}
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
          ['pph', 'Points per hour', 'The rate you earn bonus points.'],
          ['ratio', 'Ratio', 'Share ratio over time.'],
          ['wedges', 'Freeleech wedges', 'Wedges in hand over time.'],
        ] as const).map(([key, title, note]) => (
          <Card key={key}>
            <CardHeader>
              <CardTitle>{title}</CardTitle>
              <CardDescription>{note}</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? <Skeleton className="h-44 w-full" /> : singleViews[key].length > 0 && (
                <ChartContainer config={METRICS} className="aspect-auto h-44 w-full">
                  <AreaChart accessibilityLayer data={singleViews[key]} margin={CHART_MARGIN}>
                    {fills([key])}
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} ticks={xTicks[key]} tickFormatter={xLabel} />
                    <YAxis tickLine={false} axisLine={false} width={Y_AXIS_W} tickFormatter={compact} />
                    <ChartTooltip content={<ChartTooltipContent indicator="line" labelFormatter={stamp} />} />
                    {band(key)}
                  </AreaChart>
                </ChartContainer>
              )}
            </CardContent>
          </Card>
        ))}

        <Card>
          <CardHeader>
            <CardTitle>Transfer</CardTitle>
            <CardDescription>Upload and download in this range, in GiB.</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? <Skeleton className="h-44 w-full" /> : transferView.length > 0 && (
              <ChartContainer config={METRICS} className="aspect-auto h-44 w-full">
                <AreaChart accessibilityLayer data={transferView} margin={CHART_MARGIN}>
                  {fills(['down', 'up'])}
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="t" tickLine={false} axisLine={false} tickMargin={8} ticks={xTicks.transfer} tickFormatter={xLabel} />
                  <YAxis tickLine={false} axisLine={false} width={Y_AXIS_W} tickFormatter={compact} />
                  <ChartTooltip content={<ChartTooltipContent labelFormatter={stamp} />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  {band('down', { width: 1 })}
                  {band('up', { width: 1 })}
                </AreaChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
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
          {events?.map((e, i) => {
            const Icon = eventIcon(e.type)
            return (
            <div key={i} className="flex items-center justify-between gap-4 px-6 py-2.5 text-[13px]">
              <span className="flex min-w-0 items-center gap-2">
                <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="font-medium">{eventLabel(e)}</span>
                {e.other_name && <> · <UserLink name={e.other_name} href={e.other_userid ? `/u/${e.other_userid}` : null} /></>}
                {e.title && <span className="truncate text-muted-foreground"> · {e.title}</span>}
              </span>
              <span className="flex shrink-0 items-center gap-3">
                <span className={'font-mono tabular-nums ' + (e.amount >= 0 ? 'text-ok' : 'text-destructive')}>{e.amount >= 0 ? '+' : ''}{fmtInt(e.amount)}</span>
                <span className="w-16 text-right text-[11.5px] text-muted-foreground">{relTime(new Date(e.timestamp * 1000).toISOString())}</span>
              </span>
            </div>
            )
          })}
          {events === null && <div className="grid gap-2 px-6 py-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}</div>}
        </CardContent>
      </Card>
    </div>
  )
}
