import { useEffect, useMemo, useState } from 'react'
import { Archive, ChevronDown, Download, Sprout, Users } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Bucket {
  id: string
  label: string
  count: number
  toggleId: string | null
  targetId: string | null
}

interface ZipGroup { label: string; links: { label: string; href: string }[] }

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
    const label = h1.textContent?.replace(count.textContent ?? '', '').replace(/\s+/g, ' ').trim() ?? ''
    buckets.push({
      id: toggle?.id ?? label,
      label,
      count: Number((count.textContent ?? '0').replace(/,/g, '')) || 0,
      toggleId: toggle?.id ?? null,
      targetId: toggle ? `k${toggle.id}` : null,
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

function StatusBadge({ s }: { s: SnatchItem }) {
  if (s.seeding) return <Badge className="h-5 gap-1 bg-ok/15 px-2 text-[11px] font-medium text-ok"><Sprout className="size-3" /> Seeding</Badge>
  if (s.seedtime) return <Badge variant="outline" className={cn('h-5 px-2 text-[11px] font-medium', s.seedUnder && 'border-warn/40 text-warn')}>{s.seedUnder ? 'Seed more' : 'Satisfied'}</Badge>
  return <span className="text-[11px] text-muted-foreground/50">-</span>
}

function SnatchHeader() {
  return (
    <div className={cn('hidden border-b px-6 py-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground/70', SNATCH_COLS)}>
      <span>Title</span>
      <span>Status</span>
      <span className="text-right">Ratio</span>
      <span className="text-right">Up</span>
      <span className="text-right">Down</span>
      <span className="text-right">Seed time</span>
      <span className="text-right">Peers</span>
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
            <a href={s.href} className="text-[13.5px] font-medium leading-snug hover:text-brand hover:underline">{s.title}</a>
          ) : <span className="text-[13.5px] font-medium">{s.title}</span>}
          {s.freeleech && <Badge className="h-4 bg-ok/15 px-1.5 text-[10px] font-medium text-ok">Freeleech</Badge>}
          {s.vip && <Badge className="h-4 bg-brand-soft px-1.5 text-[10px] font-medium text-accent-foreground">VIP</Badge>}
        </div>
        <div className="pt-0.5 text-[12px] text-muted-foreground">
          {s.authors.length > 0 && <>by {s.authors.map((a, i) => <span key={i}>{i > 0 && ', '}{a.href ? <a href={a.href} className="hover:text-foreground hover:underline">{a.name}</a> : a.name}</span>)}</>}
          <NameLinks prefix="Narrated by" items={s.narrators} />
          {s.series && <> · <a href={s.series.href ?? '#'} className="hover:text-foreground hover:underline">{s.series.name}</a>{s.series.part && ` (#${s.series.part})`}</>}
        </div>
        {s.meta && <div className="pt-0.5 text-[11.5px] text-muted-foreground/80">{s.meta}</div>}
      </div>

      {/* Desktop grid cells */}
      <span className="hidden md:block"><StatusBadge s={s} /></span>
      <Num value={s.ratio} />
      <Num value={s.uploaded} className="text-ok" />
      <Num value={s.downloaded} className="text-destructive" />
      <Num value={s.seedtime} className={s.seedUnder ? 'text-warn' : 'text-muted-foreground'} />
      <span className="hidden text-right text-[11.5px] tabular-nums text-muted-foreground md:block">
        {s.seeders}/{s.leechers}
        {s.snatched && <span className="block text-[10px] text-muted-foreground/70">{s.snatched} snatched</span>}
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

function BucketCard({ b }: { b: Bucket }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SnatchItem[] | null>(null)

  useEffect(() => {
    if (!open || !b.targetId) return
    const target = document.getElementById(b.targetId)
    if (!target) return
    const sync = () => setItems(parseItems(target))
    const obs = new MutationObserver(sync)
    obs.observe(target, { childList: true, subtree: true })
    sync()
    return () => obs.disconnect()
  }, [open, b.targetId])

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

  return (
    <Card className={cn('gap-0 py-0', open && 'sm:col-span-2 xl:col-span-3')}>
      <button
        onClick={b.toggleId && b.count > 0 ? toggle : undefined}
        className="flex w-full items-center justify-between gap-3 px-6 py-4 text-left"
        disabled={!b.toggleId || b.count === 0}
      >
        <div>
          <div className="font-display text-2xl font-semibold tabular-nums">{b.count.toLocaleString('en-US')}</div>
          <div className="text-[12.5px] text-muted-foreground">{b.label}</div>
        </div>
        {b.toggleId && b.count > 0 && (
          <ChevronDown className={'size-4 text-muted-foreground transition-transform ' + (open ? 'rotate-180' : '')} />
        )}
      </button>
      {open && (
        <CardContent className="grid gap-0 bg-muted/10 px-0 py-0">
          {items === null ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">Loading list…</p>
          ) : items.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">Nothing here.</p>
          ) : (
            <div className="divide-y divide-border/60">
              <SnatchHeader />
              {items.map((s, i) => <SnatchRow key={i} s={s} />)}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

export function SnatchedView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-4">
      <PageHeader title="My snatched" sub="Where your downloads stand against the seeding rules" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {data.buckets.map((b) => <BucketCard key={b.id} b={b} />)}
      </div>
      {data.zips.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Bulk download .torrents</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2.5">
            {data.zips.map((z) => (
              <div key={z.label} className="flex flex-wrap items-center gap-2">
                <span className="min-w-52 text-[13px]">{z.label}</span>
                {z.links.map((l) => (
                  <Button key={l.href} asChild variant="outline" size="sm" className="h-7 text-[12px]">
                    <a href={l.href}><Archive /> {l.label || 'zip'}</a>
                  </Button>
                ))}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
