import { Fragment, useEffect, useId, useMemo, useRef, useState, type ComponentProps, type RefObject } from 'react'
import { MotionConfig, motion, useInView, useReducedMotion, type Variants } from 'motion/react'
import { Bookmark, BookmarkCheck, Check, CircleSlash, Copy, Download, FilePenLine, Flag, Gift, Heart, History, Info, Lock, MessageSquarePlus, Minus, MoreHorizontal, Quote, Settings2, Sprout } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTorrent, type MediaNode, type TorrentComment, type TorrentDetail } from '@/lib/extract/torrent'
import { parseFileList, parsePeers, type FileListData, type PeerData, type PeerRow, type TorrentFile } from '@/lib/extract/torrent-panels'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { mutedUserColor } from '@/lib/colors'
import { fmtInt, fmtRatio, initials, plural, relTime, stampMs, utcTitle } from '@/lib/format'
import { mediaInfoGroupLabel, mediaInfoLabel } from '@/lib/media-info'
import { bookmarkOne, searchTorrents, parsePeople, coverUrl, torrentUrl, thankUploader, THANK_STEP, type SearchTorrent } from '@/lib/mam-api'
import { coverShape, mediaTypeFromHref, type CoverShape } from '@/lib/cover-shape'
import { seriesEntry } from '@/lib/series'
import { markSeenTorrent, readDefaultAmount, readFeature, readNewSince, resolveAmount, useFeature } from '@/lib/settings'
import { useRatioGuard, worthNoting, type RatioGuard, type RatioLevel } from '@/lib/ratio-protect'
import { cn } from '@/lib/utils'
import { AmountPicker } from '@/components/amount-picker'
import { Book, Book3D, BookAmbilight } from '@/components/book'
import { RatioFloorInput } from '@/components/ratio-floor'
import { TagLinks } from '@/components/tag-links'
import { TorLinks, useReadingSnippet } from '@/components/tor-links'
import { WedgeDetailButton } from '@/components/wedge-download'
import { AnimatedGroup } from '@/components/ui/animated-group'
import { AnimatedNumber } from '@/components/ui/animated-number'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { AppleCardsCarousel } from '@/components/ui/apple-cards-carousel'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ProgressiveBlur } from '@/components/ui/progressive-blur'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { TextEffect } from '@/components/ui/text-effect'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { useLiveBonus } from '@/lib/bonus'
import { postComment } from '@/lib/comment-send'
import { mamFetch } from '@/lib/mam-fetch'

// The statline counts up over the same beat as the words arrive.
const STAT_COUNT_SPRING = { bounce: 0, duration: 900 }

// Shortcuts in the thanks panel: nothing, a token amount, then the two rounder
// figures people reach for. The slider covers everything else.
const THANK_PRESETS = [0, 50, 100, 500]

// A posted comment takes the browser off this page. Past this, it did not.
const SUBMIT_GIVE_UP_MS = 15_000

/** A stat figure that starts at zero on the first paint and counts up. */
function CountUp({ value }: { value: number }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(value))
    return () => cancelAnimationFrame(id)
  }, [value])
  if (reduced) return <>{fmtInt(value)}</>
  return <AnimatedNumber value={shown} springOptions={STAT_COUNT_SPRING} />
}

/** One statline figure: serif number over a small-caps label. A count rolls
 * in from zero; any other value stands still. */
