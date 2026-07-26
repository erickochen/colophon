import { useMemo, useState } from 'react'
import { Bookmark, BookmarkCheck, ChevronDown, Copy, Download, FilePenLine, FileText, Flag, Gift, Info, MessageSquarePlus, Users } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTorrent, type MediaNode, type TorrentComment } from '@/lib/extract/torrent'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { cleanHtml } from '@/lib/sanitize'
import { initials, relTime } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Input } from '@/components/ui/input'
import { NumberTicker } from '@/components/ui/number-ticker'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_1fr] gap-3 py-2.5 text-[13.5px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0">{children}</span>
    </div>
  )
}

function StatTile({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  const num = /^[\d,]+$/.test(value) ? Number(value.replace(/,/g, '')) : null
  return (
    <div className="rounded-lg bg-muted/50 px-3.5 py-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="pt-0.5 font-display text-[16px] font-semibold tabular-nums">
        {num != null && num > 0 ? <NumberTicker value={num} /> : value}
      </div>
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
    <Button variant="outline" size="sm" disabled={busy} onClick={remove} className="text-brand">
      <BookmarkCheck /> Bookmarked
    </Button>
  ) : (
    <Button variant="outline" size="sm" disabled={busy} onClick={add}>
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
            <a href={c.author.href} className="text-[13px] font-semibold hover:underline" style={{ color: c.author.color ?? undefined }}>
              {c.author.name}
            </a>
          )}
          {c.authorClass && <span className="text-[11px] text-muted-foreground">{c.authorClass}</span>}
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
              ? 'text-[11px] font-semibold uppercase tracking-wide text-brand'
              : 'text-[12.5px] font-medium'}>
              {n.label}
            </div>
            <div className={n.children.length > 12 ? 'mt-1 max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-2.5' : 'mt-1 pl-0.5'}>
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

/** Fetch a same-origin HTML fragment (filelist, peers) once, on first expand. */
function useRemoteHtml(url: string | null) {
  const [s, setS] = useState<{ loading: boolean; html: string | null; error: boolean }>({ loading: false, html: null, error: false })
  function load() {
    if (!url || s.html || s.loading) return
    setS({ loading: true, html: null, error: false })
    fetch(url, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => {
        const doc = new DOMParser().parseFromString(t, 'text/html')
        setS({ loading: false, html: cleanHtml(doc.body) ?? '', error: false })
      })
      .catch(() => setS({ loading: false, html: null, error: true }))
  }
  return { ...s, load }
}

// No borders anywhere in this design (see index.css): tables separate rows with
// a zebra fill, not rules.
const REMOTE_HTML_CLS =
  'legacy-html overflow-x-auto text-[12.5px] leading-relaxed [&_a[href]]:text-brand [&_a[href]]:underline [&_table]:w-full [&_table]:border-separate [&_table]:border-spacing-0 [&_th]:px-2.5 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium [&_th]:text-muted-foreground [&_td]:px-2.5 [&_td]:py-1.5 [&_tbody_tr:nth-child(odd)]:bg-muted/30 [&_img]:inline-block [&_img]:h-4 [&_img]:w-auto'

