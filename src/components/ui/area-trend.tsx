import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

// Room for the date labels under the plot.
const AXIS_H = 22
const PAD_X = 12
const PAD_TOP = 8
// Horizontal guides, matching the four the old chart drew.
const GRID_LINES = 4
// Minimum distance between two date labels, their own width included.
const TICK_GAP = 200
const DOT_R = 3.5
// Fill runs from this opacity at the top down to the second one at the baseline.
const FILL_TOP = 0.8
const FILL_BOTTOM = 0.1
const FILL_OPACITY = 0.4
// Keeps the tooltip inside the plot when the cursor nears the right edge.
const TIP_W = 150
const TIP_OFFSET = 12

interface Pt { x: number; y: number }
interface Seg { c1: Pt; c2: Pt; p: Pt }

export interface TrendSeries<T> {
  key: keyof T & string
  label: string
  color: string
}

interface AreaTrendProps<T> {
  data: readonly T[]
  series: readonly TrendSeries<T>[]
  /** Axis label for a row, already formatted. */
  x: (row: T) => string
  /** Stack the series on top of each other instead of overlaying them. */
  stacked?: boolean
  legend?: boolean
  indicator?: 'dot' | 'line'
  strokeWidth?: number
  className?: string
}

/** Slopes for a monotone cubic fit, so a spike never overshoots into a dip. */
function slopes(pts: Pt[]): number[] {
  const n = pts.length
  if (n < 2) return [0]
  const dx: number[] = []
  const s: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const h = pts[i + 1].x - pts[i].x
    dx.push(h)
    s.push(h === 0 ? 0 : (pts[i + 1].y - pts[i].y) / h)
  }
  const m = [s[0]]
  for (let i = 1; i < n - 1; i++) {
    if (s[i - 1] * s[i] <= 0) {
      m.push(0)
    } else {
      const w1 = 2 * dx[i] + dx[i - 1]
      const w2 = dx[i] + 2 * dx[i - 1]
      m.push((w1 + w2) / (w1 / s[i - 1] + w2 / s[i]))
    }
  }
  m.push(s[n - 2])
  return m
}

function segments(pts: Pt[]): Seg[] {
  const m = slopes(pts)
  const out: Seg[] = []
  for (let i = 0; i < pts.length - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3
    out.push({
      c1: { x: pts[i].x + h, y: pts[i].y + m[i] * h },
      c2: { x: pts[i + 1].x - h, y: pts[i + 1].y - m[i + 1] * h },
      p: pts[i + 1],
    })
  }
  return out
}

const draw = (s: Seg) => `C${s.c1.x},${s.c1.y} ${s.c2.x},${s.c2.y} ${s.p.x},${s.p.y}`

function line(pts: Pt[], segs: Seg[]): string {
  if (!pts.length) return ''
  return `M${pts[0].x},${pts[0].y}` + segs.map(draw).join('')
}

/** Same curve walked backwards, so a stacked band shares its neighbour's edge exactly. */
function reverse(pts: Pt[], segs: Seg[]): string {
  let d = ''
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i]
    d += `C${s.c2.x},${s.c2.y} ${s.c1.x},${s.c1.y} ${pts[i].x},${pts[i].y}`
  }
  return d
}

