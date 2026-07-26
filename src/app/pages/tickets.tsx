import { useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, LifeBuoy, Send, TicketPlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { initials, relTime } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { BBComposer } from '@/components/bb-composer'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Ticket {
  category: string[]
  added: string | null
  status: string
  lastUpdate: string | null
  lastBy: string | null
  lastByColor: string | null
  href: string | null
}
interface TicketSection { title: string; tickets: Ticket[] }

function statusTone(status: string): string {
  const s = status.toLowerCase()
  if (/^open/.test(s)) return 'bg-ok/15 text-ok'
  if (/pending|waiting|respond/.test(s)) return 'bg-warn/15 text-warn'
  if (/closed|resolved/.test(s)) return 'bg-muted text-muted-foreground'
  return 'bg-brand-soft text-accent-foreground'
}

const dateOf = (s: string | null) => s?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null

function extract(doc: Document): TicketSection[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main || !/ticket/i.test(doc.title + (main.textContent ?? ''))) return null
  const sections: TicketSection[] = []
  for (const table of main.querySelectorAll('table.tickTable')) {
    // Section title = nearest preceding h1-h4 ("In progress tickets", "Closed tickets", ...)
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

function TicketRow({ t }: { t: Ticket }) {
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          {t.category.map((c, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-[10px] text-muted-foreground">›</span>}
              <span className={cn('text-[13.5px]', i === t.category.length - 1 ? 'font-semibold' : 'text-muted-foreground')}>{c}</span>
            </span>
          ))}
        </div>
        <div className="pt-1 text-[12px] text-muted-foreground">
          Opened {t.added ? relTime(t.added) : '–'}
          {t.lastUpdate && (
            <>
              {' · '}last reply {relTime(t.lastUpdate)}
              {t.lastBy && <> by <span className="font-medium" style={{ color: t.lastByColor ?? undefined }}>{t.lastBy}</span></>}
            </>
          )}
        </div>
      </div>
      <Badge variant="secondary" className={cn('shrink-0 text-[11px]', statusTone(t.status))}>{t.status}</Badge>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </>
  )
  const cls = 'group flex items-center gap-3 px-6 py-3.5 transition-colors'
  return t.href
    ? <a href={t.href} className={cn(cls, 'hover:bg-accent/40')}>{inner}</a>
    : <div className={cls}>{inner}</div>
}

export function TicketsView(props: PageProps) {
  const sections = useMemo(() => extract(document), [])
  if (!sections) return <LegacyView {...props} />

  const total = sections.reduce((n, s) => n + s.tickets.length, 0)

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader
        title="Staff tickets"
        sub={total > 0 ? `${total} ticket${total === 1 ? '' : 's'} between you and the staff` : 'Your direct line to the staff'}
        action={
          <Button asChild size="sm">
            <a href="/ticket.php/newTicket"><TicketPlus /> New ticket</a>
          </Button>
        }
      />
      {sections.map((s) => (
        <Card key={s.title} className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle className="flex items-center gap-2">
              {s.title} <span className="text-[12px] font-normal text-muted-foreground">{s.tickets.length}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0 py-0">
            {s.tickets.length > 0 ? (
              s.tickets.map((t, i) => <TicketRow key={i} t={t} />)
            ) : (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">Nothing here.</p>
            )}
          </CardContent>
        </Card>
      ))}
      {total === 0 && (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><LifeBuoy /></EmptyMedia>
                <EmptyTitle>No open tickets</EmptyTitle>
                <EmptyDescription>Questions about your account, a torrent or the rules? Staff answers through tickets.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/* ------------------------- Ticket detail (conversation) ------------------------- */

interface TicketMessage {
  author: string
  href: string | null
  at: string | null
  bodyHtml: string
}
interface TicketDetail {
  category: string[]
  statusNote: string | null
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
      href: a?.getAttribute('href') ?? null,
      at: head?.textContent?.match(/added\s+([\d-]+ [\d:]+)/)?.[1] ?? null,
      bodyHtml: cleanHtml(sec.querySelector('.tickSecMes')) ?? '',
    })
  }
  const form = main.querySelector<HTMLFormElement>('#tickReply')
  const textarea = form?.querySelector('textarea') ?? null
  const submit = form?.querySelector<HTMLInputElement>('input[type="submit"]')
  const statusNote = [...main.querySelectorAll(':scope > h2')]
    .map((h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .find((t) => !/=>/.test(t) && t.length > 20) ?? null
  const category = ([...main.querySelectorAll(':scope > h2')]
    .map((h) => h.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .find((t) => /=>/.test(t)) ?? '')
    .split('=>').map((s) => s.trim()).filter(Boolean)
  return {
    category,
    statusNote,
    messages,
    reply: form && textarea ? { textarea, form, submitLabel: submit?.value || 'Reply' } : null,
  }
}

export function TicketDetailView(props: PageProps) {
  const data = useMemo(() => extractDetail(document), [])
  const [draft, setDraft] = useState('')
  if (!data) return <LegacyView {...props} />
  const me = props.page.user.name

  function send() {
    if (!data?.reply) return
    if (!draft.trim()) {
      toast.warning('Write a message first.')
      return
    }
    data.reply.textarea.value = draft
    data.reply.form.requestSubmit()
  }

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5">
      <PageHeader
        title="Staff ticket"
        sub={
          <span className="flex flex-wrap items-center gap-1.5">
            {data.category.map((c, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-[10px]">›</span>}
                {c}
              </span>
            ))}
          </span>
        }
        action={
          <Button asChild variant="outline" size="sm" className="h-8">
            <a href="/ticket.php/myTickets"><ArrowLeft /> All tickets</a>
          </Button>
        }
      />

      <div className="grid gap-3">
        {data.messages.map((m, i) => {
          const mine = m.author === me
          return (
            <div key={i} className={cn('flex gap-3', mine && 'flex-row-reverse')}>
              <Avatar className="size-9 shrink-0 rounded-lg">
                <AvatarFallback className={cn('rounded-lg text-[11px] font-semibold', mine ? 'bg-primary text-primary-foreground' : 'bg-brand-soft text-accent-foreground')}>
                  {initials(m.author)}
                </AvatarFallback>
              </Avatar>
              <div className={cn('min-w-0 max-w-[85%] flex-1', mine && 'flex flex-col items-end')}>
                <div className={cn('flex items-baseline gap-2 pb-1', mine && 'flex-row-reverse')}>
                  {m.href ? (
                    <a href={m.href} className="text-[12.5px] font-semibold hover:underline">{m.author}</a>
                  ) : (
                    <span className="text-[12.5px] font-semibold">{m.author}</span>
                  )}
                  {!mine && <Badge variant="secondary" className="text-[9.5px]">staff</Badge>}
                  <span className="text-[11px] text-muted-foreground" title={m.at ?? ''}>{relTime(m.at)}</span>
                </div>
                <div className={cn('rounded-xl px-4 py-3', mine ? 'rounded-tr-sm bg-brand-soft/50' : 'rounded-tl-sm bg-card')}>
                  <RichHtml html={m.bodyHtml} className="text-[13.5px]" />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {data.statusNote && (
        <p className="text-center text-[12px] italic text-muted-foreground">{data.statusNote}</p>
      )}

      {data.reply ? (
        <Card className="py-0">
          <CardContent className="grid gap-2.5 py-4">
            <BBComposer value={draft} onChange={setDraft} placeholder="Write a reply to the staff…" minHeightClass="min-h-24" />
            <div className="flex justify-end">
              <Button onClick={send}><Send /> {data.reply.submitLabel}</Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <p className="text-center text-sm text-muted-foreground">This ticket is closed.</p>
      )}
    </div>
  )
}
