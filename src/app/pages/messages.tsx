import { useMemo, useState } from 'react'
import { Inbox, Mail, MailOpen, PenLine, Send, Trash2 } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractMailbox, type PmMessage } from '@/lib/extract/messages'
import { stashReply } from '@/app/pages/compose-message'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, Pager, RichHtml, UserLink } from '@/app/shell/bits'
import { relTime, initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

export function MessagesView(props: PageProps) {
  const data = useMemo(() => extractMailbox(document), [])
  const [readIds, setReadIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState<string | null>(data?.messages[0]?.id ?? null)
  if (!data) return <LegacyView {...props} />

  // MAM exposes only an unread COUNT (shell pmCount), not a per-message flag.
  // The newest N inbox messages are the unread ones (new arrive on top, get
  // marked read when opened). Opening one here clears its dot immediately.
  const unreadCount = data.box === 'inbox' ? props.page.pmCount : 0
  const isUnread = (m: PmMessage, i: number) => i < unreadCount && !readIds.has(m.id)
  const openMessage = (m: PmMessage) => {
    setSelectedId(m.id)
    if (!readIds.has(m.id)) setReadIds((s) => new Set(s).add(m.id))
  }
  const liveUnread = data.messages.filter((m, i) => isUnread(m, i)).length

  const selected: PmMessage | undefined = data.messages.find((m) => m.id === selectedId)

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Messages"
        sub={liveUnread > 0 ? `${liveUnread} unread · ${data.messages.length} on this page` : `${data.messages.length} on this page`}
        action={
          <Tabs value={data.box}>
            <TabsList className="h-9">
              <TabsTrigger value="inbox" asChild>
                <a href="/messages.php?action=viewmailbox&box=1">
                  <Inbox className="size-3.5" /> Inbox
                  {liveUnread > 0 && (
                    <Badge className="ml-1 h-4 min-w-4 justify-center rounded-full bg-brand px-1 text-[10px] text-primary-foreground">{liveUnread}</Badge>
                  )}
                </a>
              </TabsTrigger>
              <TabsTrigger value="sent" asChild>
                <a href="/messages.php?action=viewmailbox&box=-1"><Send className="size-3.5" /> Sent</a>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        }
      />

      {data.messages.length === 0 ? (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MailOpen /></EmptyMedia>
                <EmptyTitle>No messages here</EmptyTitle>
                <EmptyDescription>Messages from other members and the system will land in this box.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <Card className="overflow-hidden py-0">
          <div className="grid lg:grid-cols-[340px_minmax(0,1fr)]">
            <div className="max-h-[70vh] overflow-y-auto border-b lg:border-b-0 lg:border-r">
              {data.messages.map((m, i) => {
                const unread = isUnread(m, i)
                return (
                  <button
                    key={m.id}
                    onClick={() => openMessage(m)}
                    className={cn(
                      'grid w-full grid-cols-[10px_minmax(0,1fr)] items-start gap-x-2 gap-y-0.5 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-accent/40',
                      m.id === selectedId ? 'bg-brand-soft/60' : unread && 'bg-brand-soft/25'
                    )}
                  >
                    <span className="pt-1.5">
                      {unread && <span className="block size-2 rounded-full bg-brand" title="Unread" />}
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-baseline justify-between gap-2">
                        <UserLink name={m.from?.name ?? 'system'} color={m.from?.color} className={cn('truncate text-[12.5px]', unread && 'font-semibold')} />
                        <span className="shrink-0 text-[11px] text-muted-foreground">{relTime(m.date)}</span>
                      </span>
                      <span className={cn('font-display block truncate text-[13.5px]', unread ? 'font-semibold text-foreground' : 'font-medium text-muted-foreground')}>{m.subject}</span>
                    </span>
                  </button>
                )
              })}
            </div>
            <div className="min-h-[380px]">
              {selected ? (
                <div className="grid content-start gap-4 px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <Avatar className="size-9 rounded-lg">
                        <AvatarFallback className="rounded-lg text-[12px]">{initials(selected.from?.name ?? 'SY')}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-[14px] font-semibold">{selected.subject}</div>
                        <div className="text-[12px] text-muted-foreground">
                          from <UserLink name={selected.from?.name ?? 'system'} href={selected.from?.href} color={selected.from?.color} /> · {selected.date}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1.5">
                      {selected.from?.href && data.box === 'inbox' && (
                        <Button
                          size="sm"
                          className="h-8"
                          onClick={() => {
                            const receiver = selected.from!.href!.split('/').pop()!
                            stashReply({
                              receiver,
                              subject: selected.subject,
                              fromName: selected.from!.name,
                              fromColor: selected.from!.color,
                              fromHref: selected.from!.href,
                              date: selected.date,
                              bodyHtml: selected.bodyHtml,
                            })
                            location.href = `/sendmessage.php?receiver=${receiver}`
                          }}
                        >
                          <PenLine /> Reply
                        </Button>
                      )}
                      {selected.deleteHref && (
                        <Button asChild variant="outline" size="sm" className="h-8 text-destructive hover:text-destructive">
                          <a href={selected.deleteHref}><Trash2 /> Delete</a>
                        </Button>
                      )}
                    </div>
                  </div>
                  {selected.bodyHtml ? (
                    <RichHtml html={selected.bodyHtml} />
                  ) : (
                    <p className="text-sm text-muted-foreground">This message has no body.</p>
                  )}
                </div>
              ) : (
                <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
                  <Mail className="mr-2 size-4" /> Select a message to read it
                </div>
              )}
            </div>
          </div>
        </Card>
      )}
      <Pager pages={data.pages} />
    </div>
  )
}
