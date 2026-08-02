import { useEffect, useMemo, useState } from 'react'
import { Bookmark, BookmarkCheck, ChevronDown, Copy, Download, FilePenLine, FileText, Flag, Gift, History, Info, MessageSquarePlus, Sprout, Users } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTorrent, type MediaNode, type TorrentComment, type TorrentDetail } from '@/lib/extract/torrent'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { cleanHtml } from '@/lib/sanitize'
import { mutedUserColor } from '@/lib/colors'
import { fmtInt, initials, relTime } from '@/lib/format'
import { searchTorrents, parsePeople, coverUrl, torrentUrl } from '@/lib/mam-api'
import { cn } from '@/lib/utils'
import { Book, Book3D, BookAmbilight } from '@/components/book'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'

/** One statline figure: serif number over a small-caps label. */
function Stat({ label, value, title }: { label: string; value: string; title?: string }) {
  return (
    <div>
      <b className="block font-display text-[17px] font-semibold tabular-nums" title={title}>{value}</b>
      <span className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">{label}</span>
    </div>
  )
}

/** MAM's own label for your history with this torrent, so you can see you already have it. */
function DlHistoryBadge({ label }: { label: string }) {
  const seeding = /seed/i.test(label)
  return (
    <Badge variant="secondary" className={cn(seeding && 'bg-ok/15 text-ok')} title="Your history with this torrent, from the tracker">
      {seeding ? <Sprout /> : <History />}
      {label}
    </Badge>
  )
}

/** A24-grid entry for the details sidebar: small-caps label above the value. */
function KV({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('min-w-0', full && 'col-span-2')}>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">{label}</dt>
      <dd className="text-[13.5px] leading-relaxed">{children}</dd>
    </div>
  )
}

/** Wait until sel appears in the live document (MAM swaps anchors via AJAX). */
function waitFor(sel: string, timeout = 4000): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const t0 = Date.now()
    const tick = () => {
      const el = document.querySelector<HTMLElement>(sel)
      if (el) return resolve(el)
      if (Date.now() - t0 > timeout) return resolve(null)
      window.setTimeout(tick, 150)
    }
    tick()
  })
}

/** State-aware bookmark toggle. MAM swaps between torBookmark{id} and
 * torDeBookmark{id}, the latter behind an Ok/Cancel dialog we auto-confirm. */
function BookmarkButton() {
  const [bookmarked, setBookmarked] = useState(() => !!document.querySelector('[id^="torDeBookmark"]'))
  const [busy, setBusy] = useState(false)
  const available = bookmarked || !!document.querySelector('[id^="torBookmark"]')
  if (!available) return null

  async function add() {
    setBusy(true)
    document.querySelector<HTMLElement>('[id^="torBookmark"]')?.click()
    const swapped = await waitFor('[id^="torDeBookmark"]')
    setBusy(false)
    if (swapped) {
      setBookmarked(true)
      toast.success('Bookmarked', { description: 'Find it under My library > Bookmarks.' })
    } else toast.error('Bookmarking did not go through.')
  }

  async function remove() {
    setBusy(true)
    // Hide MAM's own confirm dialog while we auto-accept it.
    const veil = document.createElement('style')
    veil.textContent = '.ui-dialog,.ui-widget-overlay{display:none!important}'
    document.head.appendChild(veil)
    try {
      document.querySelector<HTMLElement>('[id^="torDeBookmark"]')?.click()
      const ok = await waitFor('.ui-dialog button')
      const okBtn = [...document.querySelectorAll<HTMLButtonElement>('.ui-dialog button')].find((b) => /^ok$/i.test(b.textContent?.trim() ?? ''))
      if (ok && okBtn) okBtn.click()
      const swapped = await waitFor('[id^="torBookmark"]')
      if (swapped) {
        setBookmarked(false)
        toast.success('Bookmark removed')
      } else toast.error('Removing the bookmark did not go through.')
    } finally {
      veil.remove()
      setBusy(false)
    }
  }

  return bookmarked ? (
    <Button variant="outline" disabled={busy} onClick={remove} className="text-brand">
      <BookmarkCheck /> Bookmarked
    </Button>
  ) : (
    <Button variant="outline" disabled={busy} onClick={add}>
      <Bookmark /> Bookmark
    </Button>
  )
}

