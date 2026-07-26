import { useMemo, useState } from 'react'
import { CheckCheck, Eye, MessagesSquare } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, Pager, UserLink } from '@/app/shell/bits'
import { fmtInt, relTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { toast } from 'sonner'

interface TopicItem {
  title: string
  href: string
  board: { name: string; href: string } | null
  isNew: boolean
  views: string | null
  author: { name: string; href: string } | null
  postedAt: string | null
  ago: string | null
  clearEl: HTMLInputElement | null
}
interface ListData {
  title: string
  topics: TopicItem[]
  pages: { label: string; href: string; current: boolean }[]
  prevHref: string | null
  nextHref: string | null
  clearForm: HTMLFormElement | null
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() || null

function extract(doc: Document): ListData | null {
  const main = doc.querySelector('#mainBody')
  const table = main?.querySelector('table')
  if (!main || !table) return null

  const topics: TopicItem[] = []
  for (const tr of table.querySelectorAll('tr')) {
    const link = tr.querySelector<HTMLAnchorElement>('a[href^="/f/t/"]')
    if (!link) continue
    const tds = [...tr.querySelectorAll(':scope > td')]
    const boardA = tr.querySelector<HTMLAnchorElement>('a[href^="/f/b/"]')
    const authorA = tr.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    // "Today" layout: Topic | Views | Author | Posted at. Unread layout has no such columns.
    const timeCell = tds.find((td) => /\d{4}-\d{2}-\d{2}/.test(td.textContent ?? ''))
    const timeText = timeCell?.textContent ?? ''
    const viewsCell = tds.find((td, i) => i > 0 && /^\s*[\d,]+\s*$/.test(td.textContent ?? ''))
    topics.push({
      title: clean(link.textContent) ?? '',
      href: link.getAttribute('href') ?? '#',
      board: boardA ? { name: clean(boardA.textContent) ?? '', href: boardA.getAttribute('href') ?? '#' } : null,
      isNew: !!tr.querySelector('img[alt*="new post" i]'),
      views: clean(viewsCell?.textContent),
      author: authorA ? { name: clean(authorA.textContent) ?? '', href: authorA.getAttribute('href') ?? '#' } : null,
      postedAt: timeText.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
      ago: clean(timeText.replace(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/, '')),
      clearEl: tr.querySelector<HTMLInputElement>('input[name="topic_id[]"]'),
    })
  }
  if (!topics.length) return null

  const pages: ListData['pages'] = []
  let prevHref: string | null = null
  let nextHref: string | null = null
  const seen = new Set<string>()
  for (const a of main.querySelectorAll<HTMLAnchorElement>('a[href*="action="]')) {
    const label = clean(a.textContent) ?? ''
    const href = a.getAttribute('href') ?? '#'
    if (/prev/i.test(label)) prevHref = href
    else if (/next/i.test(label)) nextHref = href
    else if (/^\d[\d\s-]*$/.test(label) && !seen.has(label)) {
      seen.add(label)
      pages.push({ label, href, current: false })
    }
  }

  return {
    title: clean(main.querySelector('h1')?.textContent) ?? clean(doc.title.split('|')[0]) ?? 'Topics',
    topics,
    pages: pages.slice(0, 12),
    prevHref,
    nextHref,
    clearForm: main.querySelector<HTMLFormElement>('form'),
  }
}

function TopicRow({ t, selectable, checked, onToggle }: {
  t: TopicItem
  selectable: boolean
  checked: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 transition-colors hover:bg-accent/40">
      {selectable && <Checkbox checked={checked} onCheckedChange={onToggle} className="shrink-0" />}
      <div className="min-w-0 flex-1">
        <a href={t.href} className="flex items-center gap-2">
          {t.isNew && <span className="size-2 shrink-0 rounded-full bg-brand" title="New posts" />}
          <span className="truncate text-[13.5px] font-medium hover:underline">{t.title}</span>
        </a>
        <div className="flex flex-wrap items-center gap-x-2 pt-0.5 text-[12px] text-muted-foreground">
          {t.board && <a href={t.board.href} className="hover:underline">{t.board.name}</a>}
          {t.author && (
            <>
              <span>·</span>
              <span>by <UserLink name={t.author.name} href={t.author.href} /></span>
            </>
          )}
          {t.postedAt && <><span>·</span><span title={t.postedAt}>{relTime(t.postedAt)}</span></>}
        </div>
      </div>
      {t.views && (
        <Badge variant="secondary" className="shrink-0 gap-1 text-[11px]">
          <Eye className="size-3" /> {fmtInt(Number(t.views.replace(/,/g, '')))}
        </Badge>
      )}
    </div>
  )
}

function ForumList({ props, emptyText }: { props: PageProps; emptyText: string }) {
  const data = useMemo(() => extract(document), [])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  if (!data) return <LegacyView {...props} />

  const selectable = data.topics.some((t) => t.clearEl)

  function toggle(i: number) {
    setSelected((s) => {
      const next = new Set(s)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  function clearSelected() {
    if (!data?.clearForm || selected.size === 0) {
      toast.warning('Select the topics you want to mark as read first.')
      return
    }
    for (const [i, t] of data.topics.entries()) {
      if (t.clearEl) t.clearEl.checked = selected.has(i)
    }
    data.clearForm.requestSubmit()
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title={data.title}
        sub={`${data.topics.length} topic${data.topics.length === 1 ? '' : 's'} on this page`}
        action={
          selectable && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8"
                onClick={() => setSelected(new Set(data.topics.map((_, i) => i).filter((i) => data.topics[i].clearEl)))}
              >
                Select all
              </Button>
              <Button size="sm" className="h-8" onClick={clearSelected}>
                <CheckCheck /> Mark read{selected.size > 0 ? ` (${selected.size})` : ''}
              </Button>
            </div>
          )
        }
      />

      <Pager pages={data.pages} prevHref={data.prevHref} nextHref={data.nextHref} />

      {data.topics.length > 0 ? (
        <Card className="gap-0 py-0">
          <CardContent className="px-0 py-1">
            {data.topics.map((t, i) => (
              <TopicRow key={i} t={t} selectable={selectable} checked={selected.has(i)} onToggle={() => toggle(i)} />
            ))}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
                <EmptyTitle>Nothing here</EmptyTitle>
                <EmptyDescription>{emptyText}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      )}

      <Pager pages={data.pages} prevHref={data.prevHref} nextHref={data.nextHref} />
    </div>
  )
}

export function UnreadTopicsView(props: PageProps) {
  return <ForumList props={props} emptyText="You are all caught up. No unread topics." />
}

export function DailyPostsView(props: PageProps) {
  return <ForumList props={props} emptyText="Nobody posted in the last 24 hours." />
}