function Stat({ label, value, count, title }: { label: string; value: string; count?: number; title?: string }) {
  return (
    <div>
      <b className="block font-display text-[17px] font-semibold tabular-nums" title={title}>
        {count != null ? <CountUp value={count} /> : value}
      </b>
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
/** One line of the spec list: label in its own column so every value starts at
 * the same place. A block value (buttons, chips) drops below the label. */
function KV({ label, full = false, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn('py-2.5', !full && 'grid grid-cols-[88px_minmax(0,1fr)] gap-3')}>
      <dt className={cn('text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground', full ? 'mb-1.5' : 'pt-[3px]')}>
        {label}
      </dt>
      <dd className="min-w-0 text-[13px] leading-relaxed">{children}</dd>
    </div>
  )
}

// Both footer entries run through Button, one as a button and one as a link, so
// the size variant cannot indent one of them past the other.
const FOOTER_LINK =
  'h-auto gap-2 p-0 text-[12.5px] font-normal text-muted-foreground no-underline hover:text-brand has-[>svg]:px-0'

/** Click a control in the hidden legacy DOM; MAM's own handler takes it from
 * there. The boolean says whether the control was found. */
function proxyClick(sel: string, fail: string): boolean {
  const el = document.querySelector<HTMLElement>(sel)
  if (el) {
    el.click()
    return true
  }
  toast.error(fail)
  return false
}

// The text color carries the level; it only turns loud when action is needed.
const RATIO_NOTE_TONE: Record<RatioLevel, string> = {
  none: 'text-muted-foreground',
  notice: 'text-foreground',
  warn: 'font-medium text-warn',
  block: 'font-medium text-destructive',
}

/** On/off switch and minimum ratio for the guard, kept in localStorage. */
function GuardSettings({ guard }: { guard: RatioGuard }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Ratio protection settings"
          title="Ratio protection settings"
          className="ml-0.5 size-6 align-[-4px] hover:text-brand"
        >
          <Settings2 className="size-3.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-[13px]">
        <label className="flex items-center justify-between gap-3 text-[12px] font-semibold">
          Ratio protection
          <Switch checked={guard.enabled} onCheckedChange={guard.setEnabled} />
        </label>
        <p className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
          Switched off, the note still shows but nothing locks.
        </p>
        <label className="mb-1.5 mt-3 block text-[12px] font-semibold" htmlFor="ratio-floor">Minimum ratio</label>
        <RatioFloorInput
          id="ratio-floor"
          align="start"
          className="w-full"
          disabled={!guard.enabled}
          aria-describedby="ratio-floor-note"
        />
        <p id="ratio-floor-note" className="mt-2 text-[12px] leading-snug text-muted-foreground">
          A download landing under this number locks. Clear the field to never lock.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** What one click costs, as a footnote under the buttons. Appears once the
 * totals arrive. */
function RatioNote({ guard }: { guard: RatioGuard }) {
  const { current, next, level } = guard.impact
  if (!worthNoting(guard.impact)) return null
  const min = guard.floor?.toLocaleString('en-US')
  // Round down, so a value a hair above the minimum never prints as the
  // minimum itself while the button sits locked next to it.
  const becomes = <b className="tabular-nums">{fmtRatio(Math.floor(next * 100) / 100)}</b>
  return (
    <p className={cn('mt-2 text-[12px] leading-snug', RATIO_NOTE_TONE[level])}>
      {current == null ? (
        <>First download: your ratio would start at {becomes}.</>
      ) : level === 'block' ? (
        <>Your ratio would become {becomes}, under your minimum of {min}. Use a wedge or change the minimum.</>
      ) : level === 'warn' ? (
        <>Your ratio would become {becomes}, close to your minimum of {min}.</>
      ) : (
        <>Your ratio would become {becomes} <span className="tabular-nums">(now {fmtRatio(current)})</span>.</>
      )}
      <GuardSettings guard={guard} />
    </p>
  )
}

type ButtonSize = ComponentProps<typeof Button>['size']

/** Where the plain download goes; null when the page offers none. */
function downloadHref(data: TorrentDetail): string | null {
  return data.downloadHref ?? (data.id ? `/tor/download.php?tid=${data.id}` : null)
}

/** The plain download for the current guard level: locked, blocked or live. */
function DownloadButton({ data, level, size }: { data: TorrentDetail; level: RatioLevel; size?: ButtonSize }) {
  const href = downloadHref(data)
  if (data.downloadBlocked) return <Button size={size} disabled><Download /> Download blocked</Button>
  if (!href) return null
  if (level === 'block') return <Button size={size} disabled variant="outline"><Lock /> Download</Button>
  return (
    <Button size={size} asChild>
      <a href={href}><Download /> Download</a>
    </Button>
  )
}

/** The wedge route, when the torrent still costs ratio. */
function WedgeAction({ data, spent, onSpent, size }: { data: TorrentDetail; spent: boolean; onSpent: () => void; size?: ButtonSize }) {
  const freeCost = data.freeleech || data.personalFreeleech || data.vip
  const buyFl = data.ratio?.buttons.find((b) => b.name === 'personalFL')
  if (freeCost || !!data.downloadBlocked || spent || !downloadHref(data)) return null
  if (data.id != null) {
    return (
      <WedgeDetailButton
        target={{ id: data.id, title: data.title, size: data.size, href: downloadHref(data) }}
        size={size}
        onDone={onSpent}
      />
    )
  }
  if (!buyFl) return null
  return (
    <Button
      variant="outline"
      size={size}
      title="Spends one FL wedge"
      onClick={() => proxyClick(`input[data-freetor="${buyFl.torId}"][name="personalFL"]`, 'Buying freeleech is not available right now.')}
    >
      <Gift /> {buyFl.label}
    </Button>
  )
}

/** Download row with the ratio guard: freeleech, VIP and seeding torrents pass
 * untouched; a blocking ratio hit swaps the plain download for the FL routes.
 * The row ref lets the sticky strip know when the buttons scroll away. */
function DownloadDock({
  data, guard, spent, onSpent, rowRef, buyButtons,
}: {
  data: TorrentDetail
  guard: RatioGuard | null
  spent: boolean
  onSpent: () => void
  rowRef: RefObject<HTMLDivElement | null>
  buyButtons: NonNullable<TorrentDetail['ratio']>['buttons']
}) {
  const level = guard?.impact.level ?? 'none'
  return (
    <>
      <div ref={rowRef} className="mt-5 flex flex-wrap items-center gap-2.5">
        <DownloadButton data={data} level={level} />
        <WedgeAction data={data} spent={spent} onSpent={onSpent} />
        <BookmarkButton />
        <MoreActions data={data} buyButtons={buyButtons} />
      </div>
      {guard && !data.downloadBlocked && <RatioNote guard={guard} />}
      {data.downloadBlocked && (
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">{data.downloadBlocked}</p>
      )}
      {spent && (
        <p className="mt-2 text-[12px] leading-snug text-ok">This torrent is a personal freeleech now, so downloading it costs you nothing.</p>
      )}
    </>
  )
}

/** The rarer routes for this torrent, behind one trigger so the download row
 * keeps a single primary action: the freeleech purchases MAM keeps as buttons,
 * plus the two copy helpers. */
function MoreActions({
  data, buyButtons,
}: {
  data: TorrentDetail
  buyButtons: NonNullable<TorrentDetail['ratio']>['buttons']
}) {
  const copySnippet = useReadingSnippet(data)
  if (!copySnippet && !data.clone && buyButtons.length === 0) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions for this torrent">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {buyButtons.map((b) => (
          <DropdownMenuItem
            key={b.name ?? b.label}
            onClick={() =>
              proxyClick(
                `input[data-freetor="${b.torId}"]${b.name ? `[name="${b.name}"]` : ''}`,
                'This freeleech option is not available.',
              )
            }
          >
            <Gift /> {b.label}
          </DropdownMenuItem>
        ))}
        {copySnippet && (
          <DropdownMenuItem onClick={copySnippet}><Quote /> Quote for forum</DropdownMenuItem>
        )}
        {data.clone && (
          <DropdownMenuItem asChild>
            <a href={data.clone}><Copy /> Copy to upload form</a>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// The topbar the strip has to clear; it is h-14 before it condenses.
const TOPBAR_HEIGHT_PX = 56
// The watch root reaches this far below the viewport, so only a button row
// that scrolled up past the topbar counts as gone. One still below the fold
// on a narrow screen does not.
const WATCH_BELOW_PX = 100000
// Hidden means gone for the keyboard and the pointer too, not only faded.
const MINI_HERO_STATES: Variants = {
  hidden: { opacity: 0, y: -8, transition: { duration: 0.2 }, transitionEnd: { visibility: 'hidden' } },
  visible: { opacity: 1, y: 0, visibility: 'visible', transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } },
}

/** The hero condensed to one strip: cover, title and the download routes. It
 * sticks under the topbar once the button row scrolls up past it. On lg it
 * stops where the sticky details card begins; below sm one action fits. */
function MiniHero({
  data, guard, spent, onSpent, watch,
}: {
  data: TorrentDetail
  guard: RatioGuard | null
  spent: boolean
  onSpent: () => void
  watch: RefObject<HTMLElement | null>
}) {
  const dockInView = useInView(watch, { margin: `-${TOPBAR_HEIGHT_PX}px 0px ${WATCH_BELOW_PX}px 0px`, initial: true })
  const level = guard?.impact.level ?? 'none'
  const shape = coverShape({ mediatype: mediaTypeFromHref(data.catIconHref) })
  const download = <DownloadButton data={data} level={level} size="sm" />
  const wedge = <WedgeAction data={data} spent={spent} onSpent={onSpent} size="sm" />
  // Nothing to keep at hand when the account cannot download this at all.
  if (data.downloadBlocked || !downloadHref(data)) return null
  return (
    <div className="sticky top-12 z-10 h-0 lg:mr-[340px]">
      <motion.div
        initial={false}
        animate={dockInView ? 'hidden' : 'visible'}
        variants={MINI_HERO_STATES}
        inert={dockInView}
        className="pt-3"
      >
        <Card className="flex-row items-center gap-3 px-3 py-2 shadow-card">
          <span className="shrink-0 text-[6px]">
            <Book poster={data.poster} title={data.title ?? ''} shape={shape} frame="square" frameClassName="size-8" plain size="row" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-display text-[15px] font-semibold leading-tight">{data.title}</span>
            {data.authors.length > 0 && (
              <span className="hidden truncate text-[12px] text-muted-foreground sm:block">
                by {data.authors.map((a) => a.name).join(', ')}
              </span>
            )}
          </span>
          <span className="flex shrink-0 items-center sm:hidden">{level === 'block' ? wedge : download}</span>
          <span className="hidden shrink-0 items-center gap-2 sm:flex">
            {download}
            {wedge}
          </span>
        </Card>
      </motion.div>
    </div>
  )
}

/** State-aware bookmark toggle. MAM's own control names the state plus the
 * torrent id (torBookmark{id} to add, torDeBookmark{id} to remove); the change
 * itself goes to the JSON endpoint, since MAM's remove link asks a question
 * whose sentence names a torrent it can only find inside a result row. */
function BookmarkButton() {
  const control = document.querySelector<HTMLElement>('[id^="torDeBookmark"],[id^="torBookmark"]')
  const tid = Number(control?.id.replace(/^tor(?:De)?Bookmark/, '')) || null
  const [bookmarked, setBookmarked] = useState(() => !!document.querySelector('[id^="torDeBookmark"]'))
  const [busy, setBusy] = useState(false)
  if (tid == null) return null

  async function toggle() {
    if (tid == null) return
    const adding = !bookmarked
    setBusy(true)
    try {
      await bookmarkOne(tid, adding ? 'add' : 'delete')
      setBookmarked(adding)
      // MAM renames its own control on every change. That name is what this
      // button reads when it mounts, so it has to keep telling the truth.
      if (control) control.id = `${adding ? 'torDeBookmark' : 'torBookmark'}${tid}`
      if (adding) toast.success('Bookmarked', { description: 'Find it under My library > Bookmarks.' })
      else toast.success('Bookmark removed')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'That did not go through.')
    } finally {
      setBusy(false)
    }
  }

  return bookmarked ? (
    <Button variant="outline" disabled={busy} onClick={() => void toggle()} className="text-brand">
      <BookmarkCheck /> Bookmarked
    </Button>
  ) : (
    <Button variant="outline" disabled={busy} onClick={() => void toggle()}>
      <Bookmark /> Bookmark
    </Button>
  )
}