function Comment({ c }: { c: TorrentComment }) {
  return (
    <div className="flex gap-3 py-4">
      <Avatar className="size-9 shrink-0 rounded-lg">
        {c.avatar && !c.avatar.includes('default_avatar') && <AvatarImage src={c.avatar} alt="" />}
        <AvatarFallback className="rounded-lg bg-primary text-[11px] font-semibold text-primary-foreground">
          {initials(c.author?.name ?? '?')}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          {c.author && (
            <a href={c.author.href} className="text-[13px] font-semibold hover:underline" style={{ color: mutedUserColor(c.author.color) }}>
              {c.author.name}
            </a>
          )}
          {c.authorClass && <span className="text-[11px] text-muted-foreground">({c.authorClass})</span>}
          {c.donor && <span title="Donor" className="text-[11px] text-warn">★</span>}
          <span className="ml-auto text-[11px] text-muted-foreground" title={c.at ?? ''}>{relTime(c.at)}</span>
        </div>
        <RichHtml html={c.bodyHtml} className="mt-1 text-[13.5px]" />
      </div>
    </div>
  )
}

/** MAM's MediaInfo tree: headings become subheadings, key/value become rows. */
export function MediaInfoTree({ nodes, depth = 0 }: { nodes: MediaNode[]; depth?: number }) {
  return (
    <div className={depth === 0 ? 'grid gap-4' : 'grid gap-1'}>
      {nodes.map((n, i) =>
        n.children.length > 0 ? (
          <div key={n.label + i}>
            <div className={depth === 0
              ? 'text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground'
              : 'text-[12.5px] font-medium'}>
              {n.label}
            </div>
            <div className={n.children.length > 12 ? 'mt-1.5 max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-2.5' : 'mt-1.5 pl-0.5'}>
              <MediaInfoTree nodes={n.children} depth={depth + 1} />
            </div>
          </div>
        ) : (
          <div key={n.label + i} className="grid grid-cols-[minmax(88px,auto)_1fr] gap-x-3 text-[12.5px] leading-relaxed">
            <span className="text-muted-foreground">{n.label}</span>
            <span className="font-mono tabular-nums [overflow-wrap:anywhere]">{n.value}</span>
          </div>
        )
      )}
    </div>
  )
}

// Big file lists take a while to arrive over a slow link before the poll gives up.
const LEGACY_LOAD_TIMEOUT_MS = 30_000
const LEGACY_POLL_MS = 250
// Mirrors MAM's own has-content check: anything at or under this is the bare
// 'Loading' placeholder, not a fragment.
const LEGACY_CONTENT_MIN_LENGTH = 20

/** MAM's own AJAX loader as a fallback: trigger it against the hidden legacy
 * DOM and lift the fragment out once jQuery has filled the container. */
function legacyFragment(run: () => void, sel: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const el = document.querySelector(sel)
    if (!el) return reject(new Error('legacy container missing'))
    run()
    const t0 = Date.now()
    const tick = () => {
      const html = el.innerHTML
      if (html.length > LEGACY_CONTENT_MIN_LENGTH && !/^Loading/.test(html)) return resolve(html)
      if (Date.now() - t0 > LEGACY_LOAD_TIMEOUT_MS) return reject(new Error('legacy load timeout'))
      window.setTimeout(tick, LEGACY_POLL_MS)
    }
    tick()
  })
}

/** Fetch a same-origin HTML fragment (filelist, peers) once, on first expand.
 * When the fetch fails the fallback loader gets a try before showing an error. */
function useRemoteHtml(url: string | null, fallback?: () => Promise<string>) {
  const [s, setS] = useState<{ loading: boolean; html: string | null; error: boolean }>({ loading: false, html: null, error: false })
  function apply(t: string) {
    const doc = new DOMParser().parseFromString(t, 'text/html')
    setS({ loading: false, html: cleanHtml(doc.body) ?? '', error: false })
  }
  function load() {
    if (!url || s.html || s.loading) return
    setS({ loading: true, html: null, error: false })
    fetch(url, { credentials: 'include' })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.text()
      })
      .then(apply)
      .catch(async () => {
        try {
          if (!fallback) throw new Error('no fallback')
          apply(await fallback())
        } catch {
          setS({ loading: false, html: null, error: true })
        }
      })
  }
  return { ...s, load }
}

// No borders anywhere in this design (see index.css): tables separate rows with
// a zebra fill, not rules.
const REMOTE_HTML_CLS =
  'legacy-html overflow-x-auto text-[12.5px] leading-relaxed [&_a[href]]:text-brand [&_a[href]]:underline [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-2.5 [&_td]:py-1.5 [&_tbody_tr:nth-child(odd)]:bg-muted/30 [&_img]:inline-block [&_img]:h-4 [&_img]:w-auto'

