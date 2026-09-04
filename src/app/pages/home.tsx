import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowDown, ArrowRight, Gift, Megaphone, Plus, Send, X } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractHome, extractShouts, type HomeTorrent, type Shout } from '@/lib/extract/home'
import { searchTorrents, parsePeople, coverUrl } from '@/lib/mam-api'
import { coverShape, type CoverShape } from '@/lib/cover-shape'
import { mutedUserColor } from '@/lib/colors'
import { fmtInt, localHm, relTime, utcTitle } from '@/lib/format'
import { useHiddenSections, type HiddenSections } from '@/lib/hidden-sections'
import { useGiftedSet, uidFromHref } from '@/lib/giftmam'
import { ALERT_LABEL, ALERT_TITLE, matchesAlert, useShoutAlerts, type ShoutAlerts } from '@/lib/shout-alerts'
import { useFeature } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { Book } from '@/components/book'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NumberRoll } from '@/components/ui/number-roll'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { ShineBorder } from '@/components/ui/shine-border'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'
import { scrollTo } from '@/lib/motion'
import { NO_AUTOFILL } from '@/lib/autofill'

const VAULT_GOAL = 20_000_000

/** Within this distance from the bottom the reader still counts as caught up,
 * so new shouts keep the list pinned to the latest one. */
const SHOUT_PIN_THRESHOLD_PX = 40

/** Dashboard sections a reader can dismiss, in the order the restore bar lists
 * them. MAM can only reorder its own front-page blocks, never hide them. */
const SECTIONS: { id: string; label: string }[] = [
  { id: 'news', label: 'News highlight' },
  { id: 'shelf', label: 'Fresh on the shelves' },
  { id: 'reading-room', label: 'The reading room' },
  { id: 'conversations', label: 'Conversations' },
  { id: 'vault', label: "Millionaire's vault" },
  { id: 'announcements', label: 'Announcements' },
  { id: 'stats', label: 'Library tonight' },
  { id: 'trackers', label: 'Trackers' },
  { id: 'new-members', label: 'Welcome, new mice' },
]

/** Dismiss control: MAM's own idiom (its news ticker carries a red X), kept
 * quiet until the section is hovered or the button is tabbed to. */
function HideButton({ label, onHide, className }: { label: string; onHide: () => void; className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          onClick={onHide}
          aria-label={`Hide ${label}`}
          className={cn(
            'size-6 shrink-0 text-muted-foreground opacity-0 transition-[opacity,color,background-color] focus-visible:opacity-100 group-hover/sect:opacity-100 pointer-coarse:opacity-100',
            className
          )}
        >
          <X className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Hide this section</TooltipContent>
    </Tooltip>
  )
}

/** Chips for everything dismissed, so a hidden section is never lost. */
function HiddenBar({ sections }: { sections: HiddenSections }) {
  if (!sections.hidden.length) return null
  const gone = SECTIONS.filter((s) => sections.isHidden(s.id))
  return (
    <div className="flex flex-wrap items-center gap-2 text-12-5 text-muted-foreground">
      <span>Hidden</span>
      {gone.map((s) => (
        <Button
          key={s.id}
          variant="outline"
          size="sm"
          onClick={() => sections.show(s.id)}
          className="h-7 gap-1 rounded-full px-2.5 text-12-5 font-normal text-muted-foreground hover:text-foreground"
        >
          <Plus className="size-3" />
          {s.label}
        </Button>
      ))}
      {gone.length > 1 && (
        <Button variant="link" onClick={sections.showAll} className="h-auto p-0 text-12-5 text-brand">
          Show all
        </Button>
      )}
    </div>
  )
}

function greeting(name: string): string {
  const h = new Date().getHours()
  const part = h < 6 ? 'Good night' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
  return name ? `${part}, ${name}` : part
}

interface ShelfItem {
  id: number
  href: string
  title: string
  authorsText: string
  fileType: string | null
  vip: boolean
  explicit: boolean
  poster: string | null
  shape: CoverShape
}