/** Thanking sits with the uploader's name, where MAM puts it too. The amount
 * rides on the button, so nobody hands over points by reflex. An uploader who
 * takes none gets the same panel without the picker. */
function ThankUploader({
  thanks, name, balance,
}: {
  thanks: NonNullable<TorrentDetail['thanks']>
  name: string
  balance: number | null
}) {
  const step = thanks.points?.step ?? THANK_STEP
  // Whole steps only, never more than the balance covers. The store refuses
  // both of those, at the cost of a round trip.
  const ceiling = thanks.points
    ? balance != null
      ? Math.min(thanks.points.max, Math.floor(balance / step) * step)
      : thanks.points.max
    : 0
  const capped = thanks.points != null && balance != null && ceiling < thanks.points.max

  const [picked, setAmount] = useState(() => {
    const preset = resolveAmount(readDefaultAmount('thank'), 0, ceiling)
    return preset != null ? Math.floor(preset / step) * step : 0
  })
  // The balance moves under this panel whenever something else on the page
  // spends, so the amount follows the ceiling down rather than being refused
  // by the store on send.
  const amount = Math.min(picked, ceiling)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  async function send() {
    if (busy) return
    setBusy(true)
    try {
      await thankUploader(thanks.tid, amount)
      setDone(true)
      setOpen(false)
      toast.success(amount > 0 ? `Sent ${fmtInt(amount)} points to ${name}` : `Thanked ${name}`)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Thanking the uploader failed.')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ok">
        <Heart className="size-3.5 fill-current" /> Thanked
      </span>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* p-0 leaves the size variant's has-[>svg] padding in place, so that
            one is reset alongside it. */}
        <Button variant="link" className="h-auto gap-1.5 p-0 text-[12px] text-brand has-[>svg]:px-0">
          <Heart className="size-3.5" /> Thank
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <p className="text-[13px] font-semibold">Thank {name}</p>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          {ceiling > 0
            ? 'Points come out of your balance. None is fine too.'
            : thanks.points
              ? 'You have no points to send along, so this goes out as a plain thank you.'
              : 'This uploader takes thanks but no points.'}
        </p>
        {ceiling > 0 && (
          <AmountPicker
            className="mt-3"
            label="Points to send"
            value={amount}
            onChange={setAmount}
            max={ceiling}
            step={step}
            presets={THANK_PRESETS}
            note={capped ? 'your balance' : undefined}
          />
        )}
        <Button className="mt-4 w-full" onClick={send} disabled={busy}>
          {busy ? <Spinner className="size-3.5" /> : <Heart />}
          {amount > 0 ? `Send ${fmtInt(amount)} points` : 'Say thanks'}
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/** Writing a comment stays on the page MAM sends you away from. The text goes
 * out through MAM's own form, so a plain textarea matches what that page
 * offers: it loads no editor of its own. */
function CommentComposer({ tid, fallbackHref }: { tid: number; fallbackHref: string }) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const fieldId = useId()
  const stuck = useRef(0)
  useEffect(() => () => window.clearTimeout(stuck.current), [])

  async function post() {
    const body = text.trim()
    if (!body || busy) return
    setBusy(true)
    const result = await postComment(tid, body)
    if (result.ok) {
      // The browser leaves this page from here. If it has not by now, something
      // held the submit back, so the controls come back rather than spin on.
      stuck.current = window.setTimeout(() => setBusy(false), SUBMIT_GIVE_UP_MS)
      return
    }
    setBusy(false)
    toast.error('Posting the comment did not go through.', {
      description: 'The comment page still takes it.',
      action: { label: 'Open it', onClick: () => location.assign(fallbackHref) },
    })
  }

  return (
    <div className="grid gap-2.5 border-t pt-5">
      <label htmlFor={fieldId} className="text-[13px] font-semibold">Leave a comment</label>
      <Textarea
        id={fieldId}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="A word of thanks, what you thought of it, a note for the next reader…"
        className="min-h-24"
      />
      <div className="flex flex-wrap items-center justify-end gap-3">
        <p className="mr-auto text-[11.5px] text-muted-foreground">
          Thanks, opinions plus recommendations. A reseed has its own request in the details.
        </p>
        <Button onClick={post} disabled={!text.trim() || busy}>
          {busy ? <Spinner className="size-3.5" /> : <MessageSquarePlus />}
          Post comment
        </Button>
      </div>
    </div>
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
          <span className="ml-auto text-[11px] text-muted-foreground" title={utcTitle(c.at)}>{relTime(c.at)}</span>
        </div>
        <RichHtml html={c.bodyHtml} className="mt-1 text-[13.5px]" />
      </div>
    </div>
  )
}

// Above this many rows a section gets its own scroll box, the way MAM caps its
// own chapter list.
const MEDIA_LONG_SECTION = 12

/** A run of numbered entries is a chapter list, not a set of fields. */
function isNumbered(nodes: MediaNode[]): boolean {
  return nodes.length > 1 && nodes.every((n) => /^\d+$/.test(n.label.trim()))
}

/** Key and value in one shared grid, so every value starts in the same column
 * whichever section it belongs to. */
function MediaInfoRows({ nodes }: { nodes: MediaNode[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[12.5px] leading-relaxed sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]">
      {nodes.map((n, i) => (
        <Fragment key={n.label + i}>
          <dt className="text-muted-foreground">{mediaInfoLabel(n.label)}</dt>
          <dd className="font-mono tabular-nums [overflow-wrap:anywhere]">{n.value}</dd>
        </Fragment>
      ))}
    </dl>
  )
}

function ChapterList({ nodes }: { nodes: MediaNode[] }) {
  return (
    <ol className="grid grid-cols-1 gap-1 text-[12.5px] leading-relaxed">
      {nodes.map((n, i) => (
        <li key={n.label + i} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-3">
          <span className="text-right font-mono tabular-nums text-muted-foreground">{n.label}</span>
          <span>{n.value}</span>
        </li>
      ))}
    </ol>
  )
}

function MediaInfoSection({ node, parent }: { node: MediaNode; parent: string | null }) {
  // A section holding nothing but one named section is a wrapper, so its own
  // heading says nothing the inner one does not.
  const only = node.children.length === 1 && node.children[0].children.length > 0 ? node.children[0] : null
  if (only) return <MediaInfoSection node={only} parent={node.label} />
  const long = node.children.length > MEDIA_LONG_SECTION
  return (
    <section>
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
        {mediaInfoGroupLabel(node.label, parent)}
      </h3>
      <div className={cn('mt-2', long && 'max-h-64 overflow-y-auto rounded-lg bg-muted/40 p-3')}>
        <MediaInfoBody nodes={node.children} parent={node.label} />
      </div>
    </section>
  )
}

/** MAM's MediaInfo tree: named sections holding key/value pairs. */
function MediaInfoBody({ nodes, parent }: { nodes: MediaNode[]; parent: string | null }) {
  const leaves = nodes.filter((n) => n.children.length === 0)
  const sections = nodes.filter((n) => n.children.length > 0)
  return (
    <div className="grid grid-cols-1 gap-5">
      {leaves.length > 0 && (isNumbered(leaves) ? <ChapterList nodes={leaves} /> : <MediaInfoRows nodes={leaves} />)}
      {sections.map((s, i) => <MediaInfoSection key={s.label + i} node={s} parent={parent} />)}
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

interface Remote<T> {
  loading: boolean
  data: T | null
  error: boolean
  load: () => void
}

/** Fetch a same-origin fragment (file list, peers) once and parse it into our
 * own shape. When the fetch fails the fallback loader gets a try first. */
function useRemoteData<T>(url: string | null, parse: (doc: Document) => T, fallback?: () => Promise<string>): Remote<T> {
  const [s, setS] = useState<{ loading: boolean; data: T | null; error: boolean }>({ loading: false, data: null, error: false })
  const started = useRef(false)

  // A parse that does not know what came back throws, so a served error page
  // reaches the error state instead of rendering as rows.
  function apply(text: string) {
    setS({ loading: false, data: parse(new DOMParser().parseFromString(text, 'text/html')), error: false })
  }

  function load() {
    if (!url || started.current) return
    started.current = true
    setS({ loading: true, data: null, error: false })
    mamFetch(url, { credentials: 'include' })
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
          started.current = false
          setS({ loading: false, data: null, error: true })
        }
      })
  }
  return { ...s, load }
}

