import { useEffect, useMemo, useState } from 'react'
import { Clock, PartyPopper, Ticket, Trophy } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { fmtInt } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberRoll } from '@/components/ui/number-roll'
import { Separator } from '@/components/ui/separator'
import { ShineBorder } from '@/components/ui/shine-border'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'

interface LottoPlay {
  draw: string
  played: string | null
  outcome: string | null
  won: boolean
  current: boolean
}

interface LottoData {
  potGiB: number
  drawName: string | null
  drawIso: string | null
  drawText: string | null
  infoHtml: string | null
  players: { name: string; color: string | null }[]
  plays: LottoPlay[]
  totalPlayed: string | null
  totalWon: string | null
  canPlay: boolean
}

/** MAM pads its info block with <br> on both ends. */
function trimBreaks(html: string) {
  return html.replace(/^(?:\s|<br\s*\/?>)+/i, '').replace(/(?:\s|<br\s*\/?>)+$/i, '')
}

/** Rows read like "2026-30 played 1 GiB and did not win". */
function readPlay(row: Element): LottoPlay {
  const text = (row.textContent ?? '').replace(/\s+/g, ' ').trim()
  const stake = text.match(/played\s+([\d,]+\s*GiB)/i)
  const tail = stake ? text.slice((stake.index ?? 0) + stake[0].length) : text.replace(/^\S+\s*/, '')
  const rest = tail
    .trim()
    .replace(/^and\s+/i, '')
    .replace(/^\((.*)\)$/, '$1')
    .trim()
  return {
    draw: text.match(/^(\S+)/)?.[1] ?? '',
    played: stake?.[1] ?? null,
    outcome: rest || null,
    won: /\bwon\b/i.test(rest) && !/\bnot\b/i.test(rest),
    current: /current week/i.test(rest),
  }
}

function extract(doc: Document): LottoData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const text = (main.textContent ?? '').replace(/\s+/g, ' ')
  if (!/lotto/i.test(doc.title + ' ' + text)) return null
  const potGiB = Number(text.match(/we have\s*([\d,]+)\s*GiB in the Pot/i)?.[1]?.replace(/,/g, '') ?? '0') || 0
  const drawName = text.match(/Lotto,\s*(\d{4}-\d+)/i)?.[1] ?? null
  const drawIso = doc.querySelector<HTMLAnchorElement>('a[href*="timeanddate"]')?.href.match(/iso=([\dT:-]+)/)?.[1] ?? null
  const drawText = text.match(/drawing is ([^.]+?UTC)/i)?.[1]?.trim() ?? null
  const infoBlock = [...main.querySelectorAll('.blockCon')].find((b) =>
    /lotto info/i.test(b.querySelector('.blockHeadCon h4')?.textContent ?? '')
  )
  const infoBody = infoBlock?.querySelector('.blockBody .blockBodyCon')?.innerHTML
  const players = [...main.querySelectorAll<HTMLElement>('#lotto_players span')].map((s) => ({
    name: s.textContent?.trim() ?? '',
    color: s.style.color || null,
  })).filter((p) => p.name)
  const plays = [...main.querySelectorAll('#plays > div')].map(readPlay).filter((p) => p.draw)
  const results = main.querySelector('#results')?.textContent ?? ''
  const totalPlayed = results.match(/played:\s*([\d,]+\s*GiB)/i)?.[1] ?? null
  const totalWon = results.match(/Winnings:\s*([\d,]+\s*GiB)/i)?.[1] ?? null
  const canPlay = !!doc.querySelector('input[name="PlayLotto"]')
  return {
    potGiB,
    drawName,
    drawIso,
    drawText,
    infoHtml: infoBody ? trimBreaks(infoBody) : null,
    players,
    plays,
    totalPlayed,
    totalWon,
    canPlay,
  }
}

