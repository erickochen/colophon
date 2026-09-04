import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ChevronRight, LifeBuoy, Send, TicketPlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml, UserLink } from '@/app/shell/bits'
import { relTime, utcTitle } from '@/lib/format'
import { submitGuarded } from '@/lib/form-submit'
import { findSubmitter } from '@/lib/form-mirror'
import { clearTicketDraft } from '@/lib/tickets'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Conversation, ConversationBubble } from '@/components/conversation'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from '@/components/ui/item'
import { Spinner } from '@/components/ui/spinner'
import { Textarea } from '@/components/ui/textarea'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'

export interface Ticket {
  category: string[]
  added: string | null
  status: string
  lastUpdate: string | null
  lastBy: string | null
  lastByColor: string | null
  href: string | null
}
export interface TicketSection { title: string; tickets: Ticket[] }

/** Badge tone for a status. MAM's own wording is always what shows, so only the
 * color is a guess and an unknown status keeps a neutral one. */
function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (/^open/.test(s)) return 'bg-ok/15 text-ok'
  if (/pending|waiting|respond/.test(s)) return 'bg-warn/15 text-warn'
  return 'bg-muted text-muted-foreground'
}

/** MAM writes a status as a state plus what it wants from you, split by a
 * comma: "Pending Close, respond to reopen". The state fits a badge, the rest
 * belongs with the other things worth knowing about this ticket. */
function splitStatus(status: string): { state: string; asks: string | null } {
  const at = status.indexOf(',')
  return at < 0
    ? { state: status, asks: null }
    : { state: status.slice(0, at).trim(), asks: status.slice(at + 1).trim() || null }
}

const dateOf = (s: string | null) => s?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null

/** Long enough to be a sentence MAM wrote, rather than a stray word. */
const MIN_NOTE_CHARS = 20

/** The ticket tables MAM renders, both on the list page plus above the create
 * form. Null when this is not one of those pages. */
export function readTicketSections(doc: Document): TicketSection[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main || !/ticket/i.test(doc.title + (main.textContent ?? ''))) return null
  const sections: TicketSection[] = []
  for (const table of main.querySelectorAll('table.tickTable')) {
    let title = 'Tickets'
    for (let n: Element | null = table.previousElementSibling; n; n = n.previousElementSibling) {
      if (/^H[1-4]$/.test(n.tagName)) { title = n.textContent?.replace(/\s+/g, ' ').trim() || title; break }
    }
    const tickets: Ticket[] = []
    for (const tr of table.querySelectorAll('tr')) {
      const tds = tr.querySelectorAll(':scope > td')
      if (tds.length < 4) continue
      const lastCell = tds[3]
      const byEl = lastCell?.querySelector<HTMLElement>('span, a[href^="/u/"]')
      tickets.push({
        category: (tds[0]?.textContent ?? '').split('=>').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean),
        added: dateOf(tds[1]?.textContent ?? null),
        status: (tds[2]?.textContent ?? '').replace(/\s+/g, ' ').trim(),
        lastUpdate: dateOf(lastCell?.textContent ?? null),
        lastBy: byEl?.textContent?.trim() || null,
        lastByColor: byEl instanceof HTMLElement ? byEl.style.color || null : null,
        href: tr.querySelector<HTMLAnchorElement>('a[href*="/ticket.php/ticket/"]')?.getAttribute('href') ?? null,
      })
    }
    sections.push({ title, tickets })
  }
  // Page recognized as the ticket list even when every section is empty.
  if (!sections.length && !main.querySelector('a[href*="newTicket"]')) return null
  return sections
}

/** One ticket, in the list plus in the strip above the create form. The topic
 * is the headline; the path plus the dates are context under it. */
