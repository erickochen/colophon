import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmark, BookmarkCheck, Check, CircleSlash, Copy, Download, FilePenLine, Flag, Gift, History, Info, Lock, MessageSquarePlus, Minus, MoreHorizontal, Quote, Settings2, Sprout } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractTorrent, type MediaNode, type TorrentComment, type TorrentDetail } from '@/lib/extract/torrent'
import { parseFileList, parsePeers, type FileListData, type PeerData, type PeerRow, type TorrentFile } from '@/lib/extract/torrent-panels'
import { LegacyView } from '@/app/pages/legacy'
import { RichHtml } from '@/app/shell/bits'
import { mutedUserColor } from '@/lib/colors'
import { fmtInt, fmtRatio, initials, plural, relTime, utcTitle } from '@/lib/format'
import { mediaInfoGroupLabel, mediaInfoLabel } from '@/lib/media-info'
import { searchTorrents, parsePeople, coverUrl, torrentUrl, THANK_MAX, type SearchTorrent } from '@/lib/mam-api'
import { coverShape, mediaTypeFromHref, type CoverShape } from '@/lib/cover-shape'
import { seriesEntry } from '@/lib/series'
import { readDefaultAmount, resolveAmount, useFeature } from '@/lib/settings'
import { HARD_FLOOR, TRIVIAL_DROP, useRatioGuard, type RatioGuard, type RatioLevel } from '@/lib/ratio-protect'
import { cn } from '@/lib/utils'
import { Book, Book3D, BookAmbilight } from '@/components/book'
import { TagLinks } from '@/components/tag-links'
import { TorLinks, useReadingSnippet } from '@/components/tor-links'
import { WedgeDetailButton } from '@/components/wedge-download'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/toast'
import { scrollIntoView } from '@/lib/motion'

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

// Same status idiom as the topbar chips: a small dot carries the level, the
// text only turns loud when action is needed.
const RATIO_NOTE_TONE: Record<RatioLevel, { text: string; dot: string | null }> = {
  none: { text: 'text-muted-foreground', dot: null },
  notice: { text: 'text-muted-foreground', dot: 'bg-warn' },
  warn: { text: 'font-medium text-warn', dot: 'bg-warn' },
  block: { text: 'font-medium text-destructive', dot: 'bg-destructive' },
}

/** On/off switch and personal floor for the ratio guard, kept in localStorage. */
function GuardSettings({ guard }: { guard: RatioGuard }) {
  // While the field holds focus the typed text wins; otherwise it mirrors the
  // store, so a settings import or the prefs tab shows up here at once.
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (guard.floor != null ? String(guard.floor) : '')
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
          Locks the plain download on a heavy ratio drop or when it would cross ratio {HARD_FLOOR}.
          Switched off, the impact still shows but nothing locks.
        </p>
        <label className="mb-1.5 mt-3 block text-[12px] font-semibold" htmlFor="ratio-floor">Minimum ratio</label>
        <Input
          id="ratio-floor"
          type="number"
          min={0}
          value={text}
          placeholder="off"
          className="h-8"
          disabled={!guard.enabled}
          onFocus={() => setDraft(guard.floor != null ? String(guard.floor) : '')}
          onBlur={() => setDraft(null)}
          onChange={(e) => {
            setDraft(e.target.value)
            const v = Number(e.target.value)
            guard.setFloor(e.target.value !== '' && Number.isFinite(v) && v > 0 ? v : null)
          }}
        />
        <p className="mt-2 text-[12px] leading-snug text-muted-foreground">
          Also lock when a torrent would push your ratio below this number.
        </p>
      </PopoverContent>
    </Popover>
  )
}

/** What one click costs, shown above the buttons so the reason comes before
 * the choice. Appears once the totals arrive. */
function RatioNote({ guard, className }: { guard: RatioGuard; className?: string }) {
  const { current, next, drop, level } = guard.impact
  if (drop != null && drop <= TRIVIAL_DROP) return null
  const tone = RATIO_NOTE_TONE[level]
  return (
    <p className={cn('mt-2 text-[12px] leading-snug', tone.text, className)}>
      {tone.dot && <span aria-hidden className={cn('mr-1.5 inline-block size-1.5 rounded-full align-[1px]', tone.dot)} />}
      {current == null ? (
        <>First download: your ratio would start at <b className="tabular-nums">{fmtRatio(next)}</b>.</>
      ) : (
        <>Your ratio would become <b className="tabular-nums">{fmtRatio(next)}</b> <span className="tabular-nums">(now {fmtRatio(current)})</span>.</>
      )}
      {level === 'block' && <> Plain download is locked.</>}
      {level === 'warn' && <> Consider spending a wedge.</>}
      <GuardSettings guard={guard} />
    </p>
  )
}

