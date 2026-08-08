import { useMemo } from 'react'
import { Lock, Pin } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractBoard } from '@/lib/extract/forum'
import { LegacyView } from '@/app/pages/legacy'
import { Crumbs, PageHeader, Pager, UserLink } from '@/app/shell/bits'
import { fmtInt, relTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

function TopicRow({ t }: { t: NonNullable<ReturnType<typeof extractBoard>>['topics'][number] }) {
  return (
    <TableRow className={t.sticky ? 'bg-brand-soft/40' : undefined}>
      <TableCell className="whitespace-normal">
        <div className="flex items-start gap-2">
          {t.hasNew && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-fill" title="new posts" />}
          <div className="min-w-0 max-w-[64ch]">
            <div className="flex flex-wrap items-center gap-1.5">
              {t.sticky && <Pin className="size-3.5 shrink-0 text-brand" />}
              {t.locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
              <a href={t.href} className="font-display text-[14px] font-medium leading-snug hover:underline">{t.title}</a>
            </div>
            {(t.author || t.pages.length > 0) && (
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
                {t.author && <span>by <UserLink name={t.author} color={t.authorColor} /></span>}
                {t.author && t.pages.length > 0 && <span aria-hidden>·</span>}
                {t.pages.map((p) => (
                  <a key={p.href} href={p.href} className="rounded border px-1.5 py-0.5 text-[10.5px] font-medium hover:bg-accent/50">
                    {p.label}
                  </a>
                ))}
              </div>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-[12px] tabular-nums text-muted-foreground">
        <div className="text-foreground">{fmtInt(t.replies)} replies</div>
        <div className="mt-1">{fmtInt(t.views)} views</div>
      </TableCell>
      <TableCell className="text-[12px] text-muted-foreground">
        <a href={t.last.href ?? '#'} className="block hover:underline">{relTime(t.last.at)}</a>
        by <UserLink name={t.last.by} color={t.last.byColor} />
      </TableCell>
    </TableRow>
  )
}

export function ForumBoardView(props: PageProps) {
  const data = useMemo(() => extractBoard(document), [])
  if (!data) return <LegacyView {...props} />
  const boardName = data.crumbs[data.crumbs.length - 1]?.name ?? 'Board'

  return (
    <div className="grid gap-4">
      <Crumbs items={data.crumbs} />
      <PageHeader
        title={boardName}
        action={
          <div className="flex flex-wrap gap-1.5">
            {data.actions.map((a) => (
              <Button
                key={a.href}
                asChild
                variant={/new topic/i.test(a.label) ? 'default' : 'outline'}
                size="sm"
                className="h-8 text-[12.5px]"
              >
                <a href={a.href}>{a.label}</a>
              </Button>
            ))}
          </div>
        }
      />
      <Pager pages={data.pages} />
      <Card className="overflow-hidden py-0">
        <Table className="[&_td]:py-4 [&_td]:align-top [&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Topic</TableHead>
              <TableHead className="w-32 text-right">Activity</TableHead>
              <TableHead className="w-44">Last post</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.topics.length > 0 ? (
              data.topics.map((t) => <TopicRow key={t.href} t={t} />)
            ) : (
              <TableRow>
                <TableCell colSpan={3} className="py-12 text-center text-sm text-muted-foreground">No topics in this forum yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
      <Pager pages={data.pages} />
    </div>
  )
}
