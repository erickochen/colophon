import { useEffect, useMemo, useState } from 'react'
import { Gift, HandCoins, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { fmtInt } from '@/lib/format'
import { cleanHtml } from '@/lib/sanitize'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberRoll } from '@/components/ui/number-roll'
import { Progress } from '@/components/ui/progress'
import { ShineBorder } from '@/components/ui/shine-border'
import { Slider } from '@/components/ui/slider'
import { toast } from '@/components/ui/toast'

// The site hands out 8 extra wedges to everyone who gave this much to a pot.
const WEDGE_BONUS_AT = 2000
// Fallback for the daily cap when the page text does not spell it out.
const DAILY_MAX = 2000
// Shortcuts next to the slider; anything above the day's allowance is dropped.
const QUICK_AMOUNTS = [100, 500, 1000]

interface Donation {
  at: Date | null
  raw: string
  amount: number
}

interface VaultData {
  pot: number
  goal: number
  started: string | null
  donatedToday: boolean | null
  donations: Donation[]
}

interface DonateData {
  options: number[]
  remaining: number | null
  dailyMax: number
  thanks: number | null
  donatedToday: boolean | null
  notice: string | null
  donations: Donation[]
}

/** Both vault pages end in the same Date/Amount table of your own donations. */
function readDonations(main: Element): Donation[] {
  const out: Donation[] = []
  for (const table of main.querySelectorAll('table')) {
    const heads = [...table.querySelectorAll('th')].map((th) => (th.textContent ?? '').trim().toLowerCase())
    const dateCol = heads.indexOf('date')
    const amountCol = heads.indexOf('amount')
    if (dateCol < 0 || amountCol < 0) continue
    for (const tr of table.querySelectorAll('tr')) {
      const cells = [...tr.querySelectorAll('td')]
      if (cells.length <= Math.max(dateCol, amountCol)) continue
      const raw = (cells[dateCol].textContent ?? '').trim()
      const amount = Number((cells[amountCol].textContent ?? '').replace(/[^\d]/g, ''))
      if (!amount) continue
      const at = new Date(raw)
      out.push({ raw, at: Number.isNaN(at.getTime()) ? null : at, amount })
    }
  }
  return out.sort((a, b) => (b.at?.getTime() ?? 0) - (a.at?.getTime() ?? 0))
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** Donations are stamped in UTC; read them back in the reader's own clock. */
function whenLabel(d: Donation): string {
  if (!d.at) return d.raw
  const time = d.at.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
  const now = new Date()
  if (sameDay(d.at, now)) return `Today ${time}`
  const yesterday = new Date(now)
  yesterday.setDate(yesterday.getDate() - 1)
  if (sameDay(d.at, yesterday)) return `Yesterday ${time}`
  return `${d.at.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })} ${time}`
}

function donatedTodayFrom(doc: Document): boolean | null {
  const title = doc.querySelector('#millionInfo')?.getAttribute('title')
  if (!title) return null
  return !/not donated today/i.test(title)
}

function DonatedBadge({ donated }: { donated: boolean | null }) {
  if (donated == null) return null
  return (
    <Badge variant="secondary" className={donated ? 'bg-ok/15 text-ok' : 'bg-brand-soft text-accent-foreground'}>
      {donated ? 'You donated today' : 'You have not donated today'}
    </Badge>
  )
}

function VaultDonations({ donations }: { donations: Donation[] }) {
  const total = donations.reduce((sum, d) => sum + d.amount, 0)
  const toBonus = Math.max(0, WEDGE_BONUS_AT - total)

  return (
    <Card className="gap-0 py-0">
      <CardHeader className="!py-3.5">
        <CardTitle className="flex items-center gap-2">
          <HandCoins className="size-4" /> Your donations to this pot
        </CardTitle>
      </CardHeader>
      <CardContent className="px-0 pb-2">
        {donations.length === 0 ? (
          <p className="px-6 pb-6 text-[13px] text-muted-foreground">Nothing given to this pot yet.</p>
        ) : (
          <>
            <div className="grid gap-1.5 px-6 pb-4">
              <div className="flex items-baseline gap-2">
                <span className="font-display text-3xl font-semibold tabular-nums">
                  <NumberRoll value={total} />
                </span>
                <span className="text-[13px] text-muted-foreground">points given</span>
              </div>
              <Progress value={Math.min(100, (total / WEDGE_BONUS_AT) * 100)} className="h-2 [&>div]:bg-brand-fill" />
              <p className="text-[12px] text-muted-foreground">
                {toBonus > 0
                  ? `${fmtInt(toBonus)} more to this pot for 8 extra wedges`
                  : '8 extra wedges waiting for you when the vault fills'}
              </p>
            </div>
            <div className="max-h-[320px] overflow-y-auto">
              {donations.map((d, i) => (
                <div key={i} className="flex items-center justify-between gap-4 px-6 py-2 text-[13px]">
                  <span className="text-muted-foreground" title={d.raw}>{whenLabel(d)}</span>
                  <span className="font-mono tabular-nums">{fmtInt(d.amount)}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

function readVault(doc: Document): VaultData | null {
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
  return { pot, goal, started, donatedToday: donatedTodayFrom(doc), donations: readDonations(main) }
}

export function MillionaireVaultView(props: PageProps) {
  const data = useMemo(() => readVault(document), [])
  if (!data) return <LegacyView {...props} />

  const pct = Math.min(100, (data.pot / data.goal) * 100)
  const remaining = Math.max(0, data.goal - data.pot)

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Millionaire's vault"
        sub="Everyone chips in bonus points. Fill the vault and the whole site wins."
        action={<DonatedBadge donated={data.donatedToday} />}
      />

      <Card className="relative overflow-hidden">
        <ShineBorder shineColor={['oklch(0.78 0.12 85)', 'oklch(0.55 0.09 60)']} duration={14} borderWidth={1.5} />
        <CardContent className="grid items-center gap-6 py-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="grid gap-4">
            <div>
              <div className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">
                  {data.pot > 0 ? <NumberRoll value={data.pot} /> : '0'}
                </span>
                <span className="whitespace-nowrap text-[15px] text-muted-foreground">/ {fmtInt(data.goal)} points</span>
              </div>
              {data.started && <p className="mt-1 text-[12.5px] text-muted-foreground">Pot opened {data.started}</p>}
            </div>
            <div className="grid gap-1.5">
              <Progress value={pct} className="h-2.5 [&>div]:bg-brand-fill" />
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

      <VaultDonations donations={data.donations} />

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
    </div>
  )
}

function readDonate(doc: Document): DonateData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const text = (main.textContent ?? '').replace(/\s+/g, ' ')
  const select = main.querySelector<HTMLSelectElement>('select[name="Donation"]')
  if (!select && !/donat/i.test(text)) return null
  const options = select
    ? [...select.options].map((o) => Number(o.value)).filter((n) => n > 0).sort((a, b) => a - b)
    : []
  const left = text.match(/currently donate\s*([\d,]+)/i)?.[1]
  const cap = text.match(/donate up to\s*([\d,]+)/i)?.[1]
  const thanks = text.match(/thank you for your donation of\s*([\d,]+)/i)?.[1]
  // Whatever sits outside the form and the history table is the site
  // explaining itself; it carries the reason when there is nothing to give.
  const notice = (() => {
    const clone = main.cloneNode(true) as HTMLElement
    clone.querySelectorAll('form, table, img, br').forEach((el) => el.remove())
    // Stripping the logo leaves its anchor behind as an empty click target.
    clone.querySelectorAll('a').forEach((a) => {
      if (!(a.textContent ?? '').trim()) a.remove()
    })
    return (clone.textContent ?? '').trim().length > 2 ? cleanHtml(clone) : null
  })()
  return {
    options,
    remaining: left ? Number(left.replace(/,/g, '')) : null,
    dailyMax: cap ? Number(cap.replace(/,/g, '')) || DAILY_MAX : DAILY_MAX,
    thanks: thanks ? Number(thanks.replace(/,/g, '')) || null : null,
    donatedToday: donatedTodayFrom(doc),
    notice,
    donations: readDonations(main),
  }
}

export function VaultDonateView(props: PageProps) {
  const data = useMemo(() => readDonate(document), [])
  const options = data?.options ?? []
  const max = options.at(-1) ?? 0
  const min = options[0] ?? 0
  const step = options.length > 1 ? options[1] - options[0] : min
  // The site preselects the largest amount you may still give; keep that.
  const [amount, setAmount] = useState(max)
  const [sending, setSending] = useState(false)

  // A page restored from the back/forward cache keeps its React state, so the
  // button would still read as sending.
  useEffect(() => {
    const onShow = (e: PageTransitionEvent) => {
      if (e.persisted) setSending(false)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  // Toasts raised while mount effects flush never reach the toaster.
  useEffect(() => {
    const thanks = data?.thanks
    if (!thanks) return
    const id = window.setTimeout(() => toast.success(`${fmtInt(thanks)} points added to the vault`), 0)
    return () => window.clearTimeout(id)
  }, [data?.thanks])

  if (!data) return <LegacyView {...props} />

  function give() {
    const select = document.querySelector<HTMLSelectElement>('select[name="Donation"]')
    const submit = select?.form?.querySelector<HTMLInputElement>('input[type="submit"]')
    if (!select || !submit) {
      toast.error('The donation form is missing. Reload the page and try again.')
      return
    }
    select.value = String(amount)
    setSending(true)
    // Click the real button: the endpoint needs its name and value in the post.
    submit.click()
  }

  const left = data.remaining ?? max
  const quick = [...QUICK_AMOUNTS.filter((n) => n >= min && n < max), max]

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title="Give to the vault"
        sub={props.page.vault ? `The vault holds ${props.page.vault} points right now.` : undefined}
        action={<DonatedBadge donated={data.donatedToday} />}
      />

      {options.length > 0 ? (
        <Card className="relative overflow-hidden">
          <ShineBorder shineColor={['oklch(0.78 0.12 85)', 'oklch(0.55 0.09 60)']} duration={14} borderWidth={1.5} />
          <CardContent className="grid gap-5">
            <div className="flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold tabular-nums tracking-tight">{fmtInt(amount)}</span>
              <span className="text-[15px] text-muted-foreground">points</span>
            </div>

            <div className="flex flex-wrap gap-2">
              {quick.map((n) => (
                <Button
                  key={n}
                  type="button"
                  variant={n === amount ? 'default' : 'outline'}
                  size="sm"
                  className="h-8 text-[12.5px]"
                  onClick={() => setAmount(n)}
                >
                  {n === max ? `Max ${fmtInt(n)}` : fmtInt(n)}
                </Button>
              ))}
            </div>

            <div className="grid gap-1.5">
              <Slider
                thumbLabel="Amount to give"
                className="[&_[data-slot=slider-range]]:bg-brand-fill"
                value={amount}
                onValueChange={(v) => setAmount(Array.isArray(v) ? (v[0] ?? min) : v)}
                min={min}
                max={max}
                step={step}
              />
              <div className="flex justify-between text-[12px] tabular-nums text-muted-foreground">
                <span>{fmtInt(min)}</span>
                <span>{fmtInt(max)}</span>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[12.5px] text-muted-foreground">
                {fmtInt(left)} of {fmtInt(data.dailyMax)} left to give today
              </span>
              <Button size="lg" onClick={give} disabled={sending}>
                <HandCoins /> {sending ? 'Sending' : `Give ${fmtInt(amount)} points`}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="grid gap-3">
            <div className="text-[14px] font-semibold">Nothing to give right now</div>
            {data.notice ? (
              <RichHtml html={data.notice} />
            ) : (
              <p className="text-[13px] text-muted-foreground">
                You have given your {fmtInt(data.dailyMax)} for today. The allowance comes back tomorrow.
              </p>
            )}
            <Button asChild variant="outline" size="sm" className="w-fit">
              <a href="/millionaires/pot.php">Back to the vault</a>
            </Button>
          </CardContent>
        </Card>
      )}

      <VaultDonations donations={data.donations} />
    </div>
  )
}