/** Loading and failure sit in the same spot for every panel. Both announce
 * themselves because the content arrives after the tab is already open. */
function PanelStatus({ state, url }: { state: Remote<unknown>; url: string }) {
  if (state.loading) {
    return (
      <p role="status" className="flex items-center gap-2 py-3 text-[13px] text-muted-foreground">
        <Spinner className="size-4" /> Loading…
      </p>
    )
  }
  if (state.error) {
    return (
      <p role="status" className="py-3 text-[13px] text-muted-foreground">
        Could not load this.{' '}
        <Button variant="link" className="h-auto p-0 text-brand" onClick={state.load}>Try again</Button>
        {' '}or <a className="text-brand underline" href={url}>open it directly</a>.
      </p>
    )
  }
  return null
}

// Rows and headings line up with the card gutter, so the table has none of its
// own horizontal padding on the outer columns.
const CELL = 'px-2 first:pl-0 last:pr-0'
const HEAD = `${CELL} h-8 text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground`

const COPIED_FLASH_MS = 2000

/** The info hash, in full and ready to paste into a client. */
function InfoHash({ hash }: { hash: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<number | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(hash)
      setCopied(true)
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => setCopied(false), COPIED_FLASH_MS)
    } catch {
      toast.error('Copying did not go through.')
    }
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      aria-label="Copy the info hash"
      className="h-8 gap-2 px-2 text-[12px] font-normal text-muted-foreground hover:text-foreground"
      onClick={copy}
    >
      {copied ? <Check className="text-ok" /> : <Copy />}
      Info hash
      <span className="max-w-[18ch] truncate font-mono sm:max-w-none">{hash}</span>
    </Button>
  )
}

interface FileFolder {
  path: string
  files: TorrentFile[]
}

/** Keep the torrent's own file order and start a new block per folder. */
function groupFiles(files: TorrentFile[]): FileFolder[] {
  const out: FileFolder[] = []
  for (const file of files) {
    const last = out[out.length - 1]
    if (last && last.path === file.path) last.files.push(file)
    else out.push({ path: file.path, files: [file] })
  }
  return out
}

