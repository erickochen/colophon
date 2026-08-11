import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, AtSign, History, MoreHorizontal, Pencil, Quote as QuoteIcon, Send, Smile, Star, StarOff, Volume2, VolumeX, X } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractShouts, type Shout } from '@/lib/extract/home'
import { PageHeader, UserLink } from '@/app/shell/bits'
import { initials, localDate, localHm, relTime, utcTitle } from '@/lib/format'
import { stableUserColor } from '@/lib/colors'
import { useFeature, useUserList } from '@/lib/settings'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/toast'
import { GiftActions } from '@/components/giftmam-actions'
import { QuickShouts } from '@/components/quick-shouts'

interface ShoutItem { id: string; numId: string; time: string | null; html: string | null; text: string; editable: boolean }
interface ShoutGroup { key: string; user: Shout['user']; own: boolean; items: ShoutItem[] }

/** Chat-style grouping: consecutive shouts from the same person collapse under
 * one avatar until the speaker changes or more than 4 minutes pass. */
function groupShouts(shouts: Shout[], myUid: number | null): ShoutGroup[] {
  const groups: ShoutGroup[] = []
  for (const s of shouts) {
    const uid = s.user?.uid != null ? `u${s.user.uid}` : s.user?.name ?? 'system'
    const last = groups.at(-1)
    const t = s.time ? Date.parse(s.time.replace(' ', 'T') + 'Z') : NaN
    const lastT = last?.items.at(-1)?.time ? Date.parse(last.items.at(-1)!.time!.replace(' ', 'T') + 'Z') : NaN
    const gap = !Number.isNaN(t) && !Number.isNaN(lastT) && t - lastT > 4 * 60_000
    const item: ShoutItem = { id: s.id, numId: s.id.replace(/^sbid/, ''), time: s.time, html: s.html, text: s.text, editable: s.editable }
    if (last && last.key === uid && !gap) {
      last.items.push(item)
    } else {
      groups.push({ key: uid, user: s.user, own: s.user?.uid != null && s.user.uid === myUid, items: [item] })
    }
  }
  return groups
}

// Group shouts by the same day the labels below name, local when enabled.
const dayOf = (t: string | null) => (t ? localDate(t) : '')

function dayLabel(t: string | null): string {
  if (!t) return ''
  const d = new Date(t.replace(' ', 'T') + 'Z')
  const today = new Date()
  const y = new Date(today); y.setDate(today.getDate() - 1)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, y)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
}

/** Whether a shout talks to or about the reader: a link to their profile or
 * their name written out. */