function Shelf({ items }: { items: ShelfItem[] }) {
  return (
    <div className="grid grid-cols-2 items-end gap-5 sm:grid-cols-3 lg:grid-cols-5">
      {items.slice(0, 5).map((t, i) => (
        <BlurFade key={t.id} delay={0.06 * i} direction="up" offset={10}>
        <a href={t.href} className="group grid content-end gap-2.5">
          <span className="relative block transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1.5 motion-reduce:transition-none">
            <Book poster={t.poster} title={t.title} author={t.authorsText} shape={t.shape} size="shelf" className="group-hover:shadow-book-lift" />
            {t.fileType && (
              <span className="absolute right-1.5 top-1.5 z-3 rounded bg-black/55 px-1.5 py-0.5 font-mono text-9-5 font-semibold uppercase tracking-wide text-white backdrop-blur-[2px]">
                {t.fileType}
              </span>
            )}
            {(t.vip || t.explicit) && (
              <span className="absolute bottom-2 left-2 z-3 rounded-full bg-brand-soft px-2 py-0.5 text-9-5 font-semibold tracking-wide text-accent-foreground">
                {[t.vip ? 'VIP' : null, t.explicit ? '18+' : null].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
          <div className="grid gap-0.5">
            <span className="font-display line-clamp-2 text-13 font-medium leading-snug">{t.title}</span>
            <span className="line-clamp-1 text-11-5 text-muted-foreground">{t.authorsText}</span>
          </div>
        </a>
        </BlurFade>
      ))}
    </div>
  )
}

function shelfFromDom(torrents: HomeTorrent[]): ShelfItem[] {
  return torrents.map((t) => ({
    id: t.id,
    href: t.href,
    title: t.title,
    authorsText: t.authors.map((a) => a.name).join(', ') || t.desc || '',
    fileType: t.fileTypes[0] ?? null,
    vip: t.vip,
    explicit: t.explicit,
    // The front-page table carries no poster URLs; covers arrive via the
    // search API refresh below.
    poster: null,
    shape: 'portrait',
  }))
}


function ShoutList({ shouts, alerts }: { shouts: Shout[]; alerts: ShoutAlerts | null }) {
  // The horizontal padding gives a marked row's negative margin somewhere to
  // go: this grid sits straight against the scroll viewport, which would clip
  // it on the left and scroll on the right.
  return (
    <div className="grid gap-1.5 px-1">
      {/* The time keeps a column of its own; the name and the words share the
          next one, so a second line carries on under the name rather than
          leaving the left of the row empty. */}
      {shouts.map((s) => {
        const alerted =
          alerts?.mark != null &&
          matchesAlert(alerts, `${s.user?.name ?? ''} ${s.text}`, s.user?.uid ?? null)
        return (
        <div
          key={s.id}
          title={alerted ? ALERT_TITLE : undefined}
          style={alerted && alerts?.mark ? { backgroundColor: alerts.mark.fill, borderColor: alerts.mark.edge } : undefined}
          className={cn(
            'grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 text-13',
            alerted && '-mx-1 rounded-md border px-1 py-0.5'
          )}
        >
          {alerted && <span className="sr-only select-none">{ALERT_LABEL}</span>}
          <span className="font-mono text-10-5 text-muted-foreground" title={utcTitle(s.time)}>{localHm(s.time)}</span>
          <p className={cn('[overflow-wrap:anywhere]', alerted ? 'text-foreground' : 'text-foreground-soft')}>
            {/* The margin sets the gap; the space after it keeps a copied line
                readable. */}
            {s.user && (
              <>
                <a
                  href={s.user.uid ? `/u/${s.user.uid}` : '#'}
                  className="mr-1 font-semibold whitespace-nowrap"
                  style={{ color: mutedUserColor(s.user.color) }}
                >
                  {s.user.name}
                </a>{' '}
              </>
            )}
            {s.text}
          </p>
        </div>
        )
      })}
    </div>
  )
}

export function HomeView({ page }: PageProps) {
  const data = useMemo(() => extractHome(document), [])
  const [shouts, setShouts] = useState<Shout[]>(data.shouts)
  const [posts, setPosts] = useState(data.posts)
  const [members, setMembers] = useState(data.members)
  const [shelf, setShelf] = useState<ShelfItem[]>(() => shelfFromDom(data.torrents))
  const [draft, setDraft] = useState('')
  const shoutViewport = useRef<HTMLDivElement>(null)
  const shoutsPinned = useRef(true)
  const [shoutsAtLatest, setShoutsAtLatest] = useState(true)
  const sections = useHiddenSections()
  const gifted = useGiftedSet()
  const [alertsOn] = useFeature('sbAlerts')
  const alerts = useShoutAlerts(alertsOn)

  // Refresh the shelf via the search API: newer data AND real cover art.
  useEffect(() => {
    searchTorrents({ sortType: 'dateDesc', perpage: 5, srchIn: ['title'] })
      .then((res) => {
        if (!res.data.length) return
        setShelf((cur) =>
          res.data.map((t) => ({
            id: t.id,
            href: `/t/${t.id}`,
            title: t.title,
            authorsText: parsePeople(t.author_info).map((a) => a.name).join(', '),
            fileType: t.filetype?.split(' ')[0] ?? null,
            vip: t.vip === 1,
            // The search API carries no explicit flag; keep what the page said.
            explicit: cur.find((c) => c.id === t.id)?.explicit ?? false,
            poster: t.poster_type ? coverUrl(t.id, t.poster_type) : null,
            shape: coverShape({ mediatype: t.mediatype, mainCat: t.main_cat }),
          }))
        )
      })
      .catch(() => { /* keep the DOM-extracted shelf */ })
  }, [])

  // MAM's own scripts keep refreshing the hidden legacy shoutbox - mirror it live.
  useEffect(() => {
    const sbf = document.querySelector('#sbf')
    if (!sbf) return
    const obs = new MutationObserver(() => setShouts(extractShouts(sbf)))
    obs.observe(sbf, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  // The front-page "recent posts" and "newest members" widgets are filled by
  // MAM's own JS after load, often after we mount - watch and re-read them.
  useEffect(() => {
    const postsEl = document.querySelector('#fpPostsContent')
    const membersEl = document.querySelector('#newestMembers')
    if (!postsEl && !membersEl) return
    const refresh = () => {
      const d = extractHome(document)
      if (d.posts.length) setPosts(d.posts)
      if (d.members.length) setMembers(d.members)
    }
    const obs = new MutationObserver(refresh)
    if (postsEl) obs.observe(postsEl, { childList: true, subtree: true })
    if (membersEl) obs.observe(membersEl, { childList: true, subtree: true })
    refresh()
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (shoutsPinned.current) shoutViewport.current?.scrollTo({ top: shoutViewport.current.scrollHeight })
  }, [shouts])

  useEffect(() => {
    const el = shoutViewport.current
    if (!el) return
    const onScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < SHOUT_PIN_THRESHOLD_PX
      shoutsPinned.current = atBottom
      setShoutsAtLatest(atBottom)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  function jumpToLatestShout() {
    shoutsPinned.current = true
    setShoutsAtLatest(true)
    scrollTo(shoutViewport.current, { top: shoutViewport.current?.scrollHeight })
  }

  function sendShout() {
    const text = draft.trim()
    if (text.length < 4) {
      toast.warning('Shouts need at least 4 characters.')
      return
    }
    // Drive the original (hidden) shoutbox form so MAM's own JS handles it.
    const input = document.querySelector<HTMLInputElement>('#shbox_text')
    const form = document.querySelector<HTMLFormElement>('#sbform')
    const btn = form?.querySelector<HTMLInputElement>('input[name="send"]')
    if (!input || !form) {
      toast.error('Shoutbox is not available on this page.')
      return
    }
    input.value = text
    if (btn) btn.click()
    else form.requestSubmit()
    setDraft('')
    toast.success('Shout sent')
  }

  const vaultNum = Number(page.vault?.replace(/,/g, '') ?? 0)

  return (
    <div className="grid gap-5">
      <div>
        <h1 className="font-display text-26 font-semibold tracking-tight">{greeting(page.user.name)}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-13 text-muted-foreground">
          {new Date().toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
          {data.stats.find((s) => s.label === 'Enabled Users') && (
            <> · {data.stats.find((s) => s.label === 'Enabled Users')!.value.split(' / ')[0]} members reading right now</>
          )}
          {data.news[0] && !sections.isHidden('news') && (
            <span className="group/sect inline-flex items-center gap-1 rounded-md bg-brand-soft py-0.5 pr-1 pl-2 font-medium text-accent-foreground">
              <a href={data.news[0].href} className="inline-flex items-center gap-1">
                <Megaphone className="size-3" /> {data.news[0].text}
              </a>
              <HideButton label="News highlight" onHide={() => sections.hide('news')} className="size-5" />
            </span>
          )}
        </p>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[2fr_1fr]">
        <div className="grid gap-5">
          {!sections.isHidden('shelf') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>Fresh on the shelves</CardTitle>
              <CardAction className="flex items-center gap-2">
                <a href="/tor/browse.php" className="inline-flex items-center gap-1 text-12-5 font-medium text-brand">
                  Browse all <ArrowRight className="size-3.5" />
                </a>
                <HideButton label="Fresh on the shelves" onHide={() => sections.hide('shelf')} />
              </CardAction>
            </CardHeader>
            <CardContent>
              {shelf.length ? <Shelf items={shelf} /> : (
                <p className="py-4 text-center text-sm text-muted-foreground">No fresh torrents on the front page.</p>
              )}
            </CardContent>
          </Card>
          )}

          {!sections.isHidden('reading-room') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>The reading room</CardTitle>
              <CardAction className="flex items-center gap-2">
                <a href="/shoutbox/index.php" className="inline-flex items-center gap-1 text-12-5 font-medium text-brand">
                  Open shoutbox <ArrowRight className="size-3.5" />
                </a>
                <HideButton label="The reading room" onHide={() => sections.hide('reading-room')} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="relative">
                <ScrollArea viewportRef={shoutViewport} viewportClassName="max-h-64 overscroll-contain">
                  {shouts.length ? <ShoutList shouts={shouts} alerts={alerts} /> : (
                    <p className="py-3 text-center text-sm text-muted-foreground">The room is quiet right now.</p>
                  )}
                </ScrollArea>
                {!shoutsAtLatest && (
                  <Button
                    size="sm"
                    onClick={jumpToLatestShout}
                    className="absolute bottom-2 left-1/2 h-6 -translate-x-1/2 gap-1.5 rounded-full px-2.5 text-11 shadow-lg transition-transform hover:scale-105"
                  >
                    <ArrowDown className="size-3" /> Jump to latest
                  </Button>
                )}
              </div>
              <div className="flex h-10 items-center gap-1.5 rounded-lg border border-input-line bg-background pr-1 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring">
                <input
                  {...NO_AUTOFILL}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendShout()}
                  placeholder="Say something nice…"
                  aria-label="Write a shout"
                  maxLength={1500}
                  className="h-full min-w-0 flex-1 bg-transparent pl-3 text-13-5 outline-none placeholder:text-muted-foreground"
                />
                <Button onClick={sendShout} size="sm" className="h-7 shrink-0 text-12"><Send /> Shout</Button>
              </div>
            </CardContent>
          </Card>
          )}

          {!sections.isHidden('conversations') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>Conversations</CardTitle>
              <CardAction className="flex items-center gap-2">
                <a href="/f" className="inline-flex items-center gap-1 text-12-5 font-medium text-brand">
                  All forums <ArrowRight className="size-3.5" />
                </a>
                <HideButton label="Conversations" onHide={() => sections.hide('conversations')} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid">
              {posts.slice(0, 6).map((p, i) => (
                <a
                  key={i}
                  href={p.lastHref ?? p.href}
                  className="-mx-2 flex items-center justify-between gap-4 rounded-md px-2 py-2 hover:bg-accent/50"
                >
                  <span className="min-w-0">
                    <span className="font-display block truncate text-14 font-medium">{p.title}</span>
                    <span className="block text-12 text-muted-foreground">
                      {p.board} · last by {p.lastBy ?? p.author} · <span title={utcTitle(p.lastAt)}>{relTime(p.lastAt)}</span>
                    </span>
                  </span>
                  <span className="shrink-0 font-mono text-11-5 text-muted-foreground">{fmtInt(p.replies)} replies</span>
                </a>
              ))}
              {!posts.length && <p className="py-3 text-center text-sm text-muted-foreground">No recent forum posts.</p>}
            </CardContent>
          </Card>
          )}
        </div>

        <div className="grid gap-5">
          {!sections.isHidden('vault') && (
          <Card className="group/sect relative overflow-hidden">
            <ShineBorder shineColor={['var(--gifted)', 'var(--brand)']} duration={12} />
            <CardHeader>
              <CardTitle>Millionaire's vault</CardTitle>
              <CardAction>
                <HideButton label="Millionaire's vault" onHide={() => sections.hide('vault')} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid gap-2">
              <span className="font-display text-2xl font-semibold tabular-nums">
                {vaultNum > 0 ? <NumberRoll value={vaultNum} /> : page.vault ?? '–'}
              </span>
              <Progress value={Math.min(100, (vaultNum / VAULT_GOAL) * 100)} className="[&>div]:bg-brand-fill" />
              <span className="text-12 text-muted-foreground">of 20,000,000 points · everyone gets 2 wedges</span>
              <Button asChild variant="outline" size="sm" className="mt-1 w-fit">
                <a href="/millionaires/pot.php">Donate up to 2,000/day</a>
              </Button>
            </CardContent>
          </Card>
          )}

          {!sections.isHidden('announcements') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>Announcements</CardTitle>
              <CardAction>
                <HideButton label="Announcements" onHide={() => sections.hide('announcements')} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid">
              {data.news.map((nw, i) => (
                <a key={i} href={nw.href} className="-mx-2 flex gap-3 rounded-md px-2 py-2 hover:bg-accent/50">
                  <span className="shrink-0 pt-0.5 font-mono text-11 text-muted-foreground">{nw.date?.slice(5) ?? ''}</span>
                  <span className={'text-13 ' + (nw.sub ? 'text-muted-foreground' : 'font-medium')}>{nw.text}</span>
                </a>
              ))}
              {!data.news.length && <p className="py-3 text-center text-sm text-muted-foreground">No announcements.</p>}
            </CardContent>
          </Card>
          )}

          {!sections.isHidden('stats') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>Library tonight</CardTitle>
              <CardAction>
                <HideButton label="Library tonight" onHide={() => sections.hide('stats')} />
              </CardAction>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-3">
              {[
                ['Torrents', data.stats.find((s) => s.label === 'Torrents')?.value],
                ['Members online', data.stats.find((s) => s.label === 'Enabled Users')?.value.split(' / ')[0]],
                ['Peers', data.stats.find((s) => s.label === 'Peers')?.value],
                ['VIP torrents', data.stats.find((s) => s.label === 'VIP Torrents')?.value],
                ['Leechers', data.stats.find((s) => s.label === 'Leechers')?.value],
                ['Connectable v4', data.stats.find((s) => s.label === 'Connectable (IPv4)')?.value],
              ].filter(([, v]) => v).map(([label, value]) => {
                const num = /^[\d,]+$/.test(value ?? '') ? Number((value ?? '').replace(/,/g, '')) : null
                return (
                  <div key={label as string}>
                    <div className="font-display text-lg font-semibold tabular-nums">
                      {num != null ? <NumberRoll value={num} /> : value}
                    </div>
                    <div className="text-11-5 text-muted-foreground">{label}</div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
          )}

          {data.servers.length > 0 && !sections.isHidden('trackers') && (
            <Card className="group/sect">
              <CardHeader>
                <CardTitle>Trackers</CardTitle>
                <CardAction>
                  <HideButton label="Trackers" onHide={() => sections.hide('trackers')} />
                </CardAction>
              </CardHeader>
              <CardContent className="grid gap-2.5">
                {data.servers.map((s) => (
                  <div key={s.name} className="grid gap-1">
                    <div className="flex justify-between text-12">
                      <span className="font-medium">{s.name}</span>
                      <span className="font-mono text-muted-foreground">{s.cpuAvail != null ? `${s.cpuAvail.toFixed(0)}% free` : '–'}</span>
                    </div>
                    <Progress value={s.cpuAvail ?? 0} className="h-1.5 [&>div]:bg-ok" />
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {!sections.isHidden('new-members') && (
          <Card className="group/sect">
            <CardHeader>
              <CardTitle>Welcome, new mice</CardTitle>
              <CardAction>
                <HideButton label="Welcome, new mice" onHide={() => sections.hide('new-members')} />
              </CardAction>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-1.5">
              {members.slice(0, 12).map((m) => {
                const uid = uidFromHref(m.href)
                const isGifted = uid != null && gifted.has(uid)
                return (
                  <Badge
                    key={m.href}
                    variant="outline"
                    asChild
                    className={isGifted ? 'border-gifted/40 bg-gifted/10 text-gifted' : undefined}
                  >
                    <a href={m.href} title={isGifted ? 'Already gifted (GiftMAM)' : undefined}>
                      {isGifted && <Gift className="size-3" />}
                      {m.name}
                    </a>
                  </Badge>
                )
              })}
              {!members.length && <p className="text-sm text-muted-foreground">Nobody new right now.</p>}
            </CardContent>
          </Card>
          )}
        </div>
      </div>

      <HiddenBar sections={sections} />
    </div>
  )
}
