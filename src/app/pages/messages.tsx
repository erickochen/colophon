import { Fragment, memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ChevronRight, CornerUpLeft, Mail, MailOpen, MoreHorizontal, PenLine, Send, ShieldAlert,
  Trash2, X,
} from 'lucide-react'
import type { PageProps } from '@/app/router'
import {
  baseSubject,
  buildThreads,
  extractMailbox,
  fetchPmBodies,
  NO_SUBJECT,
  capQuote,
  quoteAuthor,
  quoteText,
  scanBox,
  splitQuoteStack,
  type PmBox,
  type PmMessage,
  type PmThread,
  type QuoteLevel,
} from '@/lib/extract/messages'
import { clearPmSnapshot, fetchNotifCounts, readPmSnapshot } from '@/lib/notify'
import { sendMessage } from '@/lib/pm-send'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, POST_SPACING, RichHtml, UserLink } from '@/app/shell/bits'
import {
  BubbleActions, Conversation, ConversationBubble, selectionWithin, useConversationNav,
} from '@/components/conversation'
import { SelectionQuote } from '@/components/quote-selection'
import { MemberPicker } from '@/components/member-picker'
import { BBComposer, type ComposerHandle } from '@/components/bb-composer'
import { FilterBar, FilterRow, FilterSearch, FilterSegments, TAP_TARGET } from '@/components/filters'
import { dateOnly, plural, relTime, utcTitle } from '@/lib/format'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { toast } from '@/components/ui/toast'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

/** Messages drawn when a conversation opens, with older ones on request. */
const THREAD_PAGE_SIZE = 25
/** Marks which conversation to reopen after MAM stored a reply. */
const THREAD_HASH = '#t='
/** How far from the bottom still counts as reading along, in pixels. */
const FOLLOW_SLACK = 80

const bodyKey = (m: PmMessage) => `${m.box}:${m.id}`
const newestFirst = (a: PmMessage, b: PmMessage) => (b.date ?? '').localeCompare(a.date ?? '')

/** Survives a navigation MAM controls, like following a delete link. */
const PARKED_KEY = 'colophon:pm-thread'

export function parkThread(key: string) {
  try {
    sessionStorage.setItem(PARKED_KEY, key)
  } catch {
    /* private mode: the conversation just opens on the newest one */
  }
}

function openingThread(): string | null {
  if (location.hash.startsWith(THREAD_HASH)) {
    return decodeURIComponent(location.hash.slice(THREAD_HASH.length))
  }
  try {
    const parked = sessionStorage.getItem(PARKED_KEY)
    sessionStorage.removeItem(PARKED_KEY)
    return parked
  } catch {
    return null
  }
}

function threadUrl(key: string): string {
  return `${location.origin}/messages.php?action=viewmailbox&box=1${THREAD_HASH}${encodeURIComponent(key)}`
}

