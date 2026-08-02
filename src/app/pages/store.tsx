import { useMemo, useState } from 'react'
import { ArrowUpFromLine, CircleDollarSign, Crown, Gift, History, ShoppingBag, Ticket } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractStore, type StoreSection } from '@/lib/extract/store'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { fmtInt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberRoll } from '@/components/ui/number-roll'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

function sectionIcon(title: string) {
  const t = title.toLowerCase()
  if (/upload|credit/.test(t)) return ArrowUpFromLine
  if (/vip/.test(t)) return Crown
  if (/wedge|freeleech/.test(t)) return Ticket
  if (/gift|point/.test(t)) return Gift
  return ShoppingBag
}

const costOf = (s: string) => {
  const n = Number(s.replace(/[^\d]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

function Section({ s, points }: { s: StoreSection; points: number | null }) {
  const [values, setValues] = useState<Record<string, string>>({})
  const Icon = sectionIcon(s.title)

  function buy(selector: string, label: string) {
    for (const inp of s.inputs) {
      const el = document.querySelector<HTMLInputElement>(`.storeTable input[name="${CSS.escape(inp.name)}"]`)
      if (el) el.value = values[inp.name] ?? ''
    }
    if (s.inputs.length > 0 && s.inputs.some((i) => !(values[i.name] ?? '').trim())) {
      toast.warning('Fill in the field first.')
      return
    }
    const btn = document.querySelector<HTMLButtonElement>(selector)
    if (!btn) return toast.error('Store control not found.')
    btn.click()
    toast.success(`Requested: ${s.title} · ${label}`, { description: 'MAM is processing it; the page will refresh.' })
    window.setTimeout(() => location.reload(), 1800)
  }

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="flex flex-row items-center gap-2.5 !py-3.5">
        <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft"><Icon className="size-4 text-accent-foreground" /></span>
        <CardTitle>{s.title === 'Title' ? 'Custom title' : s.title}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 px-6 py-5">
        {s.descHtml && <RichHtml html={s.descHtml} className="text-[12.5px] text-muted-foreground" />}
        {s.inputs.map((inp) => (
          <Input
            key={inp.name}
            value={values[inp.name] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
            placeholder={inp.placeholder}
            className="max-w-56"
          />
        ))}
        <div className="flex flex-wrap gap-2">
          {s.offers.map((o) => {
            const c = costOf(o.cost)
            const affordable = points == null || c == null || c <= points
            return (
              <button
                key={o.buttonSelector + o.label}
                onClick={() => buy(o.buttonSelector, o.label)}
                className={cn(
                  'group grid gap-0.5 rounded-lg border px-3.5 py-2 text-left transition-colors',
                  affordable ? 'hover:border-brand/50 hover:bg-brand-soft/40' : 'opacity-55 hover:opacity-100'
                )}
                title={affordable ? `Buy for ${o.cost}` : `Costs ${o.cost}, keep earning`}
              >
                <span className="text-[13.5px] font-semibold">{o.label}</span>
                <span className={cn('text-[11px]', affordable ? 'text-brand' : 'text-muted-foreground')}>{o.cost}</span>
              </button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

export function StoreView(props: PageProps) {
  const data = useMemo(() => extractStore(document), [])
  if (!data) return <LegacyView {...props} />
  const points = data.points ? Number(data.points.replace(/[^\d]/g, '')) : null
  const cheese = data.cheese ? Number(data.cheese.replace(/[^\d]/g, '')) : null

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Bonus store"
        sub="Turn seeding points into ratio, VIP time and freeleech wedges."
        action={
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href="/stats/userBonusPointHistory.php"><History /> Points history</a>
          </Button>
        }
      />

      <Card className="overflow-hidden">
        <CardContent className="grid gap-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:items-center">
          <div className="flex items-center gap-3">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft"><CircleDollarSign className="size-6 text-accent-foreground" /></span>
            <div>
              <div className="font-display text-3xl font-semibold tabular-nums leading-none">
                {points != null ? <NumberRoll value={points} /> : (data.points ?? '–')}
              </div>
              <div className="pt-1 text-[11.5px] text-muted-foreground">bonus points</div>
            </div>
          </div>
          <div className="flex items-center gap-3 sm:pl-5">
            <span className="flex size-12 items-center justify-center rounded-xl bg-brand-soft text-2xl">🧀</span>
            <div>
              <div className="font-display text-3xl font-semibold tabular-nums leading-none">{cheese != null ? fmtInt(cheese) : (data.cheese ?? '–')}</div>
              <div className="pt-1 text-[11.5px] text-muted-foreground">cheese</div>
            </div>
          </div>
          {data.earningHtml && (
            <div className="sm:pl-5">
              <RichHtml html={data.earningHtml} className="text-[11.5px] leading-relaxed text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      <div className="gap-4 [column-fill:balance] lg:columns-2">
        {data.sections.map((s) => (
          <div key={s.title} className="mb-4 break-inside-avoid">
            <Section s={s} points={points} />
          </div>
        ))}
      </div>
    </div>
  )
}
