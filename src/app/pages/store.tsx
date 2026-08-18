import { useMemo, useState } from 'react'
import { ArrowUpFromLine, Check, Crown, History, ShoppingBag, Ticket, Timer, Type } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractStore, type StoreOffer, type StoreSection } from '@/lib/extract/store'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { fmtInt } from '@/lib/format'
import { applyPointsUpdate, useLiveBonus, useLiveWedges } from '@/lib/bonus'
import { buySeedtime, buyTitle, buyUploadCredit, buyVip, buyWedge, type BonusBuyResult } from '@/lib/mam-api'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { NumberRoll } from '@/components/ui/number-roll'
import { Slider } from '@/components/ui/slider'
import { Spinner } from '@/components/ui/spinner'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

/** Custom titles are staff-approved and MAM's own field asks for this much. */
const TITLE_MIN_LENGTH = 4
const TITLE_MAX_LENGTH = 40
const HOURS_PER_DAY = 24
/** Under this many hours the wait reads in hours rather than days. */
const HOURS_IN_WORDS = 48

/** A price in our own thousands separators, falling back to MAM's wording where
 * the figure is variable. */
const priceLabel = (offer: StoreOffer): string =>
  offer.points != null ? `${fmtInt(offer.points)} points` : offer.cost

/** A counter MAM printed, as a figure. Null means the page never said, which is
 * a different thing from zero: an empty balance still has to lock the buttons. */