function mentionsMe(item: ShoutItem, myUid: number | null, myName: string | null): boolean {
  if (myUid != null && item.html?.includes(`/u/${myUid}"`)) return true
  if (!myName) return false
  const esc = myName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^\\w])@?${esc}([^\\w]|$)`, 'i').test(item.text)
}

/** Rendered shout body: keep MAM's smilies as small inline images and its
 * tinted @mentions; fall back to plain text when no HTML was captured. */
function ShoutBody({ item }: { item: ShoutItem }) {
  if (item.html) {
    return (
      <span
        className="min-w-0 [overflow-wrap:anywhere] text-foreground/90 [&_.sb-quote-jump]:mr-0.5 [&_.sb-quote-jump]:text-muted-foreground [&_a]:font-medium [&_img]:mx-px [&_img]:inline [&_img]:h-[18px] [&_img]:w-auto [&_img]:align-text-bottom"
        dangerouslySetInnerHTML={{ __html: item.html }}
      />
    )
  }
  return <span className="min-w-0 [overflow-wrap:anywhere] text-foreground/90">{item.text}</span>
}

/** MAM's smilies, loaded on first open into a searchable-ish scroll grid. Picking
 * one inserts its text code (":-)"), which MAM turns back into the smiley. */
function EmojiPicker({ onPick }: { onPick: (code: string) => void }) {
  const [smilies, setSmilies] = useState<{ code: string; src: string; title: string }[]>([])

  function load() {
    if (smilies.length) return
    const box = document.querySelector('#smilies')
    if (box && /loading in progress/i.test(box.textContent ?? '')) {
      document.querySelector<HTMLElement>('#t-smilies a')?.click()
    }
    let tries = 0
    const timer = window.setInterval(() => {
      const imgs = [...document.querySelectorAll<HTMLImageElement>('#smilies img')]
      if (imgs.length || ++tries > 30) {
        window.clearInterval(timer)
        setSmilies(
          imgs
            .map((img) => ({ code: img.getAttribute('data-ssps') || img.getAttribute('alt') || '', src: img.src, title: img.getAttribute('title') || '' }))
            .filter((s) => s.code)
        )
      }
    }, 120)
  }

  return (
    <Popover onOpenChange={(o) => o && load()}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0 text-muted-foreground hover:text-foreground">
              <Smile className="size-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Smilies</TooltipContent>
      </Tooltip>
      <PopoverContent align="end" className="w-[19rem] p-0">
        <div className="border-b px-3 py-2 text-[12px] font-medium">Smilies</div>
        <ScrollArea className="h-60">
          <div className="grid grid-cols-8 gap-0.5 p-2">
            {smilies.map((s, i) => (
              <button
                key={s.code + i}
                type="button"
                title={s.title || s.code}
                onClick={() => onPick(s.code)}
                className="flex size-8 items-center justify-center rounded-md transition-colors hover:bg-muted"
              >
                <img src={s.src} loading="lazy" alt={s.code} className="h-5 w-5 object-contain" />
              </button>
            ))}
            {smilies.length === 0 && (
              <div className="col-span-8 py-10 text-center text-[12px] text-muted-foreground">Loading smilies…</div>
            )}
          </div>
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}

export function ShoutboxView(props: PageProps) {
  const myUid = useMemo(
    () => Number(document.querySelector('a.myInfo[href^="/u/"]')?.getAttribute('href')?.match(/\d+/)?.[0]) || null,
    []
  )
  const myName = props.page.user.name || null
  const [mentionsOn] = useFeature('sbMentions')
  const [mutesOn] = useFeature('sbMutes')
  const [emphasisOn] = useFeature('sbEmphasis')
  const [colorsOn] = useFeature('sbColors')
  const muted = useUserList('sb-muted')
  const emphasized = useUserList('sb-emphasized')
  // Which muted groups the reader opened, per occurrence, for this visit only.
  const [revealedMutes, setRevealedMutes] = useState<Set<string>>(() => new Set())
  const [shouts, setShouts] = useState<Shout[]>(() => extractShouts(document.querySelector('#sbf') ?? document))
  const [draft, setDraft] = useState('')
  const [quoting, setQuoting] = useState<{ code: string; label: string } | null>(null)
  const [pinnedToBottom, setPinnedToBottom] = useState(true)
  const [editing, setEditing] = useState<{ numId: string; text: string } | null>(null)
  const mentionCodes = useRef<Record<string, string>>({})
  const scroller = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const pinned = useRef(true)
  const seen = useRef<Set<string>>(new Set(shouts.map((s) => s.id)))

  useEffect(() => {
    const sbf = document.querySelector('#sbf')
    if (!sbf) return
    const obs = new MutationObserver(() => setShouts(extractShouts(sbf)))
    obs.observe(sbf, { childList: true, subtree: true })
    return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (pinned.current) scroller.current?.scrollTo({ top: scroller.current.scrollHeight })
    const id = requestAnimationFrame(() => shouts.forEach((s) => seen.current.add(s.id)))
    return () => cancelAnimationFrame(id)
  }, [shouts])

  const groups = useMemo(() => groupShouts(shouts, myUid), [shouts, myUid])

  function scrollToLatest() {
    pinned.current = true
    setPinnedToBottom(true)
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' })
  }

  function appendDraft(s: string) {
    setDraft((d) => (d.trim() ? d.replace(/\s*$/, ' ') : '') + s)
    input.current?.focus()
  }

  /** Put text at the caret, replacing any selection; an empty box just takes it. */
  function insertAtCaret(text: string) {
    const el = input.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    setDraft(draft.slice(0, start) + text + draft.slice(end))
    requestAnimationFrame(() => {
      el?.focus()
      const pos = start + text.length
      el?.setSelectionRange(pos, pos)
    })
  }

  function send() {
    // Composer keeps things readable: @mentions as plain "@name", the quoted
    // shout as a chip. Reassemble MAM's real codes only at send time.
    let text = draft.trim()
    for (const [name, code] of Object.entries(mentionCodes.current)) {
      text = text.replace(new RegExp(`@${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), code)
    }
    // MAM's quote code ends in a space before the reply; keep exactly one.
    const full = (quoting ? quoting.code.replace(/\s*$/, ' ') : '') + text
    if (full.trim().length < 4) {
      toast.warning('Shouts need at least 4 characters.')
      return
    }
    const box = document.querySelector<HTMLInputElement>('#shbox_text')
    const form = document.querySelector<HTMLFormElement>('#sbform')
    if (!box || !form) {
      toast.error('Shoutbox controls not found.')
      return
    }
    box.value = full
    form.querySelector<HTMLInputElement>('input[name="send"]')?.click()
    setDraft('')
    setQuoting(null)
    mentionCodes.current = {}
    scrollToLatest()
  }

  function loadOlder() {
    const btn = document.querySelector<HTMLAnchorElement>('#loadMore')
    if (btn) btn.click()
    else toast.error('Older shouts are not available.')
  }

  /** Reuse MAM's own quote button for the exact code, but show the user a clean
   * chip (name + snippet) instead of the raw markup; the code is prepended at
   * send time. */
  function quoteShout(item: ShoutItem, user: Shout['user']) {
    const box = document.querySelector<HTMLInputElement>('#shbox_text')
    if (!box || !user) return toast.error('Quote is not available.')
    const before = box.value
    box.value = ''
    document.querySelector<HTMLElement>(`.sbNewQuote[data-id="${item.numId}"]`)?.click()
    const code = box.value
    box.value = before
    if (!code.trim()) return toast.error('Quote is not available.')
    const snippet = item.text.length > 60 ? `${item.text.slice(0, 60).trim()}…` : item.text
    setQuoting({ code, label: `${user.name}: “${snippet}”` })
    input.current?.focus()
    scrollToLatest()
  }

  function mentionUser(user: Shout['user']) {
    if (!user?.uid) return
    // Keep it readable as "@name"; convert back to MAM's linked form on send.
    mentionCodes.current[user.name] = `@[ulink=${user.uid};${user.color ?? ''}]${user.name}[/ulink]`
    appendDraft(`@${user.name} `)
    scrollToLatest()
  }

  /** Edit an own shout: MAM's editShout() fetches the raw source into the hidden
   * #editShout box and shows its overlay; we lift that text into our dialog and,
   * on save, write it back and submit through MAM's own Update button. */
  function openEdit(numId: string) {
    const w = window as unknown as { editShout?: (id: string) => void }
    const box = document.querySelector<HTMLTextAreaElement>('#editShout')
    if (typeof w.editShout !== 'function' || !box) return toast.error('Editing is not available.')
    box.value = ''
    w.editShout(numId)
    let tries = 0
    const timer = window.setInterval(() => {
      if (box.value.trim() || ++tries > 40) {
        window.clearInterval(timer)
        if (box.value.trim()) setEditing({ numId, text: box.value })
        else toast.error('Could not load that shout for editing.')
      }
    }, 100)
  }

  function saveEdit() {
    if (!editing) return
    const box = document.querySelector<HTMLTextAreaElement>('#editShout')
    const submit = document.querySelector<HTMLInputElement>('#sbEditSubmit')
    if (box && submit) {
      box.value = editing.text
      submit.click()
      toast.success('Shout updated')
    }
    setEditing(null)
  }

  function cancelEdit() {
    document.querySelector<HTMLInputElement>('#sbEditCancel')?.click()
    setEditing(null)
  }

  let lastDay = ''

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Shoutbox"
        sub={
          <span className="inline-flex items-center gap-2">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ok/70" />
              <span className="relative inline-flex size-2 rounded-full bg-ok" />
            </span>
            Live
          </span>
        }
      />
      <Card className="relative overflow-hidden py-0">
        <CardContent className="grid p-0">
          <div
            ref={scroller}
            onScroll={(e) => {
              const el = e.currentTarget
              const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40
              pinned.current = atBottom
              setPinnedToBottom(atBottom)
            }}
            /* 15rem is the chrome around the list: topbar, page header, composer
             * and paddings. The cap keeps the composer on screen on short viewports. */
            className="grid max-h-[min(64dvh,calc(100dvh-15rem))] min-h-[min(420px,calc(100dvh-15rem))] content-start gap-1.5 overflow-y-auto px-4 py-4 sm:px-6"
          >
            <div className="flex justify-center pb-1">
              <Button variant="outline" size="sm" className="h-7 rounded-full text-[12px]" onClick={loadOlder}>
                <History /> Load older shouts
              </Button>
            </div>
            {groups.map((g) => {
              const groupNew = g.items.every((it) => !seen.current.has(it.id))
              const day = dayOf(g.items[0].time)
              const showDay = day && day !== lastDay
              if (day) lastDay = day
              const uidS = g.user?.uid != null ? String(g.user.uid) : null
              const dayNode = showDay ? (
                <div className="my-2 flex items-center gap-3 px-1">
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{dayLabel(g.items[0].time)}</span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null
              if (mutesOn && uidS && !g.own && muted.has(uidS) && !revealedMutes.has(g.items[0].id)) {
                return (
                  <div key={g.items[0].id}>
                    {dayNode}
                    <div className="flex items-center gap-2 px-2 py-1 text-[12px] text-muted-foreground">
                      <VolumeX aria-hidden="true" className="size-3.5 shrink-0" />
                      <span className="italic">
                        Muted: {g.user?.name} · {g.items.length === 1 ? '1 shout' : `${g.items.length} shouts`}
                      </span>
                      <button
                        type="button"
                        className="rounded text-brand hover:underline focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                        onClick={() => setRevealedMutes((s) => new Set(s).add(g.items[0].id))}
                      >
                        show
                      </button>
                    </div>
                  </div>
                )
              }
              const nameColor = colorsOn && uidS ? stableUserColor(uidS) : null
              const emphasize = emphasisOn && uidS != null && emphasized.has(uidS)
              return (
                <div key={g.items[0].id}>
                  {dayNode}
                  <div
                    className={cn(
                      'flex min-w-0 gap-2.5 rounded-xl px-2 py-1.5 transition-colors',
                      g.own && 'bg-brand-soft/40',
                      groupNew && 'animate-in fade-in slide-in-from-bottom-1 duration-300'
                    )}
                  >
                    <Avatar className={cn('mt-0.5 size-7 shrink-0 rounded-lg', g.own && 'ring-2 ring-brand/40', emphasize && 'ring-2 ring-brand/60')}>
                      <AvatarFallback
                        className="rounded-lg text-[10.5px] font-medium"
                        style={nameColor ? { color: nameColor } : g.user?.color ? { color: g.user.color } : undefined}
                      >
                        {initials(g.user?.name ?? 'SY')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        {g.user ? (
                          <UserLink
                            name={g.user.name}
                            href={g.user.uid ? `/u/${g.user.uid}` : null}
                            color={g.user.color}
                            exactColor={nameColor}
                            className="text-[13px]"
                          />
                        ) : (
                          <span className="text-[13px] font-medium text-muted-foreground">system</span>
                        )}
                        {emphasize && <Star aria-label="Emphasized" className="size-3 shrink-0 self-center fill-brand text-brand" />}
                        {g.user?.country && (
                          <img
                            src={g.user.country.src}
                            alt={g.user.country.name}
                            title={g.user.country.name}
                            loading="lazy"
                            className="h-3 w-auto shrink-0 self-center rounded-[2px] opacity-70"
                          />
                        )}
                        {g.own && <span className="rounded bg-brand/15 px-1.5 py-px text-[9.5px] font-semibold uppercase tracking-wide text-brand">you</span>}
                        <span className="text-[10.5px] text-muted-foreground" title={utcTitle(g.items[0].time)}>{relTime(g.items[0].time)}</span>
                      </div>
                      <div className="grid gap-0.5">
                        {g.items.map((it) => {
                          const mentioned = mentionsOn && !g.own && mentionsMe(it, myUid, myName)
                          return (
                          <div
                            key={it.id}
                            className={cn(
                              'group flex items-baseline gap-2 text-[13.5px] pointer-coarse:flex-wrap',
                              mentioned && '-mx-1.5 rounded-md bg-brand/10 px-1.5 py-0.5'
                            )}
                          >
                            <ShoutBody item={it} />
                            <div className="ml-auto flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
                              <span className="mr-1 font-mono text-[10px] text-muted-foreground" title={utcTitle(it.time)}>{localHm(it.time)}</span>
                              {g.user?.uid && (
                                <>
                                  <IconAction label="Quote" onClick={() => quoteShout(it, g.user)}><QuoteIcon className="size-3" /></IconAction>
                                  <IconAction label="Mention" onClick={() => mentionUser(g.user)}><AtSign className="size-3" /></IconAction>
                                </>
                              )}
                              {g.user?.uid != null && !g.own && (
                                <GiftActions uid={String(g.user.uid)} name={g.user.name} surface="shoutbox" buttonClass="size-6 pointer-coarse:size-8" iconClass="size-3" />
                              )}
                              {it.editable && (
                                <IconAction label="Edit" onClick={() => openEdit(it.numId)}><Pencil className="size-3" /></IconAction>
                              )}
                              {uidS && !g.own && (mutesOn || emphasisOn) && (
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    aria-label={`More actions for ${g.user?.name}`}
                                    className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none pointer-coarse:size-8"
                                  >
                                    <MoreHorizontal className="size-3" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    {mutesOn && (
                                      muted.has(uidS) ? (
                                        <DropdownMenuItem onClick={() => muted.remove(uidS)}>
                                          <Volume2 /> Unmute {g.user?.name}
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem onClick={() => muted.add({ uid: uidS, name: g.user?.name ?? uidS })}>
                                          <VolumeX /> Mute {g.user?.name}
                                        </DropdownMenuItem>
                                      )
                                    )}
                                    {emphasisOn && (
                                      emphasized.has(uidS) ? (
                                        <DropdownMenuItem onClick={() => emphasized.remove(uidS)}>
                                          <StarOff /> Remove emphasis
                                        </DropdownMenuItem>
                                      ) : (
                                        <DropdownMenuItem onClick={() => emphasized.add({ uid: uidS, name: g.user?.name ?? uidS })}>
                                          <Star /> Emphasize {g.user?.name}
                                        </DropdownMenuItem>
                                      )
                                    )}
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              )}
                            </div>
                          </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {shouts.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">It's quiet in here. Say hi!</p>}
          </div>

          {!pinnedToBottom && (
            <button
              onClick={scrollToLatest}
              className="absolute bottom-24 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground shadow-lg transition-transform hover:scale-105"
            >
              <ArrowDown className="size-3.5" /> Jump to latest
            </button>
          )}

          <div className="border-t bg-muted/30 px-4 py-3 sm:px-6">
            {quoting && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-brand-soft/40 py-1.5 pl-3 pr-2 text-[12px]">
                <QuoteIcon className="size-3 shrink-0 text-brand" />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">Replying to {quoting.label}</span>
                <button type="button" onClick={() => setQuoting(null)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" title="Remove quote">
                  <X className="size-3.5" />
                </button>
              </div>
            )}
            <div className="flex h-11 items-center gap-1 rounded-lg border border-input bg-background pl-1 pr-1.5 transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring">
              <EmojiPicker onPick={(code) => appendDraft(code)} />
              <QuickShouts draft={draft} onInsert={insertAtCaret} />
              <input
                ref={input}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="Say something nice…"
                maxLength={1500}
                className="h-full min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
              />
              {draft.length > 0 && (
                <span className={cn('shrink-0 px-1 text-[11px] tabular-nums', draft.length > 1400 ? 'text-warn' : 'text-muted-foreground')}>
                  {1500 - draft.length}
                </span>
              )}
              <Button onClick={send} size="sm" className="h-8 shrink-0" disabled={!quoting && draft.trim().length < 4}><Send /> Shout</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(o) => !o && cancelEdit()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit shout</DialogTitle>
          </DialogHeader>
          <Textarea
            value={editing?.text ?? ''}
            onChange={(e) => setEditing((s) => (s ? { ...s, text: e.target.value } : s))}
            className="min-h-28"
            autoFocus
          />
          <DialogFooter>
            <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
            <Button onClick={saveEdit} disabled={(editing?.text.trim().length ?? 0) < 4}>Update shout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Compact ghost icon button used for the per-shout hover actions. */
function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button type="button" variant="ghost" size="icon" className="size-6 text-muted-foreground hover:text-foreground pointer-coarse:size-8" onClick={onClick}>
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
