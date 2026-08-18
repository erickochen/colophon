import { useEffect, useMemo, useState } from 'react'
import { Archive, ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, CheckCircle2, ChevronDown, Download, Sprout, Users } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { FilterSelect } from '@/components/filters'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'

interface Bucket {
  id: string
  label: string
  count: number
  toggleId: string | null
  targetId: string | null
  /** Where the row goes when it is a link instead of a pile that opens. MAM
   * renders those only when they carry something, so the set differs per
   * account. */
  href: string | null
}

interface ZipGroup { label: string; links: { label: string; href: string }[] }

/** MAM names its buckets by stacking states: "Not Seeding - H&R - Not Yet
 * Satisfied". Read those states back out so the page can group by what the
 * reader has to do about them and say it in a sentence. */
type BucketGroup = 'quota' | 'attention' | 'running' | 'settled' | 'other'

/** Some pile names carry a scope on the end: "(active in the last 7 days)",
 * "with 5 or fewer seeders". It rides along behind the states so two piles
 * never land on one wording. The account cap ("150 limit") is not a scope: its
 * own row states the number. */
const SCOPE = /\s*(?:\(([^)]*)\)|with\s+(.+?))\s*$/i

function scopeOf(label: string): string | null {
  const found = SCOPE.exec(label)
  const scope = found ? (found[1] ?? found[2]).trim() : null
  return scope && !/\blimit\b/i.test(scope) ? scope : null
}

function readBucket(label: string): { group: BucketGroup; text: string } {
  // The states are read from the whole name: a scope can hold the only word
  // that names one ("Seeding with 5 or fewer seeders").
  const read = readStates(label)
  const scope = scopeOf(label)
  // A name we could not read keeps MAM's own wording, scope included.
  return scope && read.group !== 'other' ? { ...read, text: `${read.text} (${scope})` } : read
}

function readStates(label: string): { group: BucketGroup; text: string } {
  const s = label.toLowerCase().replace(/&amp;/g, '&').replace(/\s+/g, ' ')
  if (s.includes('leeching')) return { group: 'running', text: 'Downloading now' }
  const seeding = !s.includes('not seeding') && !s.includes('inactive')
  const where = seeding ? 'Seeding' : 'Stopped'
  if (s.includes('upload')) return { group: 'settled', text: `Your uploads, ${seeding ? 'seeding' : 'stopped'}` }
  if (s.includes('h&r')) return { group: 'attention', text: `${where}, hit and run risk` }
  // "Unsatisfied" on its own is the whole pile that still owes seed time; the
  // one carrying a limit is the account cap rather than a pile.
  if (s.includes('unsatisfied')) {
    if (s.includes('limit')) return { group: 'quota', text: 'Unsatisfied' }
    return { group: 'attention', text: seeding ? 'Not satisfied yet' : 'Stopped, not satisfied' }
  }
  if (s.includes('not yet satisfied')) {
    return seeding
      ? { group: 'running', text: 'Seeding, rules not met yet' }
      : { group: 'attention', text: 'Stopped before the rules were met' }
  }
  if (s.includes('satisfied')) return { group: 'settled', text: `${where}, rules met` }
  return { group: 'other', text: label }
}

/** How long a pile may stay empty before the panel offers a way out. */
const LIST_TIMEOUT_MS = 30000

/** Where the unsatisfied meter turns from neutral to a warning tone. */
const QUOTA_WARN_AT = 0.8

// MAM's own rule, quoted from the FAQ: a torrent is satisfied once it has
// seeded 72 hours within 30 days.
const SEED_RULE = '72 hours of seeding within 30 days'

const GROUP_TITLES: { key: BucketGroup; title: string; note: string }[] = [
  { key: 'attention', title: 'Needs attention', note: 'Put these back in your client to let the clock run again.' },
  { key: 'running', title: 'Running', note: 'Nothing to do, these clear on their own.' },
  { key: 'settled', title: 'Settled', note: 'Rules met, keep or remove them as you like.' },
  { key: 'other', title: 'Other', note: '' },
]