const num = (raw: string | null | undefined): number | null => {
  const digits = (raw ?? '').replace(/[^\d.]/g, '')
  if (digits === '') return null
  const n = Number(digits)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** How much a step buys: "2.5 GB" gives 2.5, "Max me out!" gives nothing. */
const quantityOf = (label: string): number | null => {
  const m = /^([\d.]+)\s/.exec(label.trim())
  return m ? Number(m[1]) : null
}

/** What the balance still has to grow before a price is in reach, in the
 * reader's own words. Nothing comes back once they can already afford it. */
function waitFor(cost: number, balance: number, perHour: number | null): string | null {
  if (cost <= balance) return null
  if (!perHour || perHour <= 0) return null
  const hours = (cost - balance) / perHour
  if (hours < 1) return 'within the hour'
  if (hours < HOURS_IN_WORDS) return `in about ${Math.round(hours)} hours`
  return `in about ${Math.round(hours / HOURS_PER_DAY)} days`
}

interface Purchase {
  /** Sentence for the confirm, e.g. "20 GB of upload credit". */
  what: string
  cost: string
  /** Runs the actual spend. */
  run: () => Promise<BonusBuyResult>
  /** Points left afterwards, where the price is a plain figure. */
  left: number | null
}

/** One confirm for every purchase in the store, naming what it buys plus what
 * the balance is left with. Spending points cannot be taken back. */
function ConfirmPurchase({ purchase, onClose }: { purchase: Purchase; onClose: () => void }) {
  const [busy, setBusy] = useState(false)

  async function go() {
    setBusy(true)
    try {
      const result = await purchase.run()
      applyPointsUpdate(result)
      toast.success(`Bought ${purchase.what}`)
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The store turned that down.')
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent size="sm" className="gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Buy {purchase.what}?</AlertDialogTitle>
          <AlertDialogDescription>
            That costs {purchase.cost}.
            {purchase.left != null && ` You keep ${fmtInt(purchase.left)} points.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} disabled={busy}>
            {busy ? <Spinner className="size-3.5" /> : <Check />} Buy it
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Head of every block: what it sells plus, where the steps allow it, what one
 * unit costs. A store that prices the same at every step should say so. */
function BlockHead({ icon, title, rate }: { icon: React.ReactNode; title: string; rate?: string | null }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 className="flex items-center gap-2 font-display text-[17px] font-semibold">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </h2>
      {rate && <span className="text-[12.5px] tabular-nums text-muted-foreground">{rate}</span>}
    </div>
  )
}

/** Steps on one line: the slider picks, the row under it reads as a price list
 * where everything out of reach is dimmed. */
function StepRow({
  offers, index, onIndex, balance,
}: {
  offers: StoreOffer[]
  index: number
  onIndex: (i: number) => void
  balance: number | null
}) {
  return (
    <div className="grid gap-2">
      <Slider
        thumbLabel="How much to buy"
        className="[&_[data-slot=slider-range]]:bg-brand-fill"
        value={index}
        onValueChange={(v) => onIndex(Array.isArray(v) ? (v[0] ?? 0) : v)}
        min={0}
        max={offers.length - 1}
        step={1}
      />
      <div className="flex items-baseline justify-between gap-1 text-[11.5px] tabular-nums">
        {offers.map((o, i) => {
          const reach = o.points == null || balance == null || o.points <= balance
          return (
            <button
              key={o.label + i}
              type="button"
              onClick={() => onIndex(i)}
              className={cn(
                'rounded px-1 py-0.5 transition-colors hover:text-foreground',
                i === index ? 'font-semibold text-foreground' : reach ? 'text-muted-foreground' : 'text-muted-foreground/45'
              )}
              title={reach ? o.cost : `${o.cost}, out of reach for now`}
            >
              {o.label.replace(/\s*(GB|Weeks?)$/i, '')}
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Upload credit plus VIP: many steps of the same thing, so one slider covers
 * the block and the button carries the price. */
function StepBlock({
  section, icon, title, unit, balance, perHour, onBuy,
}: {
  section: StoreSection
  icon: React.ReactNode
  /** Our own heading; MAM writes these in title case. */
  title: string
  /** Word for one unit, for the rate line. */
  unit: string
  balance: number | null
  perHour: number | null
  onBuy: (p: Purchase) => void
}) {
  const [index, setIndex] = useState(0)
  const picked = section.offers[index]
  if (!picked) return null

  // Every step of this store prices the same per unit, so the rate belongs on
  // the block rather than beside each step. A step that ever breaks the pattern
  // drops the line instead of printing a figure that holds for one row.
  const rates = section.offers
    .map((o) => {
      const qty = quantityOf(o.label)
      return o.points != null && qty ? o.points / qty : null
    })
    .filter((r): r is number => r != null)
  const flat = rates.length > 0 && rates.every((r) => Math.abs(r - rates[0]) < 1)
  const rate = flat ? `${fmtInt(Math.round(rates[0]))} points per ${unit}` : null

  const afford = picked.points == null || balance == null || picked.points <= balance
  const wait = picked.points != null && balance != null ? waitFor(picked.points, balance, perHour) : null

  return (
    <Card>
      <CardContent className="grid gap-4">
        <BlockHead icon={icon} title={title} rate={rate} />
        {section.descHtml && (
          <RichHtml html={section.descHtml} className="text-[12.5px] leading-relaxed text-muted-foreground" />
        )}
        <StepRow offers={section.offers} index={index} onIndex={setIndex} balance={balance} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[12.5px] text-muted-foreground">
            {priceLabel(picked)}
            {wait && <span className="text-warn"> · {wait}</span>}
          </span>
          <Button
            disabled={!afford}
            onClick={() =>
              onBuy({
                what: `${picked.label}${section.kind === 'upload' && quantityOf(picked.label) ? ' of upload credit' : ''}`,
                cost: picked.cost,
                left: picked.points != null && balance != null ? balance - picked.points : null,
                run: () => (section.kind === 'vip' ? buyVip(picked.value ?? '') : buyUploadCredit(picked.value ?? '')),
              })
            }
          >
            {afford ? `Buy ${picked.label}` : 'Not enough points'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/** Wedges: one item with two ways to pay, so both prices sit side by side. */
function WedgeBlock({
  section, balance, cheese, perHour, onBuy,
}: {
  section: StoreSection
  balance: number | null
  cheese: number | null
  perHour: number | null
  onBuy: (p: Purchase) => void
}) {
  return (
    <Card>
      <CardContent className="grid gap-4">
        <BlockHead icon={<Ticket className="size-4" />} title="Freeleech wedges" />
        {section.descHtml && (
          <RichHtml html={section.descHtml} className="text-[12.5px] leading-relaxed text-muted-foreground" />
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          {section.offers.map((o) => {
            const held = o.cheese != null ? cheese : balance
            const price = o.cheese ?? o.points
            const afford = price == null || held == null || price <= held
            const wait = o.points != null && balance != null ? waitFor(o.points, balance, perHour) : null
            return (
              <Button
                key={o.label}
                variant="outline"
                disabled={!afford}
                className="h-auto flex-col items-start gap-0.5 px-3.5 py-2.5"
                onClick={() =>
                  onBuy({
                    what: `one freeleech wedge for ${o.cost}`,
                    cost: o.cost,
                    left: o.points != null && balance != null ? balance - o.points : null,
                    run: () => buyWedge(o.value ?? ''),
                  })
                }
              >
                <span className="text-[13.5px] font-semibold">{o.cost}</span>
                <span className="text-[11.5px] font-normal text-muted-foreground">
                  {afford ? o.label : wait ? `out of reach, ${wait}` : 'out of reach'}
                </span>
              </Button>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}

/** A torrent id pasted from anywhere: the address bar, a link, a bare number. */
const torrentIdFrom = (raw: string): string | null => {
  const s = raw.trim()
  return /^\d+$/.test(s) ? s : (/\/t\/(\d+)/.exec(s)?.[1] ?? /torrentid=(\d+)/.exec(s)?.[1] ?? null)
}

/** Seed time on one torrent: one price, one field. */
function SeedtimeBlock({
  section, balance, perHour, onBuy,
}: {
  section: StoreSection
  balance: number | null
  perHour: number | null
  onBuy: (p: Purchase) => void
}) {
  const [raw, setRaw] = useState('')
  const offer = section.offers[0]
  if (!offer) return null
  const tid = torrentIdFrom(raw)
  const afford = offer.points == null || balance == null || offer.points <= balance
  const wait = offer.points != null && balance != null ? waitFor(offer.points, balance, perHour) : null

  return (
    <Card>
      <CardContent className="grid gap-4">
        <BlockHead icon={<Timer className="size-4" />} title="Seedtime fix" rate={priceLabel(offer)} />
        {section.descHtml && (
          <RichHtml html={section.descHtml} className="text-[12.5px] leading-relaxed text-muted-foreground" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Torrent id or link"
            aria-label="Torrent to add seed time to"
            className="h-9 max-w-64"
          />
          <Button
            disabled={!tid || !afford}
            onClick={() =>
              onBuy({
                what: `72 hours of seed time on torrent ${tid}`,
                cost: offer.cost,
                left: offer.points != null && balance != null ? balance - offer.points : null,
                run: () => buySeedtime(tid ?? ''),
              })
            }
          >
            {afford ? 'Apply' : 'Not enough points'}
          </Button>
          {raw.trim() && !tid && (
            <span className="text-[12px] text-destructive">That is not a torrent id.</span>
          )}
          {wait && <span className="text-[12px] text-warn">{wait}</span>}
        </div>
      </CardContent>
    </Card>
  )
}

/** A custom title, charged only once staff approve it. */
function TitleBlock({
  section, balance, onBuy,
}: {
  section: StoreSection
  balance: number | null
  onBuy: (p: Purchase) => void
}) {
  const [text, setText] = useState('')
  const offer = section.offers[0]
  if (!offer) return null
  const ready = text.trim().length >= TITLE_MIN_LENGTH

  return (
    <Card>
      <CardContent className="grid gap-4">
        <BlockHead icon={<Type className="size-4" />} title="Custom title" rate={priceLabel(offer)} />
        {section.descHtml && (
          <RichHtml html={section.descHtml} className="text-[12.5px] leading-relaxed text-muted-foreground" />
        )}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={TITLE_MAX_LENGTH}
            placeholder="The title you want"
            aria-label="Your custom title"
            className="h-9 max-w-72"
          />
          <Button
            disabled={!ready}
            onClick={() =>
              onBuy({
                what: `the title “${text.trim()}”`,
                cost: `${offer.cost}, charged once staff approve it`,
                // Nothing leaves the balance today, so naming what is left of it
                // would be a figure that does not hold.
                left: null,
                run: () => buyTitle(text.trim(), Date.now()),
              })
            }
          >
            Request it
          </Button>
          <span className="text-[11.5px] text-muted-foreground">
            {TITLE_MAX_LENGTH - text.trim().length} characters left
          </span>
        </div>
      </CardContent>
    </Card>
  )
}

/** Anything this account has that we have not shaped ourselves: MAM's own
 * buttons, so a block we never saw still works. */
function PlainBlock({ section }: { section: StoreSection }) {
  const [values, setValues] = useState<Record<string, string>>({})

  function buy(selector: string) {
    for (const inp of section.inputs) {
      const el = document.querySelector<HTMLInputElement>(`.storeTable input[name="${CSS.escape(inp.name)}"]`)
      if (el) el.value = values[inp.name] ?? ''
    }
    if (section.inputs.length > 0 && section.inputs.some((i) => !(values[i.name] ?? '').trim())) {
      toast.warning('Fill in the field first.')
      return
    }
    const btn = document.querySelector<HTMLButtonElement>(selector)
    if (!btn) return toast.error('Store control not found.')
    // MAM asks its own question first plus reports its own outcome, so anything
    // said here would be a guess at an answer nobody has given yet.
    btn.click()
  }

  return (
    <Card>
      <CardContent className="grid gap-4">
        <BlockHead icon={<ShoppingBag className="size-4" />} title={section.title} />
        {section.descHtml && (
          <RichHtml html={section.descHtml} className="text-[12.5px] leading-relaxed text-muted-foreground" />
        )}
        {section.inputs.map((inp) => (
          <Input
            key={inp.name}
            value={values[inp.name] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [inp.name]: e.target.value }))}
            placeholder={inp.placeholder}
            className="h-9 max-w-64"
          />
        ))}
        <div className="flex flex-wrap gap-2">
          {section.offers.map((o) => (
            <Button
              key={o.buttonSelector + o.label}
              variant="outline"
              className="h-auto flex-col items-start gap-0.5 px-3.5 py-2"
              onClick={() => buy(o.buttonSelector)}
            >
              <span className="text-[13px] font-semibold">{o.label}</span>
              <span className="text-[11px] font-normal text-muted-foreground">{o.cost}</span>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function StoreView(props: PageProps) {
  const data = useMemo(() => extractStore(document), [])
  const [pending, setPending] = useState<Purchase | null>(null)
  // The header counters answer to whatever spent the points, ours included, so
  // a purchase updates the whole page without a reload.
  const liveBonus = useLiveBonus(props.page.stats.bonus)
  const liveWedges = useLiveWedges(null)
  if (!data) return <LegacyView {...props} />

  const balance = num(liveBonus) ?? num(data.points)
  const cheese = num(data.cheese)
  const perHour = num(props.page.stats.bonusPerHour)
  const wedges = num(liveWedges)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-4">
      <PageHeader
        title="Bonus store"
        sub="Turn seeding points into ratio, VIP time and freeleech wedges."
        action={
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href="/stats/userBonusPointHistory.php"><History /> Points history</a>
          </Button>
        }
      />

      <Card>
        <CardContent className="grid gap-2">
          {/* The balance as a sentence: the figures are the point, the words
              around them keep it readable at a glance. */}
          <p className="font-display text-[21px] leading-snug">
            You have{' '}
            <b className="font-semibold tabular-nums">
              {balance != null ? <NumberRoll value={balance} /> : (data.points ?? '–')}
            </b>{' '}
            points{cheese != null && <> and <b className="font-semibold tabular-nums">{fmtInt(cheese)}</b> cheese</>}
            {perHour != null && <>, earning <b className="font-semibold tabular-nums">{perHour}</b> an hour</>}.
          </p>
          {/* MAM writes six lines here, four of which repeat the sentence above.
              What is left is the state of your seeding plus when it was counted. */}
          {data.earning ? (
            <p className="text-[12.5px] text-muted-foreground">
              {[
                wedges != null && `${fmtInt(wedges)} freeleech wedges in hand`,
                data.earning.satisfied != null && `${fmtInt(data.earning.satisfied)} torrents earning`,
                !!data.earning.unsatisfied && `${fmtInt(data.earning.unsatisfied)} not there yet`,
                !!data.earning.leeching && `${fmtInt(data.earning.leeching)} leeching`,
                data.earning.updatedAt && `counted ${data.earning.updatedAt.split(' ')[1]?.slice(0, 5) ?? data.earning.updatedAt} UTC`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          ) : (
            data.earningHtml && <RichHtml html={data.earningHtml} className="text-[12.5px] text-muted-foreground" />
          )}
        </CardContent>
      </Card>

      {data.sections.map((s) => {
        if (s.kind === 'upload') {
          return (
            <StepBlock
              key={s.title}
              section={s}
              icon={<ArrowUpFromLine className="size-4" />}
              title="Upload credit"
              unit="GB"
              balance={balance}
              perHour={perHour}
              onBuy={setPending}
            />
          )
        }
        if (s.kind === 'vip') {
          return (
            <StepBlock
              key={s.title}
              section={s}
              icon={<Crown className="size-4" />}
              title="VIP status"
              unit="week"
              balance={balance}
              perHour={perHour}
              onBuy={setPending}
            />
          )
        }
        if (s.kind === 'wedges') {
          return <WedgeBlock key={s.title} section={s} balance={balance} cheese={cheese} perHour={perHour} onBuy={setPending} />
        }
        if (s.kind === 'seedtime') {
          return <SeedtimeBlock key={s.title} section={s} balance={balance} perHour={perHour} onBuy={setPending} />
        }
        if (s.kind === 'title') {
          return <TitleBlock key={s.title} section={s} balance={balance} onBuy={setPending} />
        }
        return <PlainBlock key={s.title} section={s} />
      })}

      {pending && <ConfirmPurchase purchase={pending} onClose={() => setPending(null)} />}
    </div>
  )
}