export function TicketRow({ t }: { t: Ticket }) {
  const { state, asks } = splitStatus(t.status)
  const leaf = t.category.at(-1) ?? 'Ticket'
  const parents = t.category.slice(0, -1).join(' › ')
  // The subject leads, the path sits behind it as context plus the state gets
  // the one strong color on the row.
  const inner = (
    <>
      <ItemContent className="gap-0">
        <ItemTitle className="max-w-full gap-2">
          <span className="font-display truncate text-14-5 font-semibold">{leaf}</span>
          {parents && <span className="truncate text-11-5 font-normal text-muted-foreground">{parents}</span>}
        </ItemTitle>
        <ItemDescription className="pt-1 text-12">
          {t.added && (
            <>opened <span title={utcTitle(t.added)}>{relTime(t.added)}</span></>
          )}
          {t.lastUpdate && (
            <>{t.added && ' · '}last reply <span title={utcTitle(t.lastUpdate)}>{relTime(t.lastUpdate)}</span>
              {t.lastBy && <> by <UserLink name={t.lastBy} color={t.lastByColor} /></>}
            </>
          )}
          {asks && <span className="text-warn"> · {asks}</span>}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <Badge variant="secondary" className={cn('font-medium', statusTone(t.status))} title={t.status}>
          {state}
        </Badge>
        <ChevronRight className="size-4 text-muted-foreground/60 transition-transform group-hover/item:translate-x-0.5" />
      </ItemActions>
    </>
  )
  return t.href ? (
    <Item asChild size="sm" className="rounded-none px-6 py-3.5">
      <a href={t.href}>{inner}</a>
    </Item>
  ) : (
    <Item size="sm" className="rounded-none px-6 py-3.5">{inner}</Item>
  )
}