/** Marks where a conversation turns to another subject. */
function TopicDivider({ subject }: { subject: string }) {
  return (
    <div className="flex items-center gap-2.5 pt-1">
      <span className="h-px flex-1 bg-border" />
      <span className="font-display truncate text-[11.5px] font-medium text-muted-foreground">{subject}</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

/** The messages quoted under a reply, folded away until asked for. */
function QuotedHistory({
  quotes,
  author,
  startOpen,
  tabIndex,
}: {
  quotes: QuoteLevel[]
  author: string
  startOpen?: boolean
  tabIndex?: number
}) {
  const [open, setOpen] = useState(!!startOpen)
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="pt-2">
      <CollapsibleTrigger
        tabIndex={tabIndex}
        aria-label={`Quoted history under ${author}: ${plural(quotes.length, 'quoted message')}`}
        className="flex items-center gap-1 py-1 text-[11.5px] text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
      >
        <ChevronRight aria-hidden="true" className={cn('size-3 transition-transform', open && 'rotate-90')} />
        Quoted history
        <span className="tabular-nums">{quotes.length}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="grid gap-2 pt-2">
          {quotes.map((q, i) => (
            <div key={i} className="rounded-md bg-muted px-3 py-2">
              <div className="pb-1 text-[11px] font-semibold text-muted-foreground">{q.author} wrote</div>
              <RichHtml html={q.html} className={cn(POST_SPACING, 'text-[12.5px] text-foreground-soft')} />
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

const ThreadBubble = memo(function ThreadBubble({
  message,
  me,
  body,
  loading,
  position,
  total,
  onDelete,
  onReply,
}: {
  message: PmMessage
  me: string
  body: string | null | undefined
  loading: boolean
  position: number
  total: number
  onDelete: (m: PmMessage) => void
  onReply: ((m: PmMessage, selected: string | null) => void) | null
}) {
  const mine = message.box === -1
  const author = mine ? me : message.party?.name ?? 'system'
  // Splitting is regex work over the full body, so it happens once per body
  // rather than on every keystroke in the composer.
  const split = useMemo(() => (body ? splitQuoteStack(body) : null), [body])
  const hasText = !!split?.head
  const who = mine ? 'your message' : `${author}'s message`
  const when = message.date ? `, ${dateOnly(message.date)}` : ''
  const navKey = bodyKey(message)
  const { navigable, active } = useConversationNav(navKey)
  // Buttons of a message the arrows are not on stay out of the tab order, so
  // the whole thread is one stop instead of one per message.
  const actionTab = navigable && !active ? -1 : undefined
  return (
    <ConversationBubble
      author={author}
      href={mine ? null : message.party?.href}
      color={mine ? null : message.party?.color}
      at={message.date}
      mine={mine}
      position={position}
      total={total}
      navKey={navKey}
      actions={
        (message.deleteHref || message.reportHref || onReply) && (
          <BubbleActions label={`Actions for ${who}${when}`}>
            {onReply && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    tabIndex={actionTab}
                    aria-label={`Reply to ${who}${when}`}
                    className="size-6 text-muted-foreground hover:text-foreground"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={(e) => onReply(message, selectionWithin(e.currentTarget.closest('article')))}
                  >
                    <CornerUpLeft className="size-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Reply</TooltipContent>
              </Tooltip>
            )}
            {(message.reportHref || message.deleteHref) && (
              <DropdownMenu>
                <DropdownMenuTrigger
                  tabIndex={actionTab}
                  aria-label={`More actions for ${who}${when}`}
                  className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                >
                  <MoreHorizontal className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align={mine ? 'start' : 'end'}>
                  {message.reportHref && (
                    <DropdownMenuItem asChild>
                      <a href={message.reportHref}><ShieldAlert /> Report message</a>
                    </DropdownMenuItem>
                  )}
                  {message.deleteHref && (
                    <DropdownMenuItem variant="destructive" onClick={() => onDelete(message)}>
                      <Trash2 /> Delete message
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </BubbleActions>
        )
      }
      footer={split && split.quotes.length > 0 ? <QuotedHistory quotes={split.quotes} author={author} startOpen={!hasText} tabIndex={actionTab} /> : undefined}
    >
      {loading ? (
        <div className="grid gap-1.5 py-0.5">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
      ) : hasText ? (
        <RichHtml html={split!.head} className={cn(POST_SPACING, 'text-[13.5px]')} />
      ) : (
        <p className="text-[13px] text-muted-foreground">{split ? 'Only quoted text.' : 'This message has no body.'}</p>
      )}
    </ConversationBubble>
  )
})

export function MessagesView(props: PageProps) {
  const initial = useMemo(() => extractMailbox(), [])
  const [messages, setMessages] = useState<PmMessage[]>(() => initial?.messages ?? [])
  const [scanning, setScanning] = useState(!!initial)
  const [truncated, setTruncated] = useState(false)
  const [scanFailed, setScanFailed] = useState(false)
  // Serving this page marks the delivered messages read, so the count the
  // sidebar polled on the previous page is the one that still knows them.
  const [unreadCount, setUnreadCount] = useState(() => readPmSnapshot() ?? 0)
  const [tab, setTab] = useState('people')
  const [query, setQuery] = useState('')
  const [openKey, setOpenKey] = useState<string | null>(openingThread)
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [bodies, setBodies] = useState<Map<string, string | null>>(() => new Map())
  const [shownCount, setShownCount] = useState(THREAD_PAGE_SIZE)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pendingDelete, setPendingDelete] = useState<PmMessage | null>(null)
  // The one message being answered. Null means the text goes out on its own.
  const [answering, setAnswering] = useState<PmMessage | null>(null)
  // Text highlighted inside that message, which wins over its opening lines.
  const [picked, setPicked] = useState<string | null>(null)
  const [picking, setPicking] = useState(false)
  const requested = useRef<Set<string>>(new Set())
  const composerRef = useRef<ComposerHandle>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const follow = useRef(true)
  const jumpTop = useRef(false)

  // A conversation spans both boxes, so the one we are not looking at is read first.
  useEffect(() => {
    if (!initial) return
    let alive = true
    const order: PmBox[] = initial.box === -1 ? [1, -1] : [-1, 1]
    void (async () => {
      try {
        for (const box of order) {
          const scan = await scanBox(box)
          if (!alive) return
          if (scan.messages.length) setMessages((prev) => [...prev, ...scan.messages])
          if (scan.truncated) setTruncated(true)
          if (scan.failed) setScanFailed(true)
        }
      } finally {
        // The spinner has to stop even when a page never arrived.
        if (alive) setScanning(false)
      }
    })()
    return () => {
      alive = false
    }
  }, [initial])

  // The mailbox page carries no unread flag of its own. A fresh answer can
  // only add to the parked count, never take away from it.
  useEffect(() => {
    clearPmSnapshot()
    let alive = true
    void (async () => {
      const counts = await fetchNotifCounts()
      if (alive && counts != null) setUnreadCount((prev) => Math.max(prev, counts.pms))
    })()
    return () => {
      alive = false
    }
  }, [])

  const threads = useMemo(() => buildThreads(messages), [messages])
  const { people, system } = useMemo(
    () => ({ people: threads.filter((t) => !t.isSystem), system: threads.filter((t) => t.isSystem) }),
    [threads]
  )

  // MAM publishes a count but no per-message flag, so the newest received
  // messages are the unread ones.
  const unread = useMemo(() => {
    const received = messages.filter((m) => m.box === 1).sort(newestFirst)
    return new Set(received.slice(0, unreadCount).map((m) => m.id))
  }, [messages, unreadCount])

  const shown = useMemo(() => {
    const list = tab === 'people' ? people : system
    const q = query.trim().toLowerCase()
    if (!q) return list
    return list.filter(
      (t) =>
        (t.party?.name ?? '').toLowerCase().includes(q) ||
        t.topics.some((s) => s.toLowerCase().includes(q))
    )
  }, [tab, people, system, query])

  const selected: PmThread | undefined = shown.find((t) => t.key === openKey) ?? shown[0]
  const visible = selected ? selected.messages.slice(Math.max(0, selected.messages.length - shownCount)) : []
  const visibleKeys = visible.map(bodyKey).join(',')

  // Pinned on the first batch of threads. Without this the background scan can
  // reorder the list and swap the open conversation while someone is reading.
  useEffect(() => {
    if (openKey == null && threads.length > 0) setOpenKey(threads[0].key)
  }, [openKey, threads])

  // The draft is only cleared when a conversation is opened by hand, so a
  // reordering list or a keystroke in the search field cannot throw it away.
  useEffect(() => {
    setShownCount(THREAD_PAGE_SIZE)
    setAnswering(null)
    setPicked(null)
  }, [selected?.key])

  useEffect(() => {
    const need = visible.filter((m) => !m.bodyHtml && !requested.current.has(bodyKey(m)))
    if (!need.length) return
    const keys = need.map(bodyKey)
    keys.forEach((k) => requested.current.add(k))
    let alive = true
    void (async () => {
      const loaded = await fetchPmBodies(need)
      if (!alive) {
        // Results are dropped, so let a later pass ask for them again instead of
        // leaving those bubbles loading forever.
        keys.forEach((k) => requested.current.delete(k))
        return
      }
      setBodies((prev) => {
        const next = new Map(prev)
        for (const [k, v] of loaded) next.set(k, v)
        return next
      })
    })()
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the visible set
  }, [visibleKeys])

  // A conversation opens on its newest message and keeps following it, unless
  // the reader scrolled up to read back.
  useEffect(() => {
    follow.current = true
  }, [selected?.key])

  // Drawn on screen counts as read, which is also when MAM marks a message read.
  useEffect(() => {
    const ids = visible.filter((m) => m.box === 1).map((m) => m.id)
    if (!ids.length) return
    setReadIds((prev) => {
      if (ids.every((id) => prev.has(id))) return prev
      const next = new Set(prev)
      for (const id of ids) next.add(id)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the visible set
  }, [visibleKeys])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    // Asking for older messages lands on them, not back at the newest.
    if (jumpTop.current) {
      jumpTop.current = false
      el.scrollTop = 0
      return
    }
    if (follow.current) el.scrollTop = el.scrollHeight
  }, [visibleKeys, bodies])

  if (!initial) return <LegacyView {...props} />

  const unreadIn = (t: PmThread) =>
    t.messages.filter((m) => m.box === 1 && unread.has(m.id) && !readIds.has(m.id)).length
  const countUnread = (list: PmThread[]) => list.reduce((n, t) => n + unreadIn(t), 0)
  // Named per tab, so a count never sits there without a dot to go with it.
  const unreadPeople = countUnread(people)
  const unreadSystem = countUnread(system)
  const sub = [
    unreadPeople > 0 && `${unreadPeople} unread`,
    unreadSystem > 0 && `${unreadSystem} unread in System`,
    `${people.length} conversations`,
    `${system.length} notice threads`,
  ]
    .filter(Boolean)
    .join(' · ')

  function openThread(t: PmThread) {
    setOpenKey(t.key)
    // Reset here as well as in the effect, so no render sees the previous
    // thread's larger window and fetches bodies it will not draw.
    setShownCount(THREAD_PAGE_SIZE)
    setDraft('')
    setAnswering(null)
    setPicked(null)
  }

  // MAM builds the subject from a received message, so that is what the send
  // form is fetched with even when the quote comes from one of our own.
  const newestReceived = selected ? [...selected.messages].reverse().find((m) => m.box === 1) ?? null : null
  const subjectSource = answering?.box === 1 ? answering : newestReceived
  const canReply = !!selected && !selected.isSystem && !!selected.party?.uid

  // Body of the message being answered, which may still be on its way.
  const answeringBody = answering ? answering.bodyHtml ?? bodies.get(bodyKey(answering)) : undefined
  const answeringQuote = useMemo(() => {
    if (!answering) return ''
    if (picked) return capQuote(picked)
    if (answeringBody === undefined) return null
    return quoteText(answeringBody)
  }, [answering, picked, answeringBody])

  const startReply = useCallback((m: PmMessage, selected: string | null) => {
    setAnswering(m)
    setPicked(selected)
    composerRef.current?.focus()
  }, [])

  async function send() {
    if (!selected?.party?.uid) return
    if (!draft.trim()) {
      toast.warning('Write a message first.')
      return
    }
    // The quoted message must belong to the open conversation. Otherwise the
    // quote and the recipient would come from different people.
    const target = answering && selected.messages.some((m) => m.id === answering.id) ? answering : null
    const source = subjectSource && selected.messages.some((m) => m.id === subjectSource.id) ? subjectSource : null
    setSending(true)
    const result = await sendMessage({
      receiverUid: selected.party.uid,
      replyToId: source?.id ?? null,
      subject: `Re: ${baseSubject(target?.subject ?? source?.subject ?? selected.subject)}`,
      text: draft,
      quote:
        target && answeringQuote
          ? { author: quoteAuthor(target.box === -1 ? props.page.user.name : selected.party.name), text: answeringQuote }
          : null,
      returnTo: threadUrl(selected.key),
    })
    if (result.ok) return // the stored message navigates away
    // Only a failed send releases the button, so a stored one cannot go twice.
    setSending(false)
    toast.error(
      result.reason === 'wrong-receiver'
        ? 'MAM handed back a different recipient, so nothing was sent.'
        : result.reason === 'network'
          ? 'Could not reach MAM. Nothing was sent.'
          : 'MAM did not hand over its send form. Open the reply page instead.'
    )
  }

  const older = selected ? selected.messages.length - visible.length : 0

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Messages"
        sub={sub}
        action={
          <Button size="sm" onClick={() => setPicking(true)}>
            <PenLine /> New message
          </Button>
        }
      />

      <FilterBar>
        <FilterSearch
          value={query}
          onChange={setQuery}
          placeholder="Search by subject or member"
        />
        <FilterRow>
          {/* Totals live in the header sub, so a number here always means unread. */}
          <FilterSegments
            ariaLabel="Mailbox"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'people', label: 'People', badge: unreadPeople },
              { value: 'system', label: 'System', badge: unreadSystem },
            ]}
          />
          {scanning && (
            <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
              <Spinner className="size-3" /> Reading inbox and sentbox
            </span>
          )}
          {scanFailed && !scanning && (
            <span className="text-[12px] text-warn">Part of the mailbox did not load. Reload to try again.</span>
          )}
          {truncated && !scanning && !scanFailed && (
            <span className="text-[12px] text-muted-foreground">Older pages are left out of the scan.</span>
          )}
        </FilterRow>
      </FilterBar>

      {shown.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MailOpen /></EmptyMedia>
                <EmptyTitle>{query ? 'Nothing matches that' : 'No conversations here'}</EmptyTitle>
                <EmptyDescription>
                  {query
                    ? 'Try another name or subject.'
                    : 'Messages from other members and notices from the site land in this box.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="grid lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="max-h-[70vh] overflow-y-auto border-b lg:border-b-0 lg:border-r">
              {shown.map((t) => {
                const count = unreadIn(t)
                return (
                  <Button
                    key={t.key}
                    variant="ghost"
                    onClick={() => openThread(t)}
                    className={cn(
                      'grid h-auto w-full grid-cols-[10px_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5 rounded-none border-b px-4 py-3 text-left font-normal last:border-b-0',
                      t.key === selected?.key ? 'bg-brand-soft/60' : count > 0 && 'bg-brand-soft/25'
                    )}
                  >
                    <span className="pt-1.5">
                      {count > 0 && <span className="block size-2 rounded-full bg-brand-fill" title={`${count} unread`} />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <UserLink
                          name={t.party?.name ?? 'system'}
                          color={t.party?.color}
                          className={cn('truncate text-[12.5px]', count > 0 && 'font-semibold')}
                        />
                        <span className="shrink-0 text-[11px] text-muted-foreground" title={utcTitle(t.last.date)}>{relTime(t.last.date)}</span>
                      </span>
                      <span
                        className={cn(
                          'font-display block truncate text-[13.5px]',
                          count > 0 ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground'
                        )}
                      >
                        {t.subject}
                      </span>
                      {t.messages.length > 1 && (
                        <span className="text-[11px] text-muted-foreground">{t.messages.length} messages</span>
                      )}
                    </span>
                  </Button>
                )
              })}
            </div>

            <div className="flex max-h-[70vh] min-h-[420px] flex-col bg-muted/40">
              {selected ? (
                <>
                  <div className="flex items-center justify-between gap-3 border-b bg-card px-6 py-3">
                    <div className="min-w-0">
                      <UserLink
                        name={selected.party?.name ?? 'system'}
                        href={selected.party?.href}
                        color={selected.party?.color}
                        className="font-display block truncate text-[14px] font-semibold"
                      />
                      <div className="truncate text-[12px] text-muted-foreground">
                        {selected.isSystem
                          ? `${selected.messages.length} ${selected.messages.length === 1 ? 'notice' : 'notices'}`
                          : `${selected.messages.length} ${selected.messages.length === 1 ? 'message' : 'messages'}`}
                        {selected.topics.length > 1 && ` · ${selected.topics.length} subjects`}
                      </div>
                    </div>
                  </div>

                  <div
                    ref={scrollRef}
                    onScroll={(e) => {
                      const el = e.currentTarget
                      follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK
                    }}
                    className="flex-1 overflow-y-auto px-6 py-4"
                  >
                    {older > 0 && (
                      <div className="pb-3 text-center">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            follow.current = false
                            jumpTop.current = true
                            setShownCount((c) => c + THREAD_PAGE_SIZE)
                          }}
                        >
                          Show {Math.min(older, THREAD_PAGE_SIZE)} older
                        </Button>
                      </div>
                    )}
                    <Conversation
                      label={`Conversation with ${selected.party?.name ?? 'the site'}`}
                      busy={visible.some((m) => !m.bodyHtml && !bodies.has(bodyKey(m)))}
                      startKey={visible.length ? bodyKey(visible[visible.length - 1]) : null}
                    >
                      {visible.map((m, i) => {
                        const topic = baseSubject(m.subject) || NO_SUBJECT
                        const prev = visible[i - 1]
                        const turned = !prev || topic !== (baseSubject(prev.subject) || NO_SUBJECT)
                        return (
                          <Fragment key={bodyKey(m)}>
                            {turned && <TopicDivider subject={topic} />}
                            <ThreadBubble
                              message={m}
                              me={props.page.user.name || 'you'}
                              body={m.bodyHtml ?? bodies.get(bodyKey(m))}
                              loading={!m.bodyHtml && !bodies.has(bodyKey(m))}
                              position={selected.messages.length - visible.length + i + 1}
                              total={selected.messages.length}
                              onDelete={setPendingDelete}
                              onReply={canReply ? startReply : null}
                            />
                          </Fragment>
                        )
                      })}
                    </Conversation>
                  </div>

                  {canReply && (
                    <div
                      className="grid gap-2.5 border-t bg-card px-6 py-3.5"
                      onKeyDown={(e) => {
                        if (e.key !== 'Escape' || !answering) return
                        e.stopPropagation()
                        setAnswering(null)
                        setPicked(null)
                      }}
                    >
                      {answering && (
                        <div className="grid gap-1 rounded-md bg-brand-soft/40 px-3 py-2 text-[12px]">
                          <div className="flex items-center gap-2">
                            <CornerUpLeft aria-hidden="true" className="size-3.5 shrink-0 text-brand" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              Replying to {answering.box === -1 ? 'your own message' : selected.party?.name ?? 'them'}
                            </span>
                            {picked && (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">your selection</Badge>
                            )}
                            <span className="shrink-0 text-[11px] text-muted-foreground">Esc to cancel</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label="Stop replying to that message"
                              onClick={() => {
                                setAnswering(null)
                                setPicked(null)
                              }}
                              className={cn(TAP_TARGET, 'size-5 shrink-0 text-muted-foreground')}
                            >
                              <X className="size-3.5" />
                            </Button>
                          </div>
                          <p className="truncate pl-5 text-[11.5px] italic text-muted-foreground">
                            {answeringQuote === null
                              ? 'Loading the message you are answering'
                              : answeringQuote || 'That message has no text to quote.'}
                          </p>
                        </div>
                      )}
                      <BBComposer
                        ref={composerRef}
                        value={draft}
                        onChange={setDraft}
                        placeholder={`Reply to ${selected.party?.name ?? 'this member'}…`}
                        minHeightClass="min-h-20"
                      />
                      <div className="flex items-center justify-end">
                        <Button size="sm" onClick={() => void send()} disabled={sending} aria-busy={sending}>
                          {sending ? <Spinner aria-hidden="true" /> : <Send aria-hidden="true" />} Send reply
                        </Button>
                      </div>
                    </div>
                  )}
                  <SelectionQuote
                    scope={scrollRef}
                    disabled={!canReply}
                    onQuote={(highlight) => {
                      const m = selected.messages.find((x) => bodyKey(x) === highlight.navKey)
                      if (m) startReply(m, highlight.text)
                    }}
                  />
                  <div role="status" aria-live="polite" className="sr-only">
                    {answering
                      ? `Replying to ${answering.box === -1 ? 'your own message' : selected.party?.name ?? 'them'}. Escape cancels.`
                      : ''}
                  </div>
                </>
              ) : (
                <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                  <Mail className="mr-2 size-4" /> Pick a conversation to read it
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      <MemberPicker
        open={picking}
        onOpenChange={setPicking}
        onPick={(m) => {
          if (m.uid) location.href = `/sendmessage.php?receiver=${m.uid}`
        }}
      />

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this message?</AlertDialogTitle>
            <AlertDialogDescription>
              It goes from your {pendingDelete?.box === -1 ? 'sentbox' : 'inbox'} only. There is no undo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingDelete?.deleteHref) return
                // MAM's delete link decides where the browser lands, so the open
                // conversation is parked for the page that comes back.
                if (selected) parkThread(selected.key)
                location.href = pendingDelete.deleteHref
              }}
            >
              Delete it
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