/** Collapsible card that lazy-loads a MAM fragment the first time it opens. */
function RemotePanel({ title, icon, url }: { title: string; icon: React.ReactNode; url: string | null }) {
  const r = useRemoteHtml(url)
  if (!url) return null
  return (
    <Card className="gap-0 py-0">
      <Collapsible onOpenChange={(open) => open && r.load()}>
        <CollapsibleTrigger asChild>
          <button className="flex w-full items-center justify-between px-6 py-4 text-left [&[data-panel-open]_.chev]:rotate-180">
            <span className="flex items-center gap-2 font-display text-[17px]">{icon} {title}</span>
            <ChevronDown className="chev size-4 text-muted-foreground transition-transform" />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-6 pb-5">
            {r.loading && (
              <div className="flex items-center gap-2 py-4 text-[13px] text-muted-foreground"><Spinner className="size-4" /> Loading…</div>
            )}
            {r.error && <p className="py-4 text-[13px] text-muted-foreground">Could not load this. <a className="text-brand underline" href={url}>Open it directly.</a></p>}
            {r.html && <div className={REMOTE_HTML_CLS} dangerouslySetInnerHTML={{ __html: r.html }} />}
          </div>
        </CollapsibleContent>
      </Collapsible>
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

  return (
    <div className="grid gap-6">
      {/* HERO: cover-derived ambient backdrop, album-art style */}
      <BlurFade direction="up" offset={12}>
        <div className="relative overflow-hidden rounded-xl bg-card shadow-sm">
          {data.poster && (
            <>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 scale-125 bg-cover bg-center opacity-30 blur-2xl saturate-150 dark:opacity-35"
                style={{ backgroundImage: `url('${data.poster}')` }}
              />
              <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-card via-card/80 to-card/25" />
            </>
          )}
          <div className="relative grid gap-7 p-6 sm:grid-cols-[240px_minmax(0,1fr)] sm:p-7">
            <div className="grid content-start gap-3">
              {data.poster ? (
                /* Colour glow beneath, spine shading on the left edge, lift on hover. */
                <div className="group relative isolate">
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-3 bottom-1 top-4 -z-10 bg-cover bg-center opacity-60 blur-2xl saturate-200"
                    style={{ backgroundImage: `url('${data.poster}')` }}
                  />
                  <img
                    src={data.poster}
                    alt={data.title ?? 'cover'}
                    className="w-full rounded-lg shadow-[0_18px_40px_-12px_rgb(0_0_0/0.45)] transition-transform duration-300 ease-out group-hover:-translate-y-1"
                  />
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-y-0 left-0 w-5 rounded-l-lg bg-gradient-to-r from-black/30 via-black/10 to-transparent transition-transform duration-300 ease-out group-hover:-translate-y-1"
                  />
                </div>
              ) : (
                <div className="flex aspect-[3/4] items-center justify-center rounded-lg bg-muted font-display text-5xl text-muted-foreground shadow-xl">
                  {data.title?.[0] ?? '?'}
                </div>
              )}
              {data.downloadBlocked ? (
                <div className="grid gap-1.5">
                  <Button size="lg" className="w-full" disabled><Download /> Download blocked</Button>
                  <p className="text-center text-[11.5px] leading-snug text-muted-foreground">{data.downloadBlocked}</p>
                </div>
              ) : data.downloadHref || data.id ? (
                <Button asChild size="lg" className="w-full">
                  <a href={data.downloadHref ?? `/tor/download.php?tid=${data.id}`}><Download /> Download</a>
                </Button>
              ) : null}
              <div className="grid grid-cols-2 gap-2">
                <BookmarkButton />
                {data.clone && (
                  <Button asChild variant="outline" size="sm"><a href={data.clone}><Copy /> Clone</a></Button>
                )}
              </div>
            </div>

            <div className="grid content-start gap-3">
              <div className="flex flex-wrap items-center gap-2">
                {data.vip && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
                {data.fileTypes.map((f) => (
                  <Badge key={f} variant="outline" className="font-mono uppercase">{f}</Badge>
                ))}
                {data.categories.map((c) => (
                  <Badge key={c.href} variant="secondary" asChild><a href={c.href}>{c.name}</a></Badge>
                ))}
              </div>
              <h1 className="font-display text-[32px] font-semibold leading-[1.1] tracking-tight">{data.title}</h1>
              {data.authors.length > 0 && (
                <p className="text-[15.5px] text-muted-foreground">by {people(data.authors)}</p>
              )}
              {data.narrators.length > 0 && (
                <p className="text-[13.5px] text-muted-foreground">Narrated by {people(data.narrators)}</p>
              )}
              {data.series.length > 0 && (
                <p className="text-[13.5px] text-muted-foreground">
                  {data.series.map((s, i) => (
                    <span key={s.href + i}>
                      {i > 0 && ', '}
                      <a className="text-brand hover:underline" href={s.href}>{s.name}</a>
                      {s.part && <span> #{s.part}</span>}
                    </span>
                  ))}
                </p>
              )}
              {data.tags && <p className="max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{data.tags}</p>}
            </div>
          </div>
        </div>
      </BlurFade>

      {/* STATS */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Size" value={data.size} />
        <StatTile label="Files" value={data.files.count} />
        <StatTile label="Seeders" value={data.seeders} />
        <StatTile label="Leechers" value={data.leechers} />
        <StatTile label="Snatched" value={data.snatched} />
        <StatTile label="Added" value={data.added} />
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {/* MAIN COLUMN: description, media info, files, peers */}
        <div className="grid min-w-0 gap-6">
          {data.descriptionHtml && (
            <Card>
              <CardHeader><CardTitle>Description</CardTitle></CardHeader>
              <CardContent>
                <div
                  className="user-html max-w-none text-[14px] leading-relaxed [&_a]:text-brand [&_a]:underline [&_p]:mb-3"
                  dangerouslySetInnerHTML={{ __html: data.descriptionHtml }}
                />
              </CardContent>
            </Card>
          )}

          {(data.mediaInfo.length > 0 || data.mediaInfoMicro) && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Info className="size-4 text-brand" /> Media info</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4">
                {data.mediaInfoMicro && (
                  <div className="flex flex-wrap gap-1.5">
                    {data.mediaInfoMicro.split(/\s+/).filter(Boolean).map((chip, i) => (
                      <Badge key={chip + i} variant="secondary" className="font-mono text-[11.5px]">{chip}</Badge>
                    ))}
                  </div>
                )}
                {data.mediaInfo.length > 0 && <MediaInfoTree nodes={data.mediaInfo} />}
              </CardContent>
            </Card>
          )}

          {data.hasFilelist && data.id && (
            <RemotePanel title="Files" icon={<FileText className="size-4 text-muted-foreground" />} url={`/tor/filelist.php?torrentid=${data.id}`} />
          )}
          {data.hasPeers && data.id && (
            <RemotePanel title="Peers" icon={<Users className="size-4 text-muted-foreground" />} url={`/tor/peers.php?simple=true&torrentid=${data.id}`} />
          )}
        </div>

        {/* DETAILS sidebar */}
        <Card className="py-0 lg:sticky lg:top-20">
          <CardContent className="px-6 py-1">
            {data.uploader && (
              <MetaRow label="Uploader">
                <a className="font-medium hover:underline" style={{ color: data.uploader.color ?? undefined }} href={data.uploader.href}>{data.uploader.name}</a>
              </MetaRow>
            )}

            {(data.freeleech || data.ratio || data.ratioHtml) && (
              <MetaRow label="Ratio">
                {data.freeleech && <Badge className="mb-1 bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>}
                {data.ratio ? (
                  <div className="grid gap-2 text-[13px]">
                    {data.ratio.wouldBecome && (
                      <div className="text-muted-foreground">
                        Would become <span className="font-medium text-ok">{data.ratio.wouldBecome}</span>
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
              </MetaRow>
            )}

            {data.reseed && (
              <MetaRow label="Reseed">
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
              </MetaRow>
            )}

            {data.downloadBlocked && data.blockedClassesHref && (
              <MetaRow label="Access">
                <div className="text-[13px] leading-relaxed text-muted-foreground">
                  {data.downloadBlocked} <a href={data.blockedClassesHref} className="text-brand underline">About the classes</a>
                </div>
              </MetaRow>
            )}

            {data.extraRows.map((r, i) => (
              <MetaRow key={i} label={r.label}>
                <span className="legacy-html" dangerouslySetInnerHTML={{ __html: r.html }} />
              </MetaRow>
            ))}

            {(data.hasSubmitInfo || data.reportIssueHref) && (
              <div className="my-3 grid gap-1.5 rounded-lg bg-muted/40 p-3 text-[12.5px]">
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
