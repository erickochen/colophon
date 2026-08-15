import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowLeft, Send, TriangleAlert } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { TicketRow, readTicketSections, type Ticket } from '@/app/pages/tickets'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import {
  applyChain, readChain, readExtraInfo, readTopics, postBoxOpen,
  liveExtraControl, writeExtraValues, clearTicketDraft,
  BUG_FORUM, DRAFT_KEY, FIELD_HINTS, type ExtraInfo, type TicketTopic,
} from '@/lib/tickets'
import { submitGuarded } from '@/lib/form-submit'
import { registerInvalidAnchor } from '@/lib/invalid-anchor'
import { findSubmitter } from '@/lib/form-mirror'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { FilterPill, FilterPillList } from '@/components/filters'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Tabs } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

/** How long an unsent ticket is offered back, in milliseconds. */
const DRAFT_TTL = 24 * 60 * 60 * 1000
/** Open tickets shown above the form before the rest moves to the list page. */
const STRIP_MAX = 3

interface Draft { key: string; message: string; at: number }

function readDraft(): Draft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const d = JSON.parse(raw) as Draft
    return d.at > Date.now() - DRAFT_TTL && d.message ? d : null
  } catch {
    return null
  }
}

/** Module scope, so typing never remounts the input under the caret. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-[13px] font-medium">{label}</Label>
      {hint && <p className="-mt-0.5 text-[12px] text-muted-foreground">{hint}</p>}
      {children}
    </div>
  )
}

/** One injected field. MAM rebuilds #extraInfo behind us, so the control is
 * looked up by name on every write and the anchor is re-registered on whatever
 * node is live at that moment. */
function ExtraControl({
  field, value, onValue, mark,
}: {
  field: ExtraInfo['fields'][number]
  value: string
  onValue: (v: string) => void
  mark: (name: string, fn: ((m: string | null) => void) | null, node: () => HTMLElement | null) => void
}) {
  const anchor = useRef<HTMLDivElement>(null)
  const [invalid, setInvalid] = useState<string | null>(null)

  useEffect(() => {
    mark(field.name, setInvalid, () => anchor.current)
    const attach = () => {
      const el = liveExtraControl(field.name)
      return el ? registerInvalidAnchor(el, { node: () => anchor.current, mark: setInvalid }) : undefined
    }
    let off = attach()
    // MAM's restore runs a beat after ours and swaps the node, so claim the
    // replacement too.
    const t = setTimeout(() => { off?.(); off = attach() }, 0)
    return () => { clearTimeout(t); off?.(); mark(field.name, null, () => null) }
  }, [field.name, mark])

  return (
    <div ref={anchor} className="grid gap-1.5">
      <Field label={field.label} hint={FIELD_HINTS[field.name]}>
        <Input
          type={field.type === 'url' ? 'url' : 'text'}
          value={value}
          placeholder={field.placeholder || undefined}
          aria-required={field.required}
          aria-invalid={!!invalid}
          className="h-10"
          onChange={(e) => {
            onValue(e.target.value)
            setInvalid(null)
          }}
        />
      </Field>
      {invalid && <p className="text-[12px] text-destructive">{invalid}</p>}
    </div>
  )
}