/** Collapsible card that lazy-loads a MAM fragment the first time it opens. */
function RemotePanel({ title, icon, url, fallback }: { title: string; icon: React.ReactNode; url: string | null; fallback?: () => Promise<string> }) {
  const r = useRemoteHtml(url, fallback)
  if (!url) return null
  return (
    <Card className="gap-0 py-0">
      <Collapsible onOpenChange={(open) => open && r.load()}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-6 py-4 text-left [&[data-panel-open]_.chev]:rotate-180">
            <span className="flex items-center gap-2 font-display text-[15px] font-semibold">{icon} {title}</span>
            <ChevronDown className="chev size-4 text-muted-foreground transition-transform" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-5">
            {r.loading && (
              <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground"><Spinner className="size-4" /> Loading…</div>
            )}
            {r.error && (
              <p className="py-4 text-[13px] text-muted-foreground">
                Could not load this.{' '}
                <button type="button" className="text-brand underline" onClick={r.load}>Try again</button>
                {' '}or <a className="text-brand underline" href={url}>open it directly</a>.
              </p>
            )}
            {r.html && <div className={REMOTE_HTML_CLS} dangerouslySetInnerHTML={{ __html: r.html }} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  )
}

interface SeriesEntry {
  id: number
  href: string
  title: string
  poster: string | null
  part: string | null
  current: boolean
}

function partNum(part: string | null): number {
  const n = parseFloat(part ?? '')
  return Number.isNaN(n) ? Number.POSITIVE_INFINITY : n
}

/** Mini shelf of the other books in the first series, fetched via the search
 * API. Hidden while loading, on fetch errors and when this book is alone. */
function SeriesStrip({ data }: { data: TorrentDetail }) {
  const series = data.series[0]
  const [items, setItems] = useState<SeriesEntry[] | null>(null)

  useEffect(() => {
    let live = true
    searchTorrents({ text: series.name, srchIn: ['series'], perpage: 8 })
      .then((res) => {
        if (!live) return
        const wanted = series.name.trim().toLowerCase()
        const found: SeriesEntry[] = []
        for (const t of res.data) {
          const entry = parsePeople(t.series_info).find((s) => s.name.trim().toLowerCase() === wanted)
          if (!entry) continue
          found.push({
            id: t.id,
            href: torrentUrl(t.id),
            title: t.title,
            poster: t.poster_type ? coverUrl(t.id) : null,
            part: entry.part ?? null,
            current: t.id === data.id,
          })
        }
        if (data.id && !found.some((f) => f.current)) {
          found.push({ id: data.id, href: torrentUrl(data.id), title: data.title ?? '', poster: data.poster, part: series.part, current: true })
        }
        found.sort((a, b) => partNum(a.part) - partNum(b.part))
        setItems(found)
      })
      .catch(() => {
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [data, series])

  if (!items || items.length < 2) return null
  return (
    <Card>
      <CardHeader>
        <CardTitle>In this series</CardTitle>
        <CardAction>
          <a href={series.href} className="text-[12px] text-brand hover:underline">{series.name}</a>
        </CardAction>
      </CardHeader>
      <CardContent>
        <div className="flex items-end gap-5 overflow-x-auto pb-1">
          {items.map((it) => (
            <a key={it.id} href={it.href} title={it.title} className="group w-[88px] shrink-0 text-[10px]">
              <span className="block transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 motion-reduce:transition-none">
                <Book poster={it.poster} title={it.title} naturalRatio plain size="mini" className="group-hover:shadow-book-lift" />
              </span>
              <span className={cn('mt-2 block font-mono text-[11px] tabular-nums', it.current ? 'font-semibold text-brand' : 'text-muted-foreground')}>
                {it.part && `#${it.part}`}
                {it.current && (it.part ? ' · this book' : 'this book')}
              </span>
            </a>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function TorrentView(props: PageProps) {
  const data = useMemo(() => extractTorrent(document), [])
  const [points, setPoints] = useState('')

  if (!data || !data.title) return <LegacyView {...props} />

  function proxyClick(sel: string, fail: string) {
    const el = document.querySelector<HTMLElement>(sel)
    if (el) el.click()
    else toast.error(fail)
  }

  function thank() {
    const input = document.querySelector<HTMLInputElement>('#thanksArea input[name="points"]')
    if (input) input.value = points || '0'
    proxyClick('#giveThanks', 'Thanks are not available for this torrent.')
    toast.success(points && Number(points) > 0 ? `Sent ${points} points to the uploader` : 'Thanked the uploader')
  }

  const people = (list: { name: string; href: string }[]) =>
    list.map((p, i) => (
      <span key={p.href + i}>
        {i > 0 && ', '}
        <a className="text-brand hover:underline" href={p.href}>{p.name}</a>
      </span>
    ))

  const languages = data.categories.filter((c) => c.language)
  const genres = data.categories.filter((c) => !c.language)

  const stats = [
    { label: 'size', value: data.size },
    { label: data.files.count === '1' ? 'file' : 'files', value: data.files.count && fmtInt(data.files.count) },
    { label: 'seeders', value: data.seeders && fmtInt(data.seeders) },
    { label: 'leechers', value: data.leechers && fmtInt(data.leechers) },
    { label: 'snatched', value: data.snatched && fmtInt(data.snatched) },
    { label: 'added', value: data.added && relTime(data.added), title: data.added ?? undefined },
  ].filter((s): s is { label: string; value: string; title?: string } => !!s.value)

  return (
    <div className="grid gap-5">
      {/* HERO: ambilight glow from the cover, 3D book, kicker and statline */}
      <BlurFade direction="up" offset={12}>
        <div className="relative overflow-hidden rounded-xl border bg-card shadow-card">
          {data.poster && (
            <>
              <BookAmbilight poster={data.poster} />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-1 bg-[linear-gradient(90deg,transparent,color-mix(in_oklab,var(--card)_55%,transparent)_45%,var(--card)_82%)]"
              />
            </>
          )}
          <div className="relative z-2 grid gap-8 p-6 sm:grid-cols-[252px_minmax(0,1fr)] sm:p-8">
            <div className="mx-auto w-full max-w-[252px] sm:mx-0">
              <Book3D poster={data.poster} title={data.title} naturalRatio className="text-[15px]" />
            </div>

            <div className="min-w-0">
              {(data.dlHistory || data.vip || data.fileTypes.length > 0 || data.categories.length > 0) && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
                  {data.dlHistory && <DlHistoryBadge label={data.dlHistory} />}
                  {data.vip && (
                    <Badge
                      className="bg-brand-soft text-accent-foreground"
                      variant="secondary"
                      title={data.vipExpires ? `VIP freeleech expires ${data.vipExpires}` : 'VIP freeleech'}
                    >
                      VIP{data.vipExpires && ` · until ${data.vipExpires}`}
                    </Badge>
                  )}
                  {data.fileTypes.map((f) => (
                    <Badge key={f} variant="outline" className="font-mono uppercase">{f}</Badge>
                  ))}
                  {genres.map((c) => (
                    <Badge key={c.href} variant="secondary" asChild><a href={c.href}>{c.name}</a></Badge>
                  ))}
                  {languages.map((c) => (
                    <Badge key={c.href} variant="outline" asChild><a href={c.href}>{c.name}</a></Badge>
                  ))}
                </div>
              )}

              {data.series.length > 0 && (
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
                  {data.series.map((s, i) => (
                    <span key={s.href + i}>
                      {i > 0 && <span className="text-muted-foreground/60"> / </span>}
                      <a href={s.href} className="hover:underline">
                        {s.name}
                        {s.part && ` · Part ${s.part}`}
                      </a>
                    </span>
                  ))}
                </div>
              )}

              <h1 className="font-display text-[31px] font-semibold leading-[1.15] tracking-[-0.018em] text-balance">{data.title}</h1>

              {(data.authors.length > 0 || data.narrators.length > 0) && (
                <p className="mt-2 text-[14px] text-muted-foreground">
                  {data.authors.length > 0 && <>by {people(data.authors)}</>}
                  {data.narrators.length > 0 && (
                    <>
                      {data.authors.length > 0 && ' · '}
                      read by {people(data.narrators)}
                    </>
                  )}
                </p>
              )}

              {stats.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-t pt-4">
                  {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} title={s.title} />)}
                </div>
              )}

              {data.mediaInfoMicro && (
                <div className="mt-3.5 flex flex-wrap gap-1.5">
                  {data.mediaInfoMicro.split(/\s+/).filter(Boolean).map((chip, i) => (
                    <Badge key={chip + i} variant="secondary" className="font-mono text-[11px]">{chip}</Badge>
                  ))}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center gap-2.5">
                {data.downloadBlocked ? (
                  <Button disabled><Download /> Download blocked</Button>
                ) : data.downloadHref || data.id ? (
                  <Button asChild>
                    <a href={data.downloadHref ?? `/tor/download.php?tid=${data.id}`}><Download /> Download</a>
                  </Button>
                ) : null}
                <BookmarkButton />
                {data.clone && (
                  <Button asChild variant="outline"><a href={data.clone}><Copy /> Clone</a></Button>
                )}
              </div>
              {data.downloadBlocked && (
                <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{data.downloadBlocked}</p>
              )}
            </div>
          </div>
        </div>
      </BlurFade>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* MAIN COLUMN: description, series strip, media info, files, peers */}
        <div className="grid min-w-0 gap-5">
          {data.descriptionHtml && (
            <Card>
              <CardHeader><CardTitle>Description</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="user-html prose-read prose-dropcap text-[14.5px] leading-[1.68] [&_a]:text-brand [&_a]:underline [&_p]:mb-3.5 [&_p:last-child]:mb-0"
                  dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
                />
              </CardContent>
            </Card>
          )}

          {data.series.length > 0 && <SeriesStrip data={data} />}

          {(data.mediaInfo.length > 0 || data.mediaInfoHtml) && (
            <Card>
              <CardHeader>
                <CardTitle>Media info</CardTitle>
                {data.mediaInfoFullHref && (
                  <CardAction>
                    <a href={data.mediaInfoFullHref} className="text-[12px] text-brand hover:underline">Full media info</a>
                  </CardAction>
                )}
              </CardHeader>
              <CardContent>
                {data.mediaInfo.length > 0 ? (
                  <MediaInfoTree nodes={data.mediaInfo} />
                ) : (
                  <div
                    className="legacy-html text-[12.5px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: data.mediaInfoHtml ?? '' }}
                  />
                )}
              </CardContent>
            </Card>
          )}

          {data.hasFilelist && data.id && (
            <RemotePanel
              title="Files"
              icon={<FileText className="size-4 text-muted-foreground" />}
              url={`/tor/filelist.php?torrentid=${data.id}`}
              fallback={() =>
                legacyFragment(() => (window as unknown as { fileListToggle?: (id: number) => void }).fileListToggle?.(data.id!), '#filesDisplay')
              }
            />
          )}
          {data.hasPeers && data.id && (
            <RemotePanel
              title="Peers"
              icon={<Users className="size-4 text-muted-foreground" />}
              url={`/tor/peers.php?simple=true&torrentid=${data.id}`}
              fallback={() =>
                legacyFragment(() => (window as unknown as { togglePeersList?: (id: number) => void }).togglePeersList?.(data.id!), '#peersDisplay')
              }
            />
          )}
        </div>

        {/* DETAILS sidebar: A24-style label-over-value grid */}
        <Card className="lg:sticky lg:top-20">
          <CardHeader><CardTitle>Details</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-5 gap-y-4">
              {data.uploader && (
                <KV label="Uploaded by">
                  <a className="font-medium hover:underline" style={{ color: mutedUserColor(data.uploader.color) }} href={data.uploader.href}>
                    {data.uploader.name}
                  </a>
                </KV>
              )}

              {languages.length > 0 && (
                <KV label="Language">
                  {languages.map((c, i) => (
                    <span key={c.href + i}>
                      {i > 0 && ', '}
                      <a className="hover:underline" href={c.href}>{c.name}</a>
                    </span>
                  ))}
                </KV>
              )}

              {data.tags && <KV label="Tags" full>{data.tags}</KV>}

              {(data.freeleech || data.ratio || data.ratioHtml) && (
                <KV label="Ratio after" full>
                  {(data.freeleech || data.personalFreeleech) && (
                    <div className="mb-1.5 flex flex-wrap gap-1.5">
                      {data.freeleech && <Badge className="bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>}
                      {data.personalFreeleech && <Badge className="bg-ok/15 text-ok" variant="secondary">Personal freeleech</Badge>}
                    </div>
                  )}
                  {data.ratio ? (
                    <div className="grid gap-2 text-[13px]">
                      {data.ratio.wouldBecome && (
                        <div className="text-muted-foreground">
                          Would become <span className="font-medium tabular-nums text-ok">{data.ratio.wouldBecome}</span>
                        </div>
                      )}
                      {data.ratio.buttons.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {data.ratio.buttons.map((b) => (
                            <Button
                              key={b.name ?? b.label}
                              size="sm"
                              variant="outline"
                              className="h-8 gap-1.5"
                              title="Spend a wedge to make this a personal freeleech download."
                              onClick={() =>
                                proxyClick(
                                  `input[data-freetor="${b.torId}"]${b.name ? `[name="${b.name}"]` : ''}`,
                                  'This freeleech option is not available.',
                                )
                              }
                            >
                              <Gift className="size-3.5" /> {b.label}
                            </Button>
                          ))}
                        </div>
                      )}
                      {data.ratio.note && <div className="text-[12px] text-muted-foreground">{data.ratio.note}</div>}
                    </div>
                  ) : (
                    data.ratioHtml && (
                      <div className="text-[13px] leading-relaxed text-muted-foreground [&_a]:text-brand [&_a]:underline" dangerouslySetInnerHTML={{ __html: data.ratioHtml }} />
                    )
                  )}
                </KV>
              )}

              {data.reseed && (
                <KV label="Reseed" full>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
                    {data.reseed.status && <span>{data.reseed.status}</span>}
                    {data.reseed.actionHref && (
                      <a href={data.reseed.actionHref} className="text-brand underline">Request reseed</a>
                    )}
                    {data.reseed.reason && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <button className="inline-flex items-center gap-1 text-[12.5px] text-brand underline underline-offset-2">
                            <Info className="size-3.5" /> Find out why
                          </button>
                        </PopoverTrigger>
                        <PopoverContent className="w-64 text-[13px] leading-relaxed">{data.reseed.reason}</PopoverContent>
                      </Popover>
                    )}
                  </div>
                </KV>
              )}

              {data.downloadBlocked && (
                <KV label="Access" full>
                  <span className="text-[13px] leading-relaxed text-muted-foreground">
                    {data.downloadBlocked}{' '}
                    {data.blockedClassesHref && (
                      <a href={data.blockedClassesHref} className="text-brand underline">About the classes</a>
                    )}
                  </span>
                </KV>
              )}

              {data.extraRows.map((r, i) => (
                <KV key={i} label={r.label} full>
                  <span className="legacy-html" dangerouslySetInnerHTML={{ __html: r.html }} />
                </KV>
              ))}
            </dl>

            {(data.hasSubmitInfo || data.reportIssueHref) && (
              <div className="mt-5 grid gap-1.5 rounded-lg bg-muted/40 p-3 text-[12.5px]">
                {data.hasSubmitInfo && (
                  <button
                    onClick={() => proxyClick('#submitInfo [data-tormissdataj]', 'Submitting info is not available for this torrent.')}
                    className="inline-flex items-center gap-2 text-left text-muted-foreground transition-colors hover:text-brand"
                  >
                    <FilePenLine className="size-3.5 shrink-0" /> Submit missing info
                  </button>
                )}
                {data.reportIssueHref && (
                  <a href={data.reportIssueHref} className="inline-flex items-center gap-2 text-muted-foreground transition-colors hover:text-brand">
                    <Flag className="size-3.5 shrink-0" /> Report an issue
                  </a>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* COMMENTS: full width, real conversation */}
      <Card className="gap-0 py-0">
        <CardHeader className="flex flex-row items-center justify-between !py-3.5">
          <CardTitle>
            Comments{data.commentCount ? ` (${data.commentCount})` : data.comments.length ? ` (${data.comments.length})` : ''}
          </CardTitle>
          {data.addCommentHref && (
            <Button asChild size="sm" variant="outline" className="h-8">
              <a href={data.addCommentHref}><MessageSquarePlus /> Add comment</a>
            </Button>
          )}
        </CardHeader>
        <CardContent className="grid gap-4 px-6 py-5">
          {/* Thank the uploader, inline */}
          <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
            <Gift className="size-4 text-brand" />
            <span className="text-[13px] font-medium">Thank the uploader</span>
            <Input type="number" min={0} max={5000} step={50} value={points} onChange={(e) => setPoints(e.target.value)} placeholder="0" className="ml-auto h-8 w-24" />
            <span className="text-[12.5px] text-muted-foreground">points</span>
            <Button size="sm" className="h-8" onClick={thank}>Say thanks</Button>
          </div>
          {data.comments.length > 0 ? (
            <div className="grid">
              {data.comments.map((c) => <Comment key={c.id} c={c} />)}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Be the first to leave one.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