function extract(doc: Document): { buckets: Bucket[]; zips: ZipGroup[] } | null {
  const main = doc.querySelector('#mainBody')
  if (!main || !/snatch/i.test(doc.title)) return null

  const buckets: Bucket[] = []
  for (const h1 of main.querySelectorAll('h1')) {
    const count = h1.querySelector('.ssCount')
    if (!count) continue
    // The klappe anchor WRAPS the h1 (<a data-klappe><h1>…</h1></a>), so it is
    // an ancestor, not a descendant - querySelector would never find it.
    const toggle = h1.closest('a[data-klappe]')
    // A row can be a link to another page rather than a pile: the anchor either
    // wraps the heading or sits inside it. A pile stays a pile whatever else its
    // anchor carries.
    const link = toggle ? null : h1.closest('a[href]') ?? h1.querySelector('a[href]')
    const label = h1.textContent?.replace(count.textContent ?? '', '').replace(/\s+/g, ' ').trim() ?? ''
    buckets.push({
      id: toggle?.id ?? label,
      label,
      count: Number((count.textContent ?? '0').replace(/,/g, '')) || 0,
      toggleId: toggle?.id ?? null,
      targetId: toggle ? `k${toggle.id}` : null,
      href: link?.getAttribute('href') ?? null,
    })
  }

  const zips: ZipGroup[] = []
  for (const span of main.querySelectorAll('span.forumLink')) {
    const links: ZipGroup['links'] = []
    let node: Element | null = span.nextElementSibling
    while (node && node.tagName === 'A') {
      links.push({ label: node.textContent?.trim() || 'zip', href: node.getAttribute('href') ?? '#' })
      node = node.nextElementSibling
    }
    if (links.length) zips.push({ label: span.textContent?.replace(/\s+/g, ' ').trim() ?? 'Download', links })
  }

  return { buckets, zips }
}

interface NamedLink { name: string; href: string | null }
interface SnatchItem {
  title: string; href: string | null
  authors: NamedLink[]; narrators: NamedLink[]
  series: (NamedLink & { part: string }) | null
  meta: string
  freeleech: boolean; vip: boolean
  downloadHref: string | null
  uploaded: string; downloaded: string; ratio: string
  seeders: string; leechers: string; snatched: string
  seedtime: string; seedUnder: boolean
  seeding: boolean
}

const links = (cell: Element | null | undefined, sel: string): NamedLink[] =>
  [...(cell?.querySelectorAll(sel) ?? [])].map((a) => ({ name: a.textContent?.replace(/\s+/g, ' ').trim() ?? '', href: a.getAttribute('href') }))

/** Parse MAM's snatched-list rows (loaded into the hidden target on toggle) into
 * structured items so we render browse-style rows, not its cramped raw table. */