/** Download row with the ratio guard: freeleech, VIP and seeding torrents pass
 * untouched; a blocking ratio hit swaps the plain download for the FL routes. */
function DownloadDock({ data, spent, onSpent }: { data: TorrentDetail; spent: boolean; onSpent: () => void }) {
  const freeCost = data.freeleech || data.personalFreeleech || data.vip
  // History quiets the guard but not the wedge: MAM keeps its own FL link on
  // torrents you seed. A fresh download of an old snatch costs ratio again.
  const guard = useRatioGuard(freeCost || !!data.dlHistory || !!data.downloadBlocked || spent ? null : data.size)
  const href = data.downloadHref ?? (data.id ? `/tor/download.php?tid=${data.id}` : null)
  const level = guard?.impact.level ?? 'none'
  const buyFl = data.ratio?.buttons.find((b) => b.name === 'personalFL')

  const wedgeAction = freeCost || !!data.downloadBlocked || spent ? null : data.id != null ? (
    <WedgeDetailButton
      target={{ id: data.id, title: data.title, size: data.size, href }}
      onDone={onSpent}
    />
  ) : buyFl ? (
    <Button
      variant="outline"
      title="Spends one FL wedge"
      onClick={() => proxyClick(`input[data-freetor="${buyFl.torId}"][name="personalFL"]`, 'Buying freeleech is not available right now.')}
    >
      <Gift /> {buyFl.label}
    </Button>
  ) : null

  return (
    <>
      {guard && !data.downloadBlocked && <RatioNote guard={guard} className="mt-5 mb-0" />}
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {data.downloadBlocked ? (
          <Button disabled><Download /> Download blocked</Button>
        ) : href ? (
          level === 'block' ? (
            <>
              <Button disabled variant="outline"><Lock /> Download</Button>
              {wedgeAction}
            </>
          ) : (
            <>
              <Button asChild>
                <a href={href}><Download /> Download</a>
              </Button>
              {wedgeAction}
            </>
          )
        ) : null}
        <BookmarkButton />
        <MoreActions data={data} />
      </div>
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
 * keeps a single primary action. Every entry carries its own words. */
function MoreActions({ data }: { data: TorrentDetail }) {
  const copySnippet = useReadingSnippet(data)
  if (!copySnippet && !data.clone) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" aria-label="More actions for this torrent">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
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
  const { hash, files } = state.data
  if (files.length === 0) {
    return <p className="text-[13px] text-muted-foreground">This torrent lists no files.</p>
  }
  return (
    <div className="grid grid-cols-1 gap-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="text-[12.5px] text-muted-foreground">{plural(files.length, 'file')}</p>
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
        <div className="flex items-end gap-5 overflow-x-auto pb-1">
          {items.map((it) => (
            <a key={it.id} href={it.href} title={it.title} className="group w-[88px] shrink-0 text-[10px]">
              <span className="block transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 motion-reduce:transition-none">
                <Book poster={it.poster} title={it.title} shape={it.shape} plain size="mini" className="group-hover:shadow-book-lift" />
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

export function TorrentView(props: PageProps) {
  const data = useMemo(() => extractTorrent(document), [])
  const [points, setPoints] = useState(() => {
    const preset = resolveAmount(readDefaultAmount('thank'), 0, THANK_MAX)
    return preset != null ? String(preset) : ''
  })
  // A wedge spent on this page turns the torrent free, which the server-rendered
  // ratio tile in the sidebar cannot know.
  const [spent, setSpent] = useState(false)
  const thankBox = useRef<HTMLDivElement>(null)
  const thankInput = useRef<HTMLInputElement>(null)

  if (!data || !data.title) return <LegacyView {...props} />

  const thankValid =
    points === '' || (Number.isInteger(Number(points)) && Number(points) >= 0 && Number(points) <= THANK_MAX)

  function thank() {
    const amount = resolveAmount(points, 0, THANK_MAX) ?? 0
    const input = document.querySelector<HTMLInputElement>('#thanksArea input[name="points"]')
    if (input) input.value = String(amount)
    if (!proxyClick('#giveThanks', 'Thanks are not available for this torrent.')) return
    toast.success(amount > 0 ? `Sent ${amount.toLocaleString('en-US')} points to the uploader` : 'Thanked the uploader')
  }

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

  // The dock's wedge button carries the confirm flow, so the sidebar drops its
  // bare duplicate of that same spend and keeps only the other purchase routes.
  const dockHasWedge =
    !(data.freeleech || data.personalFreeleech || data.vip) && !data.downloadBlocked && !spent && data.id != null
  const sideRatioButtons = data.ratio?.buttons.filter((b) => !(dockHasWedge && b.name === 'personalFL')) ?? []

  const stats = [
    { label: 'size', value: data.size },
    { label: data.files.count === '1' ? 'file' : 'files', value: data.files.count && fmtInt(data.files.count) },
    { label: 'seeders', value: data.seeders && fmtInt(data.seeders) },
    { label: 'leechers', value: data.leechers && fmtInt(data.leechers) },
    { label: 'snatched', value: data.snatched && fmtInt(data.snatched) },
    { label: 'added', value: data.added && relTime(data.added), title: utcTitle(data.added) || undefined },
  ].filter((s): s is { label: string; value: string; title?: string } => !!s.value)

  return (
    // grid-cols-1 pins the tracks to the page width; a bare grid would widen
    // to the min-content of the series strip and push cards past the card edge.
    <div className="grid grid-cols-1 gap-5">
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
              <Book3D poster={data.poster} title={data.title} shape={coverShape({ mediatype: mediaTypeFromHref(data.catIconHref) })} className="text-[15px]" />
            </div>

            <div className="min-w-0">
              {/* Status only. What the torrent is about lives in Details, so one
                  row of chips carries one meaning. */}
              {(data.dlHistory || data.vip || data.freeleech || data.personalFreeleech || spent || data.fileTypes.length > 0) && (
                <div className="mb-3 flex flex-wrap items-center gap-1.5">
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

              <TorLinks data={data} />

              {stats.length > 0 && (
                <div className="mt-5 flex flex-wrap gap-x-7 gap-y-3 border-t pt-4">
                  {stats.map((s) => <Stat key={s.label} label={s.label} value={s.value} title={s.title} />)}
                </div>
              )}

              {data.mediaInfoMicro && (
                <p className="mt-3 font-mono text-[11.5px] tracking-wide text-muted-foreground">{data.mediaInfoMicro}</p>
              )}

              <DownloadDock data={data} spent={spent} onSpent={() => setSpent(true)} />
            </div>
          </div>
        </div>
      </BlurFade>

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
                  <a className="font-medium hover:underline" style={{ color: mutedUserColor(data.uploader.color) }} href={data.uploader.href}>
                    {data.uploader.name}
                  </a>
                  <Button
                    variant="link"
                    className="mt-0.5 block h-auto p-0 text-[12px] text-brand"
                    onClick={() => {
                      scrollIntoView(thankBox.current, { block: 'center' })
                      thankInput.current?.focus({ preventScroll: true })
                    }}
                  >
                    Say thanks
                  </Button>
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

              {/* The badges live in the hero now, so this row is what you can
                  still do about the cost. A spent wedge makes both untrue. */}
              {data.ratio && !spent && (sideRatioButtons.length > 0 || data.ratio.note) && (
                <KV label="Freeleech" full>
                  <div className="grid gap-2 text-[13px]">
                    {sideRatioButtons.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sideRatioButtons.map((b) => (
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
                          <Button variant="link" className="h-auto gap-1 p-0 text-[12.5px] text-brand">
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
          <div ref={thankBox} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 px-4 py-3">
            <Gift className="size-4 text-brand" />
            <span className="text-[13px] font-medium">Thank the uploader</span>
            <Input
              ref={thankInput}
              type="number"
              min={0}
              max={THANK_MAX}
              step={50}
              value={points}
              onChange={(e) => setPoints(e.target.value)}
              placeholder="0"
              aria-invalid={!thankValid}
              aria-describedby={thankValid ? undefined : 'thank-points-hint'}
              className="ml-auto h-8 w-24"
            />
            <span className="text-[12.5px] text-muted-foreground">points</span>
            <Button size="sm" className="h-8" onClick={thank} disabled={!thankValid}>Say thanks</Button>
            {!thankValid && (
              <span id="thank-points-hint" className="basis-full text-[11.5px] text-destructive">
                A whole number up to {THANK_MAX.toLocaleString('en-US')}. Empty sends plain thanks.
              </span>
            )}
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
