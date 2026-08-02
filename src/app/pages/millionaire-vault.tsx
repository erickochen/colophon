import { useMemo } from 'react'
import { Coins, Gift, HandCoins, Sparkles, Trophy } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { fmtInt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberRoll } from '@/components/ui/number-roll'
import { Progress } from '@/components/ui/progress'
import { ShineBorder } from '@/components/ui/shine-border'

interface Donor { name: string; href: string | null; amount: number }
interface VaultData {
  pot: number
  goal: number
  started: string | null
  donatedToday: boolean | null
  donors: Donor[]
}

function extract(doc: Document): VaultData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const text = (main.textContent ?? '').replace(/\s+/g, ' ')
  if (!/vault|pot|donat/i.test(text)) return null
  const info = doc.querySelector('#millionInfo')
  const potInfo = info?.textContent?.match(/([\d,]{4,})/)?.[1]
  const potBody = text.match(/pot is at\s*([\d,]{4,})/i)?.[1]
  const pot = Number((potInfo ?? potBody ?? '0').replace(/,/g, '')) || 0
  const goal = Number((text.match(/reaches\s*([\d,]{5,})/i)?.[1] ?? '20000000').replace(/,/g, '')) || 20_000_000
  const started = text.match(/started on\s+(?:the\s+)?(.+?\d{4})/i)?.[1]?.trim() ?? null
  const donatedToday = info ? !/not donated today/i.test(info.getAttribute('title') ?? '') : null
  const donors: Donor[] = []
  for (const tr of main.querySelectorAll('table tr')) {
    const a = tr.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const amt = [...tr.querySelectorAll('td')]
      .map((c) => Number((c.textContent ?? '').replace(/[^\d]/g, '')))
      .find((n) => n > 0)
    if (a && amt) donors.push({ name: a.textContent?.trim() ?? '', href: a.getAttribute('href'), amount: amt })
  }
  donors.sort((a, b) => b.amount - a.amount)
  return { pot, goal, started, donatedToday, donors }
}

export function MillionaireVaultView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  const pct = Math.min(100, (data.pot / data.goal) * 100)
  const remaining = Math.max(0, data.goal - data.pot)

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Millionaire's vault"
        sub="Everyone chips in bonus points. Fill the vault and the whole site wins."
        action={
          data.donatedToday != null && (
            <Badge variant="secondary" className={data.donatedToday ? 'bg-ok/15 text-ok' : 'bg-brand-soft text-accent-foreground'}>
              {data.donatedToday ? 'You donated today' : 'You have not donated today'}
            </Badge>
          )
        }
      />

      <Card className="relative overflow-hidden">
        <ShineBorder shineColor={['oklch(0.78 0.12 85)', 'oklch(0.55 0.09 60)']} duration={14} borderWidth={1.5} />
        <CardContent className="grid items-center gap-6 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4">
            <div>
              <div className="flex items-baseline gap-2">
                <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">
                  {data.pot > 0 ? <NumberRoll value={data.pot} /> : '0'}
                </span>
                <span className="text-[15px] text-muted-foreground">/ {fmtInt(data.goal)} points</span>
              </div>
              {data.started && <p className="mt-1 text-[12.5px] text-muted-foreground">Pot opened {data.started}</p>}
            </div>
            <div className="grid gap-1.5">
              <Progress value={pct} className="h-2.5 [&>div]:bg-brand" />
              <div className="flex justify-between text-[12px] text-muted-foreground">
                <span>{pct.toFixed(1)}% filled</span>
                <span>{fmtInt(remaining)} points to go</span>
              </div>
            </div>
          </div>
          <div className="grid gap-2 md:w-56">
            <Button asChild size="lg" className="w-full">
              <a href="/millionaires/donate.php"><HandCoins /> Donate to the pot</a>
            </Button>
            <p className="text-center text-[11.5px] leading-snug text-muted-foreground">
              Up to 2,000 points a day. Members with a ratio of 1.05 or higher can give.
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft"><Gift className="size-5 text-accent-foreground" /></span>
            <div>
              <div className="text-[14px] font-semibold">Everyone active gets 2 wedges</div>
              <p className="pt-0.5 text-[12.5px] leading-normal text-muted-foreground">When the vault hits {fmtInt(data.goal)}, every active member receives 2 freeleech wedges.</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-start gap-3">
            <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-brand-soft"><Sparkles className="size-5 text-accent-foreground" /></span>
            <div>
              <div className="text-[14px] font-semibold">Donate 2,000+ for 8 more</div>
              <p className="pt-0.5 text-[12.5px] leading-normal text-muted-foreground">Give 2,000 points or more in total and you collect another 8 freeleech wedges on top.</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* pot.php carries no donor table, so this only renders where donors exist. */}
      {data.donors.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle className="flex items-center gap-2"><Trophy className="size-4" /> Top donors</CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-1">
            {data.donors.map((d, i) => (
              <div key={i} className="flex items-center gap-3 px-6 py-2.5 text-[13.5px]">
                <span className="w-6 shrink-0 text-center font-mono text-[13px] font-semibold text-muted-foreground/70">{i + 1}</span>
                {d.href ? <a href={d.href} className="font-medium hover:underline">{d.name}</a> : <span className="font-medium">{d.name}</span>}
                <span className="ml-auto flex items-center gap-1.5 font-mono tabular-nums"><Coins className="size-3.5 text-brand" /> {fmtInt(d.amount)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