function FilesPanel({ state, url }: { state: Remote<FileListData>; url: string }) {
  if (!state.data) return <PanelStatus state={state} url={url} />
  const { hash, name, files } = state.data
  if (files.length === 0) {
    return <p className="text-[13px] text-muted-foreground">This torrent lists no files.</p>
  }
  // One file carrying the torrent's own name lands loose. Anything else arrives
  // inside a folder of that name, which the rows themselves never show.
  const folder = name != null && (files.length > 1 || name !== files[0].name) ? name : null
  return (
    <div className="grid grid-cols-1 gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-muted-foreground">
          {plural(files.length, 'file')}
          {name != null && (folder
            ? <> · in folder <span className="font-mono [overflow-wrap:anywhere]">{folder}</span></>
            : <> · no folder around it</>)}
        </p>
        {hash && <InfoHash hash={hash} />}
      </div>
      <Table className="text-[12.5px]">
        <TableHeader>
          <TableRow>
            <TableHead scope="col" className={HEAD}>Filename</TableHead>
            <TableHead scope="col" className={cn(HEAD, 'text-right')}>Size</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groupFiles(files).map((folder, fi) => (
            <Fragment key={folder.path + fi}>
              {folder.path && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={2} className={cn(CELL, 'pt-3 text-[11.5px] font-medium text-muted-foreground')}>
                    {folder.path}
                  </TableCell>
                </TableRow>
              )}
              {folder.files.map((f, i) => (
                <TableRow key={f.name + i}>
                  <TableCell className={cn(CELL, 'whitespace-normal [overflow-wrap:anywhere]')}>{f.name}</TableCell>
                  <TableCell className={cn(CELL, 'text-right font-mono text-muted-foreground')}>{f.size}</TableCell>
                </TableRow>
              ))}
            </Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** A shape rather than a color alone, plus MAM's own word for a screen reader.
 * Not connectable and offline are different states, so they read differently. */
function Connectable({ row }: { row: PeerRow }) {
  if (row.reach == null) return <span className="text-muted-foreground">–</span>
  const yes = row.reach === 'connectable'
  const label = row.reachLabel ?? (yes ? 'Connectable' : row.reach === 'offline' ? 'Offline' : 'Not connectable')
  return (
    <span className="inline-flex items-center" title={label}>
      {yes
        ? <Check className="size-3.5 text-ok" />
        : row.reach === 'offline'
          ? <CircleSlash className="size-3.5 text-muted-foreground" />
          : <Minus className="size-3.5 text-muted-foreground" />}
      <span className="sr-only">{label}</span>
    </span>
  )
}

// Durations vary in width, so they hang off their right edge and the seconds
// line up down the column.
const HEAD_TIME = `${HEAD} text-right`
const CELL_TIME = `${CELL} text-right font-mono text-muted-foreground`

function PeerTable({ rows }: { rows: PeerRow[] }) {
  return (
    <Table className="text-[12.5px]">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className={HEAD}>Client</TableHead>
          <TableHead scope="col" className={HEAD}>Connectable</TableHead>
          <TableHead scope="col" className={HEAD_TIME}>Connected</TableHead>
          <TableHead scope="col" className={HEAD_TIME}>Last announce</TableHead>
          <TableHead scope="col" className={HEAD_TIME}>Next announce</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((p, i) => (
          <TableRow key={p.client + i}>
            <TableCell className={cn(CELL, 'font-medium')}>{p.client}</TableCell>
            <TableCell className={CELL}><Connectable row={p} /></TableCell>
            <TableCell className={CELL_TIME} title={p.connectedAt ? utcTitle(p.connectedAt) : undefined}>
              {p.connectedFor}
            </TableCell>
            <TableCell className={CELL_TIME} title={p.lastAnnounceAt ? utcTitle(p.lastAnnounceAt) : undefined}>
              {p.lastAnnounce}
            </TableCell>
            <TableCell className={CELL_TIME}>{p.nextAnnounce}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function PeerSection({ title, rows, empty }: { title: string; rows: PeerRow[]; empty: string }) {
  return (
    <section>
      <h3 className="flex items-baseline gap-2 text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
        {title}
        <span className="font-mono text-[11px] tabular-nums tracking-normal">{fmtInt(rows.length)}</span>
      </h3>
      {rows.length > 0
        ? <PeerTable rows={rows} />
        : <p className="mt-1.5 text-[12.5px] text-muted-foreground">{empty}</p>}
    </section>
  )
}

function PeersPanel({ state, url }: { state: Remote<PeerData>; url: string }) {
  if (!state.data) return <PanelStatus state={state} url={url} />
  return (
    <div className="grid grid-cols-1 gap-5">
      <PeerSection title="Seeding" rows={state.data.seeding} empty="Nobody is seeding this torrent right now." />
      <PeerSection title="Leeching" rows={state.data.leeching} empty="Nobody is downloading this torrent right now." />
    </div>
  )
}

function MediaPanel({ data }: { data: TorrentDetail }) {
  if (data.mediaInfo.length === 0) {
    return (
      <div
        className="legacy-html text-[12.5px] leading-relaxed"
        dangerouslySetInnerHTML={{ __html: data.mediaInfoHtml ?? '' }}
      />
    )
  }
  return (
    <div className="grid grid-cols-1 gap-5">
      <MediaInfoBody nodes={data.mediaInfo} parent={null} />
      {data.mediaInfoFullHref && (
        <a href={data.mediaInfoFullHref} className="w-fit text-[12px] text-brand hover:underline">
          View the full media info
        </a>
      )}
    </div>
  )
}

const countOf = (raw: string | null) => {
  const n = Number((raw ?? '').replace(/,/g, ''))
  return Number.isFinite(n) ? n : 0
}

/** What is inside the torrent, in one card. The counts sit on the tabs so the
 * reader knows what a tab holds before opening it. Each fetch waits until its
 * own tab is shown. */
function TorrentPanels({ data }: { data: TorrentDetail }) {
  const filesUrl = data.hasFilelist && data.id != null ? `/tor/filelist.php?torrentid=${data.id}` : null
  const peersUrl = data.hasPeers && data.id != null ? `/tor/peers.php?simple=true&torrentid=${data.id}` : null
  const files = useRemoteData(filesUrl, parseFileList, () =>
    legacyFragment(() => (window as unknown as { fileListToggle?: (id: number) => void }).fileListToggle?.(data.id!), '#filesDisplay')
  )
  const peers = useRemoteData(peersUrl, parsePeers, () =>
    legacyFragment(() => (window as unknown as { togglePeersList?: (id: number) => void }).togglePeersList?.(data.id!), '#peersDisplay')
  )

  const tabs: { value: string; label: string; count: number | null }[] = []
  if (data.mediaInfo.length > 0 || data.mediaInfoHtml) tabs.push({ value: 'media', label: 'Media info', count: null })
  if (filesUrl) tabs.push({ value: 'files', label: 'Files', count: countOf(data.files.count) || null })
  if (peersUrl) tabs.push({ value: 'peers', label: 'Peers', count: countOf(data.seeders) + countOf(data.leechers) })

  const [tab, setTab] = useState(() => tabs[0]?.value ?? 'media')
  useEffect(() => {
    if (tab === 'files') files.load()
    if (tab === 'peers') peers.load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab])

  if (tabs.length === 0) return null

  const body = (value: string) =>
    value === 'media' ? <MediaPanel data={data} />
      : value === 'files' ? <FilesPanel state={files} url={filesUrl ?? ''} />
        : <PeersPanel state={peers} url={peersUrl ?? ''} />

  if (tabs.length === 1) {
    return (
      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5"><CardTitle>{tabs[0].label}</CardTitle></CardHeader>
        <CardContent className="px-6 pb-5">{body(tabs[0].value)}</CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-0 py-0">
      <Tabs value={tab} onValueChange={setTab} className="gap-0">
        {/* The line marker hangs below the list, so the strip reserves that
            space and the marker lands on the divider. */}
        <div className="border-b px-6 pt-3 pb-[5px]">
          <TabsList variant="line" className="gap-5 p-0">
            {tabs.map((t) => (
              <TabsTrigger key={t.value} value={t.value} className="flex-none px-0 text-[13px]">
                {t.label}
                {t.count != null && (
                  <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtInt(t.count)}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map((t) => (
          <TabsContent key={t.value} value={t.value} className="px-6 py-5">{body(t.value)}</TabsContent>
        ))}
      </Tabs>
    </Card>
  )
}

interface StripEntry {
  id: number
  href: string
  title: string
  poster: string | null
  part: string | null
  weight: number
  shape: CoverShape
  current: boolean
}

/** A strip row with no entry for this series sorts after every numbered one. */
const STRIP_NO_ENTRY_WEIGHT = Number.POSITIVE_INFINITY

/** MAM's weight is the first number of the part; derive it where a row only
 * names the part as text. */
function partWeight(part: string | null | undefined): number {
  const n = Number.parseFloat(part ?? '')
  return Number.isNaN(n) ? STRIP_NO_ENTRY_WEIGHT : n
}

// A cover slot plus the gap after it, so one press of an arrow lands on a cover
// edge instead of halfway through one.
const SERIES_COVER_PITCH_PX = 108
const SERIES_STEP_PX = SERIES_COVER_PITCH_PX * 3
// Faster than the carousel's own default: these covers are small and there can
// be nine of them, so the shelf should be readable well before then.
const SERIES_STAGGER_SECONDS = 0.05

/** Mini shelf of the other books in the first series, fetched via the search
 * API. Hidden while loading, on fetch errors and when this book is alone. */
function SeriesStrip({ data }: { data: TorrentDetail }) {
  const series = data.series[0]
  const [items, setItems] = useState<StripEntry[] | null>(null)
  const heroShape = coverShape({ mediatype: mediaTypeFromHref(data.catIconHref) })
  // The series link carries the id, which beats matching on a name two series
  // can share.
  const seriesId = Number(/[?&]series=(\d+)/.exec(series.href)?.[1]) || null

  useEffect(() => {
    let live = true
    const query = seriesId != null
      ? { seriesID: seriesId, perpage: 8 }
      : { text: series.name, srchIn: ['series' as const], perpage: 8 }
    searchTorrents(query)
      .then((res) => {
        if (!live) return
        const wanted = series.name.trim().toLowerCase()
        const found: StripEntry[] = []
        for (const t of res.data) {
          const entry = seriesId != null
            ? seriesEntry(t, seriesId)
            : (() => {
                const hit = parsePeople(t.series_info).find((s) => s.name.trim().toLowerCase() === wanted)
                return hit ? { name: hit.name, part: hit.part ?? '', weight: partWeight(hit.part) } : null
              })()
          if (!entry) continue
          found.push({
            id: t.id,
            href: torrentUrl(t.id),
            title: t.title,
            poster: t.poster_type ? coverUrl(t.id, t.poster_type) : null,
            part: entry.part || null,
            // MAM flags an unnumbered row as -1; in the strip those trail the
            // numbered parts, matching the browse grouping.
            weight: entry.weight < 0 ? STRIP_NO_ENTRY_WEIGHT : entry.weight,
            shape: coverShape({ mediatype: t.mediatype, mainCat: t.main_cat }),
            current: t.id === data.id,
          })
        }
        if (data.id && !found.some((f) => f.current)) {
          found.push({
            id: data.id,
            href: torrentUrl(data.id),
            title: data.title ?? '',
            poster: data.poster,
            part: series.part,
            weight: partWeight(series.part),
            shape: heroShape,
            current: true,
          })
        }
        found.sort((a, b) => a.weight - b.weight)
        setItems(found)
      })
      .catch(() => {
        if (live) setItems([])
      })
    return () => {
      live = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        <AppleCardsCarousel
          step={SERIES_STEP_PX}
          stagger={SERIES_STAGGER_SECONDS}
          prevLabel="Earlier books in this series"
          nextLabel="Later books in this series"
          viewportClassName="items-end pb-1"
          rowClassName="items-end gap-5"
          itemClassName="shrink-0"
          arrowsClassName="mt-3"
          items={items.map((it) => (
            <a key={it.id} href={it.href} title={it.title} className="group block w-[88px] text-[10px]">
              <span className="block transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 motion-reduce:transition-none">
                <Book
                  poster={it.poster}
                  title={it.title}
                  shape={it.shape}
                  plain
                  size="mini"
                  className={cn('group-hover:shadow-book-lift', it.current && 'ring-2 ring-brand/60')}
                />
              </span>
              {/* Every label takes one line of the same height, named or not, so
                  all the covers rest on one floor. */}
              <span className={cn('mt-2 block h-4 font-mono text-[11px] leading-4 whitespace-nowrap tabular-nums', it.current ? 'font-semibold text-brand' : 'text-muted-foreground')}>
                {it.part && `#${it.part}`}
                {it.current && (it.part ? ' · this book' : 'this book')}
              </span>
            </a>
          ))}
        />
      </CardContent>
    </Card>
  )
}


// A title search returns plenty of noise, so fetch wide and show a short list.
const EDITIONS_FETCH_MAX = 25
const EDITIONS_SHOWN_MAX = 10

/** Other torrents of the same book: same title, overlapping author. Renders
 * nothing while loading, on errors and when this is the only edition. */
function EditionsStrip({ data }: { data: TorrentDetail }) {
  const [enabled] = useFeature('otherEditions')
  const [items, setItems] = useState<SearchTorrent[] | null>(null)
  const title = data.title

  useEffect(() => {
    if (!enabled || !title) return
    let live = true
    searchTorrents({ text: title, srchIn: ['title'], perpage: EDITIONS_FETCH_MAX })
      .then((res) => {
        if (!live) return
        // Series share titles across books, so an author must match too.
        const own = data.authors.map((a) => a.name.trim().toLowerCase())
        setItems(
          res.data.filter((t) => {
            if (t.id === data.id) return false
            if (own.length === 0) return true
            return parsePeople(t.author_info).some((p) => own.includes(p.name.trim().toLowerCase()))
          })
        )
      })
      .catch(() => {
        if (live) setItems([])
      })
    return () => {
      live = false
    }
  }, [enabled, title, data])

  if (!enabled || !title || !items || items.length === 0) return null
  const shown = items.slice(0, EDITIONS_SHOWN_MAX)
  const browseHref = `/tor/browse.php?tor[text]=${encodeURIComponent(title)}&tor[srchIn][title]=true`

  return (
    <BlurFade direction="up" offset={8}>
      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle>Other editions</CardTitle>
          <CardAction>
            <a href={browseHref} className="text-[12px] text-brand hover:underline">See all</a>
          </CardAction>
        </CardHeader>
        <CardContent className="px-0 py-1">
          <div className="divide-y divide-border">
            {shown.map((t) => {
              const authors = parsePeople(t.author_info)
              return (
                <a
                  key={t.id}
                  href={torrentUrl(t.id)}
                  className="group grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3.5 px-6 py-2.5 transition-colors hover:bg-foreground/[0.028]"
                >
                  <span className="text-[7px]">
                    <Book poster={t.poster_type ? coverUrl(t.id, t.poster_type) : null} title={t.title} shape={coverShape({ mediatype: t.mediatype, mainCat: t.main_cat })} size="row" plain />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium leading-snug transition-colors group-hover:text-brand">
                      {t.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-1">
                      {t.filetype && (
                        <Badge variant="outline" className="font-mono text-[10px] uppercase">{t.filetype.split(' ')[0]}</Badge>
                      )}
                      {t.catname && <Badge variant="outline" className="text-[10.5px]">{t.catname}</Badge>}
                      {t.vip === 1 && <Badge className="bg-brand-soft text-accent-foreground" variant="secondary">VIP</Badge>}
                      {(t.free === 1 || t.personal_freeleech === 1) && (
                        <Badge className="bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>
                      )}
                      {t.my_snatched === 1 && <Badge variant="secondary">Snatched</Badge>}
                      {authors.length > 0 && (
                        <span className="text-[11.5px] text-muted-foreground">{authors.map((a) => a.name).join(', ')}</span>
                      )}
                    </span>
                  </span>
                  <span className="text-right font-mono text-[12px] tabular-nums text-muted-foreground" title="Seeders">
                    {fmtInt(t.seeders)} <span className="text-ok">↑</span>
                  </span>
                </a>
              )
            })}
          </div>
          {items.length > shown.length && (
            <p className="px-6 py-2 text-[12px] text-muted-foreground">
              {fmtInt(items.length - shown.length)} more via See all.
            </p>
          )}
        </CardContent>
      </Card>
    </BlurFade>
  )
}

// The frosted column: backdrop blur layers that grow toward the text.
const HERO_GLASS_LAYERS = 6
const HERO_GLASS_BLUR_STEP_PX = 6

// The arrival, one sequence under 800ms: the book settles first, the kicker
// follows, the title writes itself per word and the rest of the column trails.
const ARRIVAL_EASE = [0.16, 1, 0.3, 1] as const
const ARRIVAL_STAGGER_S = 0.06
const TITLE_DELAY_S = 0.14
const TITLE_REVEAL_SPEED = 1.6
const BODY_DELAY_S = 0.32

const ARRIVAL_ITEM: Variants = {
  hidden: { opacity: 0, y: 10, filter: 'blur(6px)' },
  visible: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { duration: 0.5, ease: ARRIVAL_EASE } },
}

const arrivalGroup = (delayChildren: number) => ({
  container: { hidden: {}, visible: { transition: { staggerChildren: ARRIVAL_STAGGER_S, delayChildren } } },
  item: ARRIVAL_ITEM,
})

const KICKER_ARRIVAL = arrivalGroup(0)
const BODY_ARRIVAL = arrivalGroup(BODY_DELAY_S)

const TITLE_ARRIVAL = {
  item: {
    hidden: { opacity: 0, y: 8, filter: 'blur(8px)' },
    visible: { opacity: 1, y: 0, filter: 'blur(0px)' },
  } satisfies Variants,
}

// The book swings in from a slight angle and settles on a spring.
const BOOK_ARRIVAL = {
  container: { hidden: {}, visible: {} },
  item: {
    hidden: { opacity: 0, x: -14, rotateY: -16, transformPerspective: 1100 },
    visible: {
      opacity: 1,
      x: 0,
      rotateY: 0,
      transformPerspective: 1100,
      transition: { type: 'spring', stiffness: 130, damping: 17, mass: 1, opacity: { duration: 0.45, ease: 'easeOut' } },
    },
  } satisfies Variants,
}

interface StatEntry {
  label: string
  value: string | null
  /** Set for whole numbers, which count up on arrival. */
  count?: number
  title?: string
}

export function TorrentView(props: PageProps) {
  const data = useMemo(() => extractTorrent(document), [])
  // A wedge spent on this page turns the torrent free, which the server-rendered
  // ratio tile in the sidebar cannot know.
  const [spent, setSpent] = useState(false)
  const dockRow = useRef<HTMLDivElement>(null)
  const bonusRaw = useLiveBonus(props.page.stats.bonus)
  // History quiets the guard but not the wedge: MAM keeps its own FL link on
  // torrents you seed. A fresh download of an old snatch costs ratio again.
  const guardFree = !data || !data.title || data.freeleech || data.personalFreeleech || data.vip || !!data.dlHistory || !!data.downloadBlocked || spent
  const guard = useRatioGuard(guardFree ? null : data.size)

  // Opening a torrent is what takes its new dot away in the lists. Only one
  // added after the mark can carry a dot, so only that one is worth recording.
  const seenId = data?.id ?? null
  const seenAdded = data?.added ?? null
  useEffect(() => {
    if (seenId == null || !readFeature('newTorrents')) return
    const since = readNewSince()
    const at = stampMs(seenAdded)
    if (since > 0 && at != null && at > since) markSeenTorrent(Number(seenId))
  }, [seenId, seenAdded])

  if (!data || !data.title) return <LegacyView {...props} />

  // The series line is the one accent in the hero, so names carry their weight
  // in the text color instead of a second one.
  const people = (list: { name: string; href: string }[]) =>
    list.map((p, i) => (
      <span key={p.href + i}>
        {i > 0 && ', '}
        <a className="text-foreground hover:underline" href={p.href}>{p.name}</a>
      </span>
    ))

  const languages = data.categories.filter((c) => c.language)
  const genres = data.categories.filter((c) => !c.language)
  // An unknown balance leaves the thanks ceiling to MAM's own maximum.
  const balance = bonusRaw ? countOf(bonusRaw) : null

  // The dock's wedge button carries the confirm flow, so the menu drops its bare
  // duplicate of that same spend. A wedge also buys nothing on a torrent that
  // already costs nothing, even where MAM keeps offering the button.
  const freeForMe = data.freeleech || data.personalFreeleech || data.vip || spent
  const dockHasWedge = !freeForMe && !data.downloadBlocked && data.id != null
  const buyButtons =
    data.ratio?.buttons.filter((b) => !((dockHasWedge || freeForMe) && b.name === 'personalFL')) ?? []

  const count = (raw: string | null) => (raw ? countOf(raw) : undefined)
  const stats: StatEntry[] = [
    { label: 'size', value: data.size },
    { label: data.files.count === '1' ? 'file' : 'files', value: data.files.count && fmtInt(data.files.count), count: count(data.files.count) },
    { label: 'seeders', value: data.seeders && fmtInt(data.seeders), count: count(data.seeders) },
    { label: 'leechers', value: data.leechers && fmtInt(data.leechers), count: count(data.leechers) },
    { label: 'snatched', value: data.snatched && fmtInt(data.snatched), count: count(data.snatched) },
    { label: 'added', value: data.added && relTime(data.added), title: utcTitle(data.added) || undefined },
  ]
  const shownStats = stats.filter((s): s is StatEntry & { value: string } => !!s.value)

  return (
    <MotionConfig reducedMotion="user">
      <MiniHero data={data} guard={guard} spent={spent} onSpent={() => setSpent(true)} watch={dockRow} />
      {/* grid-cols-1 pins the tracks to the page width; a bare grid would widen
          to the min-content of the series strip and push cards past the card
          edge. */}
      <div className="grid grid-cols-1 gap-5">
        {/* HERO: ambilight glow from the cover, 3D book, kicker and statline */}
        <div className="relative overflow-hidden rounded-xl border bg-card shadow-card">
          {data.poster && (
            <>
              <BookAmbilight poster={data.poster} />
              {/* The glass runs under the text column: to the right of the
                  book from sm up, below the book while the hero stacks. */}
              <ProgressiveBlur
                direction="right"
                blurLayers={HERO_GLASS_LAYERS}
                blurIntensity={HERO_GLASS_BLUR_STEP_PX}
                className="pointer-events-none absolute inset-y-0 left-[26%] right-0 z-1 max-sm:hidden"
              />
              <ProgressiveBlur
                direction="bottom"
                blurLayers={HERO_GLASS_LAYERS}
                blurIntensity={HERO_GLASS_BLUR_STEP_PX}
                className="pointer-events-none absolute inset-x-0 bottom-0 top-[30%] z-1 sm:hidden"
              />
              <div
                aria-hidden
                className={cn(
                  'pointer-events-none absolute inset-0 z-1',
                  'bg-[linear-gradient(180deg,transparent_24%,color-mix(in_oklab,var(--card)_64%,transparent)_40%,color-mix(in_oklab,var(--card)_92%,transparent)_100%)]',
                  'sm:bg-[linear-gradient(90deg,transparent_12%,color-mix(in_oklab,var(--card)_64%,transparent)_30%,color-mix(in_oklab,var(--card)_92%,transparent)_100%)]'
                )}
              />
            </>
          )}
          <div className="relative z-2 grid gap-8 p-6 sm:grid-cols-[252px_minmax(0,1fr)] sm:p-8">
            <AnimatedGroup variants={BOOK_ARRIVAL} className="mx-auto w-full max-w-[252px] sm:mx-0">
              <Book3D poster={data.poster} title={data.title} shape={coverShape({ mediatype: mediaTypeFromHref(data.catIconHref) })} className="text-[15px]" />
            </AnimatedGroup>

            <div className="min-w-0">
              <AnimatedGroup variants={KICKER_ARRIVAL}>
                {/* Status only. What the torrent is about lives in Details, so one
                    row of chips carries one meaning. */}
                {(data.dlHistory || data.vip || data.freeleech || data.personalFreeleech || spent || data.fileTypes.length > 0) && (
                  <div key="badges" className="mb-3 flex flex-wrap items-center gap-1.5">
                    {data.dlHistory && <DlHistoryBadge label={data.dlHistory} />}
                    {data.freeleech && <Badge className="bg-ok/15 text-ok" variant="secondary">Freeleech</Badge>}
                    {(data.personalFreeleech || spent) && (
                      <Badge className="bg-ok/15 text-ok" variant="secondary">Personal freeleech</Badge>
                    )}
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
                  </div>
                )}

                {data.series.length > 0 && (
                  <div key="series" className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-brand">
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
              </AnimatedGroup>

              <TextEffect
                as="h1"
                per="word"
                preset="fade-in-blur"
                variants={TITLE_ARRIVAL}
                delay={TITLE_DELAY_S}
                speedReveal={TITLE_REVEAL_SPEED}
                className="font-display text-[31px] font-semibold leading-[1.15] tracking-[-0.018em] text-balance"
              >
                {data.title}
              </TextEffect>

              <AnimatedGroup variants={BODY_ARRIVAL}>
                {(data.authors.length > 0 || data.narrators.length > 0) && (
                  <p key="people" className="mt-2 text-[14px] text-muted-foreground">
                    {data.authors.length > 0 && <>by {people(data.authors)}</>}
                    {data.narrators.length > 0 && (
                      <>
                        {data.authors.length > 0 && ' · '}
                        read by {people(data.narrators)}
                      </>
                    )}
                  </p>
                )}

                <TorLinks key="links" data={data} />

                {shownStats.length > 0 && (
                  <div key="stats" className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-t pt-4">
                    {shownStats.map((s) => <Stat key={s.label} label={s.label} value={s.value} count={s.count} title={s.title} />)}
                  </div>
                )}

                {data.mediaInfoMicro && (
                  <p key="micro" className="mt-3 font-mono text-[11.5px] tracking-wide text-muted-foreground">{data.mediaInfoMicro}</p>
                )}

                <DownloadDock
                  key="dock"
                  data={data}
                  guard={guard}
                  spent={spent}
                  onSpent={() => setSpent(true)}
                  rowRef={dockRow}
                  buyButtons={buyButtons}
                />
              </AnimatedGroup>
            </div>
          </div>
        </div>

        {/* grid-cols-1 below lg as well: a bare grid gets an auto track that a
            wide table pushes past the page instead of scrolling inside its own
            box. */}
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          {/* MAIN COLUMN: description, series strip, media info, files, peers */}
          <div className="grid min-w-0 grid-cols-1 gap-5">
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

            <EditionsStrip data={data} />

            <TorrentPanels data={data} />
          </div>

          {/* DETAILS sidebar: A24-style label-over-value grid */}
          <Card className="lg:sticky lg:top-20">
            <CardHeader><CardTitle>Details</CardTitle></CardHeader>
            <CardContent>
              <dl className="divide-y divide-border/50">
                {data.uploader && (
                  <KV label="Uploaded by">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <a className="min-w-0 font-medium break-words hover:underline" style={{ color: mutedUserColor(data.uploader.color) }} href={data.uploader.href}>
                        {data.uploader.name}
                      </a>
                      {data.thanks && (
                        <ThankUploader thanks={data.thanks} name={data.uploader.name} balance={balance} />
                      )}
                    </div>
                  </KV>
                )}

                {genres.length > 0 && (
                  <KV label="Genres" full>
                    <div className="flex flex-wrap gap-1.5">
                      {genres.map((c) => (
                        <Badge key={c.href} variant="secondary" asChild><a href={c.href}>{c.name}</a></Badge>
                      ))}
                    </div>
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

                {data.tags && (
                  <KV label="Tags" full>
                    <TagLinks raw={data.tags} full chips />
                  </KV>
                )}

                {/* The badges live in the hero and the purchases sit with the
                    other actions, so this row is left with MAM's own words
                    about the cost. A spent wedge makes those untrue. */}
                {data.ratio?.note && !spent && (
                  <KV label="Freeleech" full>
                    <div className="text-[12px] text-muted-foreground">{data.ratio.note}</div>
                  </KV>
                )}

                {!data.ratio && !data.freeleech && !data.personalFreeleech && !spent && data.ratioHtml && (
                  <KV label="Ratio after" full>
                    <div
                      className="text-[13px] leading-relaxed text-muted-foreground [&_a]:text-brand [&_a]:underline"
                      dangerouslySetInnerHTML={{ __html: data.ratioHtml }}
                    />
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
                            <Button variant="link" className="h-auto gap-1 p-0 text-[12.5px] text-brand has-[>svg]:px-0">
                              <Info className="size-3.5" /> Find out why
                            </Button>
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
                  <KV key={i} label={r.label}>
                    <span className="legacy-html" dangerouslySetInnerHTML={{ __html: r.html }} />
                  </KV>
                ))}
              </dl>

              {(data.hasSubmitInfo || data.reportIssueHref) && (
                <div className="mt-4 grid justify-items-start gap-1 border-t pt-3.5">
                  {data.hasSubmitInfo && (
                    <Button
                      variant="link"
                      className={FOOTER_LINK}
                      onClick={() => proxyClick('#submitInfo [data-tormissdataj]', 'Submitting info is not available for this torrent.')}
                    >
                      <FilePenLine className="size-3.5 shrink-0" /> Submit missing info
                    </Button>
                  )}
                  {data.reportIssueHref && (
                    <Button asChild variant="link" className={FOOTER_LINK}>
                      <a href={data.reportIssueHref}>
                        <Flag className="size-3.5 shrink-0" /> Report an issue
                      </a>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* COMMENTS: full width, real conversation */}
        <Card className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle>
              Comments{data.commentCount ? ` (${data.commentCount})` : data.comments.length ? ` (${data.comments.length})` : ''}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 px-6 py-5">
            {data.comments.length > 0 ? (
              <div className="grid">
                {data.comments.map((c) => <Comment key={c.id} c={c} />)}
              </div>
            ) : (
              <p className="py-6 text-center text-sm text-muted-foreground">No comments yet. Be the first to leave one.</p>
            )}
            {data.addCommentHref && data.id != null && (
              <CommentComposer tid={data.id} fallbackHref={data.addCommentHref} />
            )}
          </CardContent>
        </Card>
      </div>
    </MotionConfig>
  )
}