function parseItems(target: Element): SnatchItem[] | null {
  const table = target.querySelector('table')
  if (!table) return null
  const dataRows = [...table.querySelectorAll('tr')].filter((tr) => tr.querySelector('td') && !tr.querySelector('th'))
  if (!dataRows.length) return null
  return dataRows.map((tr) => {
    const tds = [...tr.querySelectorAll(':scope > td')]
    const nameCell = tds.find((td) => td.querySelector('a.torTitle')) ?? null
    const flagCell = tds.find((td) => td.querySelector('img')) ?? null
    // bytes cell: three <p>, one with a "iB" size; counts cell: three <p>, all numeric
    const pCells = tds.filter((td) => td.querySelectorAll(':scope > p').length === 3)
    const bytesCell = pCells.find((td) => /iB|B\b/.test(td.textContent ?? '')) ?? null
    const countCell = pCells.find((td) => td !== bytesCell) ?? null
    const timeCell = tds.find((td) => td.querySelector('.row1-red') || td.querySelectorAll('span[title]').length >= 2) ?? null

    const titleEl = nameCell?.querySelector('a.torTitle')
    const desc = nameCell?.querySelector('.torRowDesc')?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const meta = desc.split(/Currently Seeding|Remaining seedtime|Client's last action|Last seeder/i)[0].replace(/[|\s]+$/, '').trim()
    const seriesEl = nameCell?.querySelector('a.series')
    const seriesPart = nameCell?.querySelector('.torSeries')?.textContent?.match(/\(#?([\w.]+)\)/)?.[1] ?? ''
    const bytes = [...(bytesCell?.querySelectorAll('p') ?? [])].map((p) => p.textContent?.trim() ?? '')
    const counts = [...(countCell?.querySelectorAll('p') ?? [])].map((p) => p.textContent?.trim() ?? '')
    const seedEl = timeCell ? [...timeCell.querySelectorAll('span')].at(-1) : null

    return {
      title: titleEl?.textContent?.replace(/\s+/g, ' ').trim() ?? 'Untitled',
      href: titleEl?.getAttribute('href') ?? null,
      authors: links(nameCell, 'a.author'),
      narrators: links(nameCell, 'a.narrator'),
      series: seriesEl ? { name: seriesEl.textContent?.trim() ?? '', href: seriesEl.getAttribute('href'), part: seriesPart } : null,
      meta,
      freeleech: !!flagCell?.querySelector('img[alt*="free" i], img[title*="free" i]'),
      vip: !!flagCell?.querySelector('img[alt*="vip" i], img[title*="vip" i]'),
      downloadHref: tr.querySelector('a.directDownload')?.getAttribute('href') ?? null,
      uploaded: bytes[0] ?? '', downloaded: bytes[1] ?? '', ratio: bytes[2] ?? '',
      seeders: counts[0] ?? '', leechers: counts[1] ?? '', snatched: counts[2] ?? '',
      seedtime: seedEl?.textContent?.trim() ?? '',
      seedUnder: !!timeCell?.querySelector('.row1-red'),
      seeding: /Currently Seeding/i.test(desc),
    }
  })
}

function NameLinks({ prefix, items }: { prefix: string; items: NamedLink[] }) {
  if (!items.length) return null
  return (
    <>
      {' '}· {prefix}{' '}
      {items.map((a, i) => (
        <span key={i}>
          {i > 0 && ', '}
          {a.href ? <a href={a.href} className="hover:text-foreground hover:underline">{a.name}</a> : a.name}
        </span>
      ))}
    </>
  )
}

// Fixed column tracks so every row aligns on the same vertical grid (auto/1fr
// per-row would drift). Title flexes; the numeric columns are fixed-width and
// right-aligned. Below md the row stacks into a labelled block instead.
const SNATCH_COLS =
  'md:grid md:grid-cols-[minmax(0,1fr)_6.5rem_4.5rem_5rem_5.5rem_5.5rem_7.5rem_1.5rem] md:items-center md:gap-x-3'

/** Sort keys MAM's own list understands (a[data-udsorttype] in the loaded
 * table); sorting proxies a click on that header so the site reorders the
 * rows and the observer re-parses them. */
type SortKey = 'title' | 'ratio' | 'uploaded' | 'downloaded' | 'seedtime' | 'seeders'
interface SortState { key: SortKey; dir: 'asc' | 'desc' }

const SNATCH_HEADERS: { label: string; key: SortKey | null; align?: 'right' }[] = [
  { label: 'Title', key: 'title' },
  { label: 'Status', key: null },
  { label: 'Ratio', key: 'ratio', align: 'right' },
  { label: 'Up', key: 'uploaded', align: 'right' },
  { label: 'Down', key: 'downloaded', align: 'right' },
  { label: 'Seed time', key: 'seedtime', align: 'right' },
  { label: 'Peers', key: 'seeders', align: 'right' },
]

/** Below md the column headers are gone, so sorting moves into a select. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'unsorted', label: 'Sort by…' },
  { value: 'title:asc', label: 'Title A to Z' },
  { value: 'title:desc', label: 'Title Z to A' },
  { value: 'ratio:desc', label: 'Ratio, highest first' },
  { value: 'ratio:asc', label: 'Ratio, lowest first' },
  { value: 'uploaded:desc', label: 'Uploaded, most first' },
  { value: 'uploaded:asc', label: 'Uploaded, least first' },
  { value: 'downloaded:desc', label: 'Downloaded, most first' },
  { value: 'downloaded:asc', label: 'Downloaded, least first' },
  { value: 'seedtime:desc', label: 'Seed time, longest first' },
  { value: 'seedtime:asc', label: 'Seed time, shortest first' },
  { value: 'seeders:desc', label: 'Seeders, most first' },
  { value: 'seeders:asc', label: 'Seeders, fewest first' },
]

function StatusBadge({ s }: { s: SnatchItem }) {
  if (s.seeding) return <Badge className="h-5 gap-1 bg-ok/15 px-2 text-[11px] font-medium text-ok"><Sprout className="size-3" /> Seeding</Badge>
  if (s.seedtime) return <Badge variant="outline" className={cn('h-5 px-2 text-[11px] font-medium', s.seedUnder && 'border-warn/40 text-warn')}>{s.seedUnder ? 'Seed more' : 'Satisfied'}</Badge>
  return <span className="text-[11px] text-muted-foreground/50">-</span>
}

function SnatchHeader({ sort, onSort }: { sort: SortState | null; onSort: (key: SortKey) => void }) {
  return (
    <div className={cn('hidden border-b px-6 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground', SNATCH_COLS)}>
      {SNATCH_HEADERS.map((h) => {
        if (!h.key) return <span key={h.label}>{h.label}</span>
        // Right-aligned columns carry the sort mark on the left, so the label
        // stays flush with the numbers underneath.
        const icon =
          sort?.key === h.key ? (
            sort.dir === 'desc' ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />
          ) : (
            <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-60" />
          )
        return (
          <Button
            key={h.label}
            variant="ghost"
            onClick={() => onSort(h.key!)}
            title={`Sort by ${h.label.toLowerCase()}`}
            className={cn(
              'group/sort h-auto gap-1 rounded-sm p-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-transparent hover:text-foreground',
              h.align === 'right' && 'justify-end text-right',
              sort?.key === h.key && 'text-foreground'
            )}
          >
            {h.align === 'right' && icon}
            {h.label}
            {h.align !== 'right' && icon}
          </Button>
        )
      })}
      <span />
    </div>
  )
}

/** Right-aligned numeric cell (desktop grid only). */
function Num({ value, className }: { value: string; className?: string }) {
  return <span className={cn('hidden text-right font-mono text-[12.5px] tabular-nums md:block', className)}>{value || '–'}</span>
}

function SnatchRow({ s }: { s: SnatchItem }) {
  return (
    <div className={cn('px-6 py-3 transition-colors hover:bg-brand-soft/25', SNATCH_COLS)}>
      {/* Title + meta */}
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          {s.href ? (
            <a href={s.href} className="font-display text-[14px] font-medium leading-snug hover:text-brand hover:underline">{s.title}</a>
          ) : <span className="font-display text-[14px] font-medium">{s.title}</span>}
          {s.freeleech && <Badge className="h-4 bg-ok/15 px-1.5 text-[10px] font-medium text-ok">Freeleech</Badge>}
          {s.vip && <Badge className="h-4 bg-brand-soft px-1.5 text-[10px] font-medium text-accent-foreground">VIP</Badge>}
        </div>
        <div className="line-clamp-2 pt-0.5 text-[12px] text-muted-foreground">
          {s.authors.length > 0 && <>by {s.authors.map((a, i) => <span key={i}>{i > 0 && ', '}{a.href ? <a href={a.href} className="hover:text-foreground hover:underline">{a.name}</a> : a.name}</span>)}</>}
          <NameLinks prefix="Narrated by" items={s.narrators} />
          {s.series && <> · <a href={s.series.href ?? '#'} className="hover:text-foreground hover:underline">{s.series.name}</a>{s.series.part && ` (#${s.series.part})`}</>}
        </div>
        {s.meta && <div className="line-clamp-2 pt-0.5 text-[11.5px] text-muted-foreground">{s.meta}</div>}
      </div>

      {/* Desktop grid cells */}
      <span className="hidden md:block"><StatusBadge s={s} /></span>
      <Num value={s.ratio} />
      <Num value={s.uploaded} className="text-ok" />
      <Num value={s.downloaded} className="text-destructive" />
      <Num value={s.seedtime} className={s.seedUnder ? 'text-warn' : 'text-muted-foreground'} />
      <span className="hidden text-right text-[11.5px] tabular-nums text-muted-foreground md:block">
        {s.seeders}/{s.leechers}
        {s.snatched && <span className="block text-[10px] text-muted-foreground">{s.snatched} snatched</span>}
      </span>
      <span className="hidden md:flex md:justify-end">
        {s.downloadHref && <a href={s.downloadHref} title="Download .torrent" className="text-muted-foreground hover:text-brand"><Download className="size-4" /></a>}
      </span>

      {/* Mobile: labelled stat block */}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] md:hidden">
        <StatusBadge s={s} />
        {s.ratio && <span className="font-mono tabular-nums">R {s.ratio}</span>}
        {s.uploaded && <span className="font-mono tabular-nums text-ok">↑ {s.uploaded}</span>}
        {s.downloaded && <span className="font-mono tabular-nums text-destructive">↓ {s.downloaded}</span>}
        {s.seedtime && <span className={cn('font-mono tabular-nums', s.seedUnder ? 'text-warn' : 'text-muted-foreground')}>⏱ {s.seedtime}</span>}
        <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Users className="size-3" /> {s.seeders}/{s.leechers}</span>
        {s.downloadHref && <a href={s.downloadHref} title="Download .torrent" className="text-muted-foreground hover:text-brand"><Download className="size-4" /></a>}
      </div>
    </div>
  )
}

function BucketRow({ b }: { b: Bucket }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SnatchItem[] | null>(null)
  const [sort, setSort] = useState<SortState | null>(null)
  const [late, setLate] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!open || !b.targetId) return
    const target = document.getElementById(b.targetId)
    if (!target) return
    setLate(false)
    // A list that never arrives would otherwise sit on "Loading" forever.
    const timer = window.setTimeout(() => setLate(true), LIST_TIMEOUT_MS)
    const sync = () => {
      const rows = parseItems(target)
      if (rows) {
        window.clearTimeout(timer)
        setItems(rows)
        setLate(false)
      }
    }
    const obs = new MutationObserver(sync)
    obs.observe(target, { childList: true, subtree: true })
    sync()
    return () => {
      obs.disconnect()
      window.clearTimeout(timer)
    }
  }, [open, b.targetId, attempt])

  function retry() {
    const el = b.toggleId ? document.getElementById(b.toggleId) : null
    if (!el) {
      toast.error('List is not available.')
      return
    }
    // Two clicks: MAM's own toggle closes the panel before it fetches again.
    el.click()
    el.click()
    setAttempt((n) => n + 1)
  }

  /** Steer the hidden list's own sort header: set the direction it will apply,
   * click it and let the mutation observer pick up the reordered rows. */
  function applySort(key: SortKey, dirWanted?: SortState['dir']) {
    const dir: SortState['dir'] =
      dirWanted ??
      (sort?.key === key ? (sort.dir === 'desc' ? 'asc' : 'desc') : key === 'title' ? 'asc' : 'desc')
    const target = b.targetId ? document.getElementById(b.targetId) : null
    const link = target?.querySelector<HTMLElement>(`a[data-udsorttype="${key}"]`)
    if (!link) {
      toast.error('Sorting is not available for this list.')
      return
    }
    link.setAttribute('data-sortorder', dir)
    link.click()
    setSort({ key, dir })
  }

  function toggle() {
    if (!b.toggleId) return
    if (!open) {
      const el = document.getElementById(b.toggleId)
      if (!el) {
        toast.error('List is not available.')
        return
      }
      el.click()
    }
    setOpen(!open)
  }

  const openable = !!b.toggleId && b.count > 0
  // A row MAM points somewhere else stays a link, so it does what it looks like
  // it does instead of sitting there as text among rows that open.
  const linkable = !openable && !!b.href
  const rowClass = cn(
    'h-auto w-full justify-start gap-4 rounded-none px-6 py-2.5 text-left font-normal',
    openable || linkable ? 'hover:bg-brand-soft/25' : 'cursor-default hover:bg-transparent'
  )
  const rowBody = (
    <>
      <span className={cn('w-10 shrink-0 text-right font-display text-[16px] font-semibold tabular-nums', !b.count && 'text-muted-foreground/45')}>
        {b.count.toLocaleString('en-US')}
      </span>
      <span className={cn('text-[13px]', !b.count && 'text-muted-foreground/60')}>{readBucket(b.label).text}</span>
      {openable && (
        <ChevronDown className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} />
      )}
      {linkable && <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />}
    </>
  )
  return (
    <div>
      {linkable ? (
        <Button asChild variant="ghost" className={rowClass}>
          <a href={b.href!}>{rowBody}</a>
        </Button>
      ) : (
        <Button
          variant="ghost"
          onClick={openable ? toggle : undefined}
          aria-expanded={openable ? open : undefined}
          className={rowClass}
          aria-disabled={!openable || undefined}
        >
          {rowBody}
        </Button>
      )}
      {open && (
        <div className="border-y bg-muted/10">
          {items === null ? (
            late ? (
              <p className="px-6 py-5 text-sm text-muted-foreground">
                This list did not arrive.{' '}
                <Button variant="link" onClick={retry} className="h-auto p-0 text-brand">Try again</Button>
              </p>
            ) : (
              <p className="px-6 py-5 text-sm text-muted-foreground">Loading list…</p>
            )
          ) : items.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="divide-y divide-border/60">
              <div className="border-b px-6 py-2 md:hidden">
                <FilterSelect
                  ariaLabel="Sort this list"
                  value={sort ? `${sort.key}:${sort.dir}` : 'unsorted'}
                  onChange={(v) => {
                    if (v === 'unsorted') return
                    const [key, dir] = v.split(':') as [SortKey, SortState['dir']]
                    applySort(key, dir)
                  }}
                  options={SORT_OPTIONS}
                />
              </div>
              <SnatchHeader sort={sort} onSort={applySort} />
              {items.map((s, i) => <SnatchRow key={i} s={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** The one bucket with a ceiling, so it reads as a meter instead of a tile. It
 * also has to say what the number means: the count alone reads as an alarm even
 * when every one of them is seeding along nicely. */
function QuotaCard({ used, limit, attention }: { used: number; limit: number | null; attention: number }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0
  const tight = limit != null && used / limit >= QUOTA_WARN_AT
  return (
    <Card className="py-4">
      <CardContent className="grid gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] font-medium">Still owing seed time</span>
          <span className="font-display text-[15px] tabular-nums">
            {used.toLocaleString('en-US')}
            {limit != null && <span className="text-muted-foreground"> of {limit.toLocaleString('en-US')}</span>}
          </span>
        </div>
        <Progress
          value={used}
          max={limit ?? undefined}
          aria-label="Torrents still owing seed time"
          aria-valuetext={limit != null ? `${used} of ${limit}` : String(used)}
          className={cn('h-1.5', tight && '[&>div]:bg-warn')}
        />
        <p className="text-[12px] text-muted-foreground">
          {used === 0
            ? `Every torrent you hold has met its ${SEED_RULE}.`
            : attention > 0
              ? `${attention.toLocaleString('en-US')} of them stopped seeding, so those need you.`
              : `All of them are seeding, so they clear on their own after ${SEED_RULE}.`}
          {limit != null && used > 0 && ` At ${limit.toLocaleString('en-US')} the tracker pauses your downloads for up to a day.`}
        </p>
      </CardContent>
    </Card>
  )
}

/** MAM repeats the same four zip variants under every bucket. As a cross table
 * the variant is named once per column and the row says which pile it takes. */
function ZipMatrix({ groups }: { groups: ZipGroup[] }) {
  const cols = [...new Set(groups.flatMap((g) => g.links.map((l) => l.label)))]
  const onPage = (g: ZipGroup) => g.label.replace(/^download\s+/i, '').replace(/:\s*$/, '').trim()
  const read = groups.map((g) => readBucket(onPage(g)).text)
  // Two rows reading the same is worse than MAM's own wording, so a clash keeps
  // the name from the page.
  const names = read.map((n, i) => (read.some((other, j) => j !== i && other === n) ? onPage(groups[i]) : n))
  return (
    <Card className="gap-0 overflow-hidden py-0">
      <CardHeader className="border-b !py-3">
        <CardTitle>Bulk download .torrents</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-6 py-3">
        <table className="w-full text-[12.5px]">
          <caption className="pb-2 text-left text-[12px] text-muted-foreground">
            Each cell hands your browser a .zip of .torrent files for that pile.
          </caption>
          <thead>
            <tr>
              <td />
              {cols.map((c) => (
                <th key={c} scope="col" className="w-[92px] px-1 pb-2 text-center text-[11px] font-medium text-muted-foreground">
                  {c.replace(/\s*only$/i, '').replace(/\band\b/i, '+')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {groups.map((z, zi) => (
              <tr key={z.label}>
                <th scope="row" className="py-1.5 pr-8 text-left font-normal whitespace-nowrap">{names[zi]}</th>
                {cols.map((c) => {
                  const link = z.links.find((l) => l.label === c)
                  return (
                    <td key={c} className="px-1 py-1.5 text-center">
                      {link ? (
                        <a
                          href={link.href}
                          title={`${c} from ${names[zi].toLowerCase()}`}
                          aria-label={`Download .torrent files, ${c.toLowerCase()}, from ${names[zi].toLowerCase()}`}
                          onClick={() => toast.success('Building your zip', { description: 'MAM packs the file, your browser takes it from there.' })}
                          className="inline-grid size-9 place-items-center rounded-md border text-muted-foreground transition-colors hover:border-transparent hover:bg-primary hover:text-primary-foreground sm:size-7"
                        >
                          <Archive className="size-3.5" />
                        </a>
                      ) : (
                        <span className="text-muted-foreground/40">–</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  )
}

export function SnatchedView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  const quota = data.buckets.find((b) => readBucket(b.label).group === 'quota') ?? null
  const limit = Number(quota?.label.match(/(\d[\d,]*)\s*limit/i)?.[1]?.replace(/,/g, '')) || null
  const attentionCount = data.buckets
    .filter((b) => readBucket(b.label).group === 'attention')
    .reduce((n, b) => n + b.count, 0)
  // An empty pile says nothing, so only the piles holding something get a row.
  // Attention keeps its heading either way, since an empty one is worth reading.
  const sections = GROUP_TITLES.map((g) => ({
    ...g,
    items: data.buckets.filter((b) => readBucket(b.label).group === g.key && b.count > 0),
  })).filter((s) => s.items.length > 0 || s.key === 'attention')

  return (
    <div className="grid gap-4">
      <PageHeader title="My snatched" sub="Where your downloads stand against the seeding rules" />
      {quota && <QuotaCard used={quota.count} limit={limit} attention={attentionCount} />}
      <Card className="gap-0 overflow-hidden py-0">
        {sections.map((s) => (
          <section key={s.key}>
            <h2 className="flex flex-wrap items-baseline gap-x-2.5 border-b bg-muted/25 px-6 py-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{s.title}</span>
              {s.note && s.items.length > 0 && <span className="text-[11.5px] text-muted-foreground">{s.note}</span>}
            </h2>
            <div className="divide-y divide-border/50">
              {s.items.length === 0 ? (
                <p className="flex items-center gap-2.5 px-6 py-2.5 text-[13px] text-muted-foreground">
                  <CheckCircle2 className="size-4 text-ok" /> Nothing needs attention.
                </p>
              ) : (
                s.items.map((b) => <BucketRow key={b.id} b={b} />)
              )}
            </div>
          </section>
        ))}
      </Card>
      {data.zips.length > 0 && <ZipMatrix groups={data.zips} />}
    </div>
  )
}