export function TicketsView(props: PageProps) {
  const sections = useMemo(() => readTicketSections(document), [])
  // Landing here means a ticket went out, so the parked draft is spent.
  useEffect(clearTicketDraft, [])
  if (!sections) return <LegacyView {...props} />

  const total = sections.reduce((n, s) => n + s.tickets.length, 0)
  const filled = sections.filter((s) => s.tickets.length > 0)
  const newTicket = (
    <Button asChild size="sm" className="h-8 text-12-5">
      <a href="/ticket.php/newTicket"><TicketPlus /> New ticket</a>
    </Button>
  )

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <PageHeader
        title="Tickets"
        sub={total > 0 ? `${total} ticket${total === 1 ? '' : 's'} between you and the staff` : 'Your private line to the staff'}
        action={total > 0 ? newTicket : undefined}
      />

      <Card className="gap-0 py-0">
        <CardContent className="grid px-0 py-0">
          {total === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><LifeBuoy /></EmptyMedia>
                <EmptyTitle>No tickets yet</EmptyTitle>
                <EmptyDescription>
                  A ticket is a private conversation with the staff. Use one for anything a forum post
                  cannot fix: an account change, a torrent that is wrong or a rule you want explained.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>{newTicket}</EmptyContent>
            </Empty>
          ) : (
            filled.map((s) => (
              <div key={s.title} className="grid divide-y">
                {filled.length > 1 && (
                  <div className="flex items-center gap-2 border-b bg-muted/40 px-6 py-2 text-11 font-semibold tracking-wide text-muted-foreground uppercase">
                    {s.title}
                    <span className="font-normal tabular-nums">{s.tickets.length}</span>
                  </div>
                )}
                {s.tickets.map((t, i) => <TicketRow key={i} t={t} />)}
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/* ------------------------- Ticket detail (conversation) ------------------------- */

interface TicketMessage {
  author: string
  uid: string | null
  href: string | null
  at: string | null
  bodyHtml: string
}
interface TicketDetail {
  category: string[]
  statusNote: string | null
  /** MAM's line about adding more later, printed loose after the status note. */
  addNote: string | null
  messages: TicketMessage[]
  reply: { textarea: HTMLTextAreaElement; form: HTMLFormElement; submitLabel: string } | null
}

function extractDetail(doc: Document): TicketDetail | null {
  const main = doc.querySelector('#mainBody')
  if (!main || !main.querySelector('.tickSec')) return null
  const messages: TicketMessage[] = []
  for (const sec of main.querySelectorAll('.tickSec')) {
    const head = sec.querySelector('.tickSecHead')
    const a = head?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    messages.push({
      author: a?.textContent?.trim() ?? 'unknown',
      uid: a?.getAttribute('href')?.match(/\/u\/(\d+)/)?.[1] ?? null,
      href: a?.getAttribute('href') ?? null,
      at: head?.textContent?.match(/added\s+([\d-]+ [\d:]+)/)?.[1] ?? null,
      bodyHtml: cleanHtml(sec.querySelector('.tickSecMes')) ?? '',
    })
  }
  const form = main.querySelector<HTMLFormElement>('#tickReply')
  const textarea = form?.querySelector('textarea') ?? null
  const submit = form?.querySelector<HTMLInputElement>('input[type="submit"]')
  const heads = [...main.querySelectorAll(':scope > h2')].map((h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '')
  const statusNote = heads.find((t) => !/=>/.test(t) && t.length > MIN_NOTE_CHARS) ?? null
  const category = (heads.find((t) => /=>/.test(t)) ?? '').split('=>').map((s) => s.trim()).filter(Boolean)
  // MAM prints this one loose between the status heading plus the form, so it
  // reaches no element of its own.
  const addNote = [...main.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .find((t) => t.length > MIN_NOTE_CHARS) ?? null

  return {
    category,
    statusNote,
    addNote,
    messages,
    reply: form && textarea ? { textarea, form, submitLabel: submit?.value || 'Reply' } : null,
  }
}

export function TicketDetailView(props: PageProps) {
  const data = useMemo(() => extractDetail(document), [])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const boxRef = useRef<HTMLTextAreaElement>(null)
  useEffect(clearTicketDraft, [])
  if (!data) return <LegacyView {...props} />

  const me = props.page.user.uid != null ? String(props.page.user.uid) : null
  const isMine = (m: TicketMessage) =>
    me && m.uid ? m.uid === me : m.author === props.page.user.name

  function send() {
    if (!data?.reply) return
    if (!draft.trim()) {
      toast.warning('Write a reply first.')
      boxRef.current?.focus()
      return
    }
    data.reply.textarea.value = draft
    setSending(true)
    if (!submitGuarded(data.reply.form, findSubmitter(data.reply.form))) setSending(false)
  }

  const leaf = data.category.at(-1) ?? 'Ticket'
  const parents = data.category.slice(0, -1).join(' › ')

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <PageHeader
        title={leaf}
        sub={parents || undefined}
        action={
          <Button asChild variant="outline" size="sm" className="h-8 text-12-5">
            <a href="/ticket.php/myTickets"><ArrowLeft /> All tickets</a>
          </Button>
        }
      />

      {data.statusNote && (
        <div className="flex items-start gap-2.5 text-12-5">
          <span aria-hidden className="mt-[6px] size-2 shrink-0 rounded-full bg-warn" />
          <span className="text-muted-foreground">{data.statusNote}</span>
        </div>
      )}

      <Conversation label="Ticket conversation" startKey={`m${data.messages.length - 1}`}>
        {data.messages.map((m, i) => (
          <ConversationBubble
            key={i}
            author={m.author}
            href={m.href}
            at={m.at}
            mine={!!isMine(m)}
            navKey={`m${i}`}
            position={i + 1}
            total={data.messages.length}
            badge={!isMine(m) && <Badge variant="secondary" className="text-9-5">staff</Badge>}
          >
            <RichHtml html={m.bodyHtml} className="text-13-5" />
          </ConversationBubble>
        ))}
      </Conversation>

      {data.reply ? (
        <Card className="py-0">
          <CardContent className="grid gap-2.5 py-4">
            {data.addNote && <p className="text-12 text-muted-foreground">{data.addNote}</p>}
            <Textarea
              ref={boxRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={sending}
              aria-label="Your reply"
              placeholder="Anything else staff should know."
              className="min-h-40 text-13-5"
            />
            <div className="flex justify-end">
              <Button onClick={send} disabled={sending}>
                {sending ? <><Spinner /> Sending…</> : <><Send /> {data.reply.submitLabel}</>}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground">This ticket is closed.</p>
      )}
    </div>
  )
}