function useCountdown(iso: string | null): string | null {
  const [, tick] = useState(0)
  useEffect(() => {
    if (!iso) return
    const id = window.setInterval(() => tick((n) => n + 1), 1000)
    return () => window.clearInterval(id)
  }, [iso])
  if (!iso) return null
  const target = new Date(iso.endsWith('Z') || /[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z').getTime()
  const diff = target - Date.now()
  if (!Number.isFinite(target) || diff <= 0) return null
  const d = Math.floor(diff / 86400000)
  const h = Math.floor((diff % 86400000) / 3600000)
  const m = Math.floor((diff % 3600000) / 60000)
  const s = Math.floor((diff % 60000) / 1000)
  return [d && `${d}d`, `${h}h`, `${m}m`, `${s}s`].filter(Boolean).join(' ')
}

export function LottoView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [sweeten, setSweeten] = useState('0')
  const countdown = useCountdown(data?.drawIso ?? null)
  if (!data) return <LegacyView {...props} />

  function play() {
    const sel = document.querySelector<HTMLSelectElement>('select[name="sweeten"]')
    const btn = document.querySelector<HTMLInputElement>('input[name="PlayLotto"]')
    if (!btn) {
      toast.error('You already hold a ticket for this draw.')
      return
    }
    if (sel) sel.value = sweeten
    btn.click()
    toast.success('Buying your ticket…', { description: 'MAM is processing it; the page will refresh.' })
  }

  const cost = 1 + Number(sweeten)

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Lotto"
        sub="The weekly multi-winner lotto. One ticket per mouse, one GiB of upload."
        action={data.drawName && <Badge variant="secondary" className="bg-brand-soft text-accent-foreground">Draw {data.drawName}</Badge>}
      />

      <Card className="relative overflow-hidden">
        <ShineBorder shineColor={['oklch(0.78 0.12 85)', 'oklch(0.55 0.16 25)']} duration={14} borderWidth={1.5} />
        <CardContent className="grid items-center gap-6 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-1">
            <span className="text-[12.5px] uppercase tracking-wide text-muted-foreground">In the pot</span>
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">
                {data.potGiB > 0 ? <NumberRoll value={data.potGiB} /> : '0'}
              </span>
              <span className="text-xl text-muted-foreground">GiB</span>
            </div>
            {(countdown || data.drawText) && (
              <p className="mt-1 flex items-center gap-1.5 text-[13px] text-muted-foreground">
                <Clock className="size-3.5" />
                {countdown ? <>Draw in <span className="font-mono font-medium text-foreground">{countdown}</span></> : data.drawText}
              </p>
            )}
          </div>
          <div className="grid gap-2 md:w-64">
            {data.canPlay ? (
              <>
                <div className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <Select value={sweeten} onValueChange={setSweeten}>
                    <SelectTrigger className="h-10"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="0">No sweetener</SelectItem>
                      {[1, 2, 3, 4, 5].map((n) => <SelectItem key={n} value={String(n)}>Sweeten +{n} GiB</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <span className="whitespace-nowrap rounded-md bg-muted px-2.5 py-2 font-mono text-[13px] tabular-nums">−{cost} GiB</span>
                </div>
                <Button size="lg" className="w-full" onClick={play}><Ticket /> Play the lotto</Button>
              </>
            ) : (
              <div className="flex items-center gap-2 rounded-lg bg-ok/10 px-4 py-3 text-[13px] text-ok">
                <PartyPopper className="size-4" /> You hold a ticket for this draw. Good luck!
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <div className={cn('grid items-start gap-4', data.infoHtml && 'lg:grid-cols-[minmax(0,1fr)_320px]')}>
        {data.infoHtml && (
          <Card>
            <CardHeader><CardTitle>How the lotto works</CardTitle></CardHeader>
            <CardContent>
              <RichHtml html={data.infoHtml} className="[&_.styleNone]:list-none" />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="size-4" /> Your lotto history</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            {data.plays.length > 0 ? (
              <div className="-mr-2 grid max-h-[320px] grid-cols-1 gap-1.5 overflow-y-auto pr-2">
                {data.plays.map((p, i) => (
                  <div key={i} className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-baseline gap-2 text-[12.5px]">
                    <span className="font-mono tabular-nums">{p.draw}</span>
                    <span className="tabular-nums text-muted-foreground">{p.played}</span>
                    <span
                      className={cn(
                        'truncate text-right',
                        p.won ? 'font-medium text-ok' : p.current ? 'text-brand' : 'text-muted-foreground'
                      )}
                    >
                      {p.outcome}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[13px] text-muted-foreground">No tickets on record yet.</p>
            )}
            <Separator />
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Total played</span>
              <span className="font-mono font-medium tabular-nums">{data.totalPlayed ?? '0 GiB'}</span>
            </div>
            <div className="flex items-center justify-between text-[13px]">
              <span className="text-muted-foreground">Total winnings</span>
              <span className="font-mono font-medium tabular-nums text-ok">{data.totalWon ?? '0 GiB'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle className="flex items-center gap-2">
            Players in this draw <span className="text-[12px] font-normal text-muted-foreground">{fmtInt(data.players.length)}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-x-3 gap-y-1.5 py-4">
          {data.players.length > 0 ? (
            data.players.map((p, i) => (
              <span key={i} className="text-[12.5px] font-medium" style={{ color: p.color ?? undefined }}>{p.name}</span>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No tickets bought yet. Be the first.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