export function AreaTrend<T>({
  data, series, x, stacked = false, legend = false,
  indicator = 'dot', strokeWidth = 2, className,
}: AreaTrendProps<T>) {
  const uid = useId().replace(/:/g, '')
  const plot = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [at, setAt] = useState<number | null>(null)

  useEffect(() => {
    const el = plot.current
    if (!el) return
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const geo = useMemo(() => {
    const n = data.length
    const plotW = Math.max(size.w - PAD_X * 2, 1)
    const plotH = Math.max(size.h - PAD_TOP - AXIS_H, 1)
    const num = (row: T, k: keyof T & string) => {
      const v = row[k]
      return typeof v === 'number' && Number.isFinite(v) ? v : 0
    }

    // Cumulative tops per series when stacked, plain values when overlaid.
    const tops: number[][] = []
    const running = new Array(n).fill(0)
    for (const s of series) {
      if (stacked) {
        for (let i = 0; i < n; i++) running[i] += num(data[i], s.key)
        tops.push([...running])
      } else {
        tops.push(data.map((row) => num(row, s.key)))
      }
    }

    let max = 0
    for (const t of tops) for (const v of t) if (v > max) max = v
    if (max <= 0) max = 1

    const xAt = (i: number) => PAD_X + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const yAt = (v: number) => PAD_TOP + plotH - (v / max) * plotH

    const bands = series.map((s, si) => {
      const top = tops[si].map((v, i) => ({ x: xAt(i), y: yAt(v) }))
      const baseVals = stacked && si > 0 ? tops[si - 1] : new Array(n).fill(0)
      const base = baseVals.map((v, i) => ({ x: xAt(i), y: yAt(v) }))
      const topSegs = segments(top)
      const baseSegs = segments(base)
      const area = n > 0
        ? `${line(top, topSegs)}L${base[n - 1].x},${base[n - 1].y}${reverse(base, baseSegs)}Z`
        : ''
      return { series: s, area, stroke: line(top, topSegs), top }
    })

    // Keep the first and last label, drop the ones that would crowd.
    const spaced: number[] = []
    if (n > 0) {
      const perPoint = Math.max(plotW / Math.max(n - 1, 1), 1)
      const step = Math.max(1, Math.ceil(TICK_GAP / perPoint))
      for (let i = 0; i < n - 1; i += step) spaced.push(i)
      const last = n - 1
      if (spaced.length > 1 && xAt(last) - xAt(spaced[spaced.length - 1]) < TICK_GAP) spaced.pop()
      if (last > 0) spaced.push(last)
    }

    // Two labels reading the same thing look like a mistake, so keep the later one.
    const ticks: number[] = []
    for (const i of spaced) {
      const prev = ticks[ticks.length - 1]
      if (prev !== undefined && x(data[prev]) === x(data[i])) ticks[ticks.length - 1] = i
      else ticks.push(i)
    }

    return { bands, ticks, xAt, plotH, plotW }
  }, [data, series, stacked, size.w, size.h, x])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = plot.current
    if (!el || data.length === 0) return
    const rect = el.getBoundingClientRect()
    const rel = e.clientX - rect.left - PAD_X
    const frac = geo.plotW <= 0 ? 0 : rel / geo.plotW
    const i = Math.round(frac * Math.max(data.length - 1, 0))
    setAt(Math.min(Math.max(i, 0), data.length - 1))
  }

  // A shorter range can leave the hovered index past the end of the new data.
  const idx = at !== null && at < data.length ? at : null

  const move = (to: number) => {
    if (data.length) setAt(Math.min(Math.max(to, 0), data.length - 1))
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const from = idx ?? 0
    if (e.key === 'ArrowRight') move(from + 1)
    else if (e.key === 'ArrowLeft') move(from - 1)
    else if (e.key === 'Home') move(0)
    else if (e.key === 'End') move(data.length - 1)
    else if (e.key === 'Escape') setAt(null)
    else return
    e.preventDefault()
  }

  const rows = idx === null ? [] : geo.bands.map((b) => {
    const raw = data[idx][b.series.key]
    return {
      label: b.series.label,
      color: b.series.color,
      value: typeof raw === 'number' && Number.isFinite(raw) ? raw : 0,
      y: b.top[idx]?.y ?? 0,
      cx: b.top[idx]?.x ?? 0,
    }
  })
  const summary = series.map((s) => s.label).join(', ')

  return (
    <div className={cn('flex flex-col text-xs', className)}>
      <div
        ref={plot}
        className="relative min-h-0 flex-1 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
        tabIndex={0}
        role="group"
        aria-label={`${summary}. Use the arrow keys to read each point.`}
        onPointerMove={onMove}
        onPointerLeave={() => setAt(null)}
        onKeyDown={onKeyDown}
        onBlur={() => setAt(null)}
      >
        {/* Out of flow: a sized svg is a replaced element that would otherwise
            hold its card open instead of shrinking with it. */}
        <svg
          width={size.w}
          height={size.h}
          role="img"
          aria-label={`Trend chart: ${summary}`}
          className="absolute inset-0"
        >
          <defs>
            {geo.bands.map((b) => (
              <linearGradient key={b.series.key} id={`t${uid}-${b.series.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={b.series.color} stopOpacity={FILL_TOP} />
                <stop offset="95%" stopColor={b.series.color} stopOpacity={FILL_BOTTOM} />
              </linearGradient>
            ))}
          </defs>

          {Array.from({ length: GRID_LINES + 1 }).map((_, i) => {
            const y = PAD_TOP + (geo.plotH / GRID_LINES) * i
            return (
              <line
                key={i}
                x1={PAD_X}
                x2={Math.max(size.w - PAD_X, PAD_X)}
                y1={y}
                y2={y}
                strokeDasharray="3 3"
                className="stroke-border/50"
              />
            )
          })}

          {geo.bands.map((b) => (
            <g key={b.series.key}>
              <path d={b.area} fill={`url(#t${uid}-${b.series.key})`} fillOpacity={FILL_OPACITY} />
              <path d={b.stroke} fill="none" stroke={b.series.color} strokeWidth={strokeWidth} />
            </g>
          ))}

          {rows.map((r) => (
            <circle
              key={r.label}
              cx={r.cx}
              cy={r.y}
              r={DOT_R}
              fill={r.color}
              strokeWidth={2}
              className="stroke-background"
            />
          ))}

          {geo.ticks.map((i) => (
            <text
              key={i}
              x={geo.xAt(i)}
              y={PAD_TOP + geo.plotH + AXIS_H - 6}
              textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'}
              className="fill-muted-foreground text-[11px]"
            >
              {x(data[i])}
            </text>
          ))}
        </svg>

        {idx !== null && rows.length > 0 && (
          <div
            className="pointer-events-none absolute top-2 z-10 grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl"
            style={{ left: Math.min(Math.max(geo.xAt(idx) + TIP_OFFSET, 0), Math.max(size.w - TIP_W, 0)) }}
          >
            <div className="font-medium">{x(data[idx])}</div>
            <div className="grid gap-1.5">
              {rows.map((r) => (
                <div
                  key={r.label}
                  className={cn('flex w-full flex-wrap items-stretch gap-2', indicator === 'dot' && 'items-center')}
                >
                  <div
                    className={cn('shrink-0 rounded-[2px]', indicator === 'dot' ? 'h-2.5 w-2.5' : 'w-1')}
                    style={{ background: r.color }}
                  />
                  <div className="flex flex-1 items-center justify-between leading-none">
                    <span className="text-muted-foreground">{r.label}</span>
                    <span className="ml-3 font-mono font-medium text-foreground tabular-nums">
                      {Math.round(r.value).toLocaleString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {legend && (
        <div className="flex items-center justify-center gap-4 pt-3">
          {series.map((s) => (
            <div key={s.key} className="flex items-center gap-1.5">
              <div className="h-2 w-2 shrink-0 rounded-[2px]" style={{ background: s.color }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