export function TicketNewView(props: PageProps) {
  const topics = useMemo(() => readTopics(), [])
  const form = useMemo(
    () => document.querySelector<HTMLFormElement>('form[action*="newTicket" i]'),
    []
  )
  const openAll = useMemo(
    () => readTicketSections(document)?.flatMap((s) => s.tickets) ?? [],
    []
  )
  const open = openAll.slice(0, STRIP_MAX)

  const [picked, setPicked] = useState<TicketTopic | null>(null)
  const [extra, setExtra] = useState<ExtraInfo>({ fields: [], warningHtml: null, helperHtml: null, unsupported: false })
  /** Values for the injected fields, keyed by name and dropped on every topic
   * change, since MAM throws its controls away with the topic. */
  const [values, setValues] = useState<Record<string, string>>({})
  const marks = useRef(new Map<string, { fn: (m: string | null) => void; node: () => HTMLElement | null }>())
  const [cat, setCat] = useState('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [restored, setRestored] = useState(false)
  const [sending, setSending] = useState(false)
  const [live, setLive] = useState('')
  const [broken, setBroken] = useState(false)

  const boxRef = useRef<HTMLTextAreaElement>(null)
  const firstFieldRef = useRef<HTMLDivElement>(null)

  const registerMark = useCallback(
    (name: string, fn: ((m: string | null) => void) | null, node: () => HTMLElement | null) => {
      if (fn) marks.current.set(name, { fn, node })
      else marks.current.delete(name)
    },
    []
  )

  /** Runs MAM's cascade, then reads back what it injected. */
  function choose(t: TicketTopic, announce = true) {
    if (!applyChain(t.main, t.l2, t.l3)) {
      setBroken(true)
      return
    }
    const info = readExtraInfo()
    if (info.unsupported) {
      setBroken(true)
      return
    }
    setPicked(t)
    setExtra(info)
    setValues(Object.fromEntries(info.fields.map((f) => [f.name, f.value])))
    setQuery('')
    if (announce) {
      setLive(
        `Topic set to ${t.cat}, ${t.sub}, ${t.leaf}.` +
          (info.fields.length > 0 ? ` ${info.fields.length} more fields to fill in.` : ' Message box added below.')
      )
      requestAnimationFrame(() => {
        const target = info.fields.length > 0 ? firstFieldRef.current?.querySelector('input') : boxRef.current
        target?.focus()
      })
    }
  }

  // A deep link carries the chain in #options, so apply it rather than waiting
  // to see whether MAM's own ready handler got there first.
  useEffect(() => {
    if (!topics || !form) return
    const chain = readChain()
    const draft = readDraft()
    const wanted = chain
      ? topics.find((t) => t.main === chain[0] && t.l2 === chain[1] && t.l3 === chain[2])
      : draft
        ? topics.find((t) => t.key === draft.key)
        : undefined
    if (wanted) {
      choose(wanted, false)
      if (draft && draft.key === wanted.key) {
        setMessage(draft.message)
        setRestored(true)
      }
    } else if (chain && postBoxOpen()) {
      // MAM accepted a chain we cannot name, so its own page is the safer one.
      setBroken(true)
    } else if (chain && topics.some((t) => t.main === chain[0])) {
      // A half link names the category but no topic, which is what MAM's own
      // report links carry. Open the picker on that group.
      setCat(chain[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, form])

  if (!topics || !form || broken) return <LegacyView {...props} />

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const inScope = topics.filter((t) => words.length > 0 || cat === 'all' || t.main === cat)
  const groups: { key: string; heading: string; items: TicketTopic[] }[] = []
  for (const t of inScope) {
    const key = `${t.main}|${t.l2}`
    const last = groups.at(-1)
    if (last?.key === key) last.items.push(t)
    else groups.push({ key, heading: `${t.cat} › ${t.sub}`, items: [t] })
  }

  const catCounts = new Map<string, { name: string; n: number }>()
  for (const t of topics) {
    const hit = catCounts.get(t.main)
    if (hit) hit.n++
    else catCounts.set(t.main, { name: t.cat, n: 1 })
  }

  function send() {
    if (!picked) {
      toast.warning('Pick a topic first.')
      return
    }
    const box = form!.querySelector<HTMLTextAreaElement>('textarea[name="postBox"]')
    if (!message.trim() || !box) {
      toast.warning('Write a message so staff know what to look at.')
      boxRef.current?.focus()
      return
    }
    // Everything lands in the controls that are live right now. The rows claim
    // those same nodes, so a rejected value still has a place to point at.
    writeExtraValues(values)
    for (const [name, m] of marks.current) {
      const el = liveExtraControl(name)
      if (el) registerInvalidAnchor(el, { node: m.node, mark: m.fn })
    }
    box.value = message
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ key: picked.key, message, at: Date.now() }))
    } catch {
      /* private mode, the draft is a courtesy */
    }
    setSending(true)
    if (!submitGuarded(form!, findSubmitter(form!))) setSending(false)
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-4">
      <PageHeader
        title="New ticket"
        sub="Staff read every ticket. Pick the closest topic, then tell them what happened."
        action={
          <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
            <a href="/ticket.php/myTickets"><ArrowLeft /> All tickets</a>
          </Button>
        }
      />

      {open.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle>
              You already have {openAll.length === 1 ? '1 ticket' : `${openAll.length} tickets`} open
            </CardTitle>
            <p className="pt-0.5 text-[12px] text-muted-foreground">
              Adding to an open ticket is faster than starting a second one.
            </p>
          </CardHeader>
          <CardContent className="grid divide-y px-0 py-0">
            {open.map((t: Ticket, i: number) => <TicketRow key={i} t={t} />)}
          </CardContent>
          {openAll.length > open.length && (
            <a href="/ticket.php/myTickets" className="border-t px-6 py-2.5 text-[12px] text-brand hover:underline">
              See all {openAll.length} tickets
            </a>
          )}
        </Card>
      )}

      {restored && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-4 py-2.5 text-[12.5px]">
          <span>Picked up where you left off.</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[12px]"
            onClick={() => {
              setMessage('')
              setRestored(false)
              clearTicketDraft()
            }}
          >
            Discard draft
          </Button>
        </div>
      )}

      {picked ? (
        <Card className="py-0">
          <CardContent className="flex flex-wrap items-center gap-3 px-6 py-3.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[12px] text-muted-foreground">{picked.cat} › {picked.sub}</div>
              <div className="truncate text-[14px] font-semibold leading-snug">{picked.leaf}</div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-[12.5px]"
              onClick={() => { setPicked(null); setLive('') }}
            >
              Change topic
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle>What is this about?</CardTitle>
            <p className="pt-0.5 text-[12px] text-muted-foreground">
              Staff route tickets by topic, so the closest match gets the fastest answer.
            </p>
          </CardHeader>
          <CardContent className="px-0 py-0">
            <Command
              // Headings and rows share the card's px-6 gutter. A heading stays
              // put while its own group scrolls past.
              className="bg-transparent **:data-[slot=command-input-wrapper]:h-10 **:data-[slot=command-input-wrapper]:px-6 [&_[cmdk-group]]:px-0 [&_[cmdk-group-heading]]:sticky [&_[cmdk-group-heading]]:top-0 [&_[cmdk-group-heading]]:z-10 [&_[cmdk-group-heading]]:bg-card [&_[cmdk-group-heading]]:px-6 [&_[cmdk-group-heading]]:py-2"
              filter={(value, search) => {
                const w = search.toLowerCase().split(/\s+/).filter(Boolean)
                return w.every((x) => value.includes(x)) ? 1 : 0
              }}
            >
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search topics, like seedbox, passkey or duplicate"
                aria-label="Search ticket topics"
                className="text-[13px]"
              />
              {words.length === 0 && (
                <Tabs value={cat} onValueChange={setCat}>
                  <FilterPillList className="border-b px-6 py-2.5">
                    <FilterPill value="all" count={topics.length}>All topics</FilterPill>
                    {[...catCounts].map(([id, c]) => (
                      <FilterPill key={id} value={id} count={c.n}>{c.name}</FilterPill>
                    ))}
                  </FilterPillList>
                </Tabs>
              )}
              <CommandList className="max-h-[min(60vh,340px)]">
                <CommandEmpty>
                  No topic matches that. Try another word or clear the search to browse by category.
                </CommandEmpty>
                {groups.map((g) => (
                  <CommandGroup key={g.key} heading={g.heading}>
                    {g.items.map((t) => (
                      <CommandItem
                        key={t.key}
                        value={t.search}
                        onSelect={() => choose(t)}
                        className="flex-col items-start gap-0.5 px-6 py-2 sm:flex-row sm:items-center sm:gap-2"
                      >
                        <span className="truncate text-[13px]">{t.leaf}</span>
                        <span className="flex items-center gap-2 sm:ml-auto">
                          {t.redirect && (
                            <Badge variant="secondary" className="bg-warn/15 text-[10px] text-warn">Read first</Badge>
                          )}
                          {/* The group heading already carries the path while
                              browsing, so it only shows itself once a search
                              mixes the groups. It stays readable either way. */}
                          <span className={cn('truncate text-[11.5px] text-muted-foreground', words.length === 0 && 'sr-only')}>
                            {t.cat} › {t.sub}
                          </span>
                        </span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                ))}
              </CommandList>
            </Command>
          </CardContent>
        </Card>
      )}

      {picked && extra.warningHtml && (
        <div className="flex items-start gap-2.5 rounded-lg bg-warn/15 px-4 py-3 text-[13px]">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warn" />
          <div className="grid gap-1.5">
            <p className="font-medium">The bug report forum is usually the right place</p>
            <RichHtml
              html={extra.warningHtml}
              className="text-[13px] leading-normal text-muted-foreground [&_a]:text-brand [&_h1]:text-[13px] [&_h1]:font-normal [&_h3]:text-[13px] [&_h3]:font-normal"
            />
            <Button asChild variant="outline" size="sm" className="h-8 w-fit text-[12.5px]">
              <a href={BUG_FORUM} target="_blank" rel="noopener">Open the bug report forum</a>
            </Button>
          </div>
        </div>
      )}

      {picked && extra.fields.length > 0 && (
        <Card className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle>Details staff will need</CardTitle>
            {/* MAM's own wording introduces these fields, so it belongs here
                rather than beside the message box. */}
            {extra.helperHtml ? (
              <RichHtml
                html={extra.helperHtml}
                className="pt-0.5 text-[12px] leading-normal text-muted-foreground [&_a]:text-brand [&_h1]:text-[12px] [&_h1]:font-normal [&_h2]:text-[12px] [&_h2]:font-normal [&_h3]:text-[12px] [&_h3]:font-normal"
              />
            ) : (
              extra.fields.every((f) => f.required) && (
                <p className="pt-0.5 text-[12px] text-muted-foreground">
                  The ticket cannot be sent without these.
                </p>
              )
            )}
          </CardHeader>
          <CardContent className={cn('grid gap-4 pb-5', extra.fields.length === 2 && 'sm:grid-cols-2')}>
            {extra.fields.map((f, i) => (
              <div key={picked.key + f.name} ref={i === 0 ? firstFieldRef : undefined}>
                <ExtraControl
                  field={f}
                  value={values[f.name] ?? ''}
                  onValue={(v) => {
                    setValues((s) => ({ ...s, [f.name]: v }))
                    const el = liveExtraControl(f.name)
                    if (el) el.value = v
                  }}
                  mark={registerMark}
                />
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {picked && (
        <>
          <Card className="gap-0 py-0">
            <CardHeader className="!py-3.5"><CardTitle>Your message</CardTitle></CardHeader>
            <CardContent className="grid gap-2 pb-5">
              {/* Wording that came with fields already sits on those fields. */}
              {extra.helperHtml && extra.fields.length === 0 ? (
                <RichHtml html={extra.helperHtml} className="text-[12px] leading-normal text-muted-foreground [&_a]:text-brand" />
              ) : (
                <p className="text-[12px] text-muted-foreground">
                  What happened, when it started plus anything you already tried.
                </p>
              )}
              <Textarea
                ref={boxRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={sending}
                aria-label="Your message"
                placeholder="Staff cannot see your screen, so dates, links plus exact error text save a round trip."
                className="min-h-48 text-[13.5px]"
              />
            </CardContent>
          </Card>

          <div className="sticky bottom-4 z-10 flex items-center justify-end rounded-xl bg-background/95 px-4 py-2.5 shadow-lg backdrop-blur">
            <Button size="sm" className="w-full sm:w-auto" onClick={send} disabled={sending}>
              {sending ? <><Spinner /> Sending…</> : <><Send /> Send to staff</>}
            </Button>
          </div>
        </>
      )}

      <p aria-live="polite" className="sr-only">{live}</p>
    </div>
  )
}
