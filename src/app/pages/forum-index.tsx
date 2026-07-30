import { useMemo } from 'react'
import { CheckCheck, Clock3, Lock, Search, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractForumIndex } from '@/lib/extract/forum'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, UserLink } from '@/app/shell/bits'
import { relTime, fmtInt } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const ACTIONS = [
  { label: 'Search forums', href: '/f/s', icon: Search },
  { label: 'New posts', href: '/forums.php?action=viewunread', icon: Sparkles },
  { label: "Today's posts", href: '/forums.php?action=getdaily', icon: Clock3 },
  { label: 'Mark all read', href: '/f/?catchup', icon: CheckCheck },
]

export function ForumIndexView(props: PageProps) {
  const cats = useMemo(() => extractForumIndex(document), [])
  if (!cats.length) return <LegacyView {...props} />

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Forum"
        sub="Conversations across the library"
        action={
          <div className="flex flex-wrap gap-1.5">
            {ACTIONS.map((a) => (
              <Button key={a.href} asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
                <a href={a.href}><a.icon /> {a.label}</a>
              </Button>
            ))}
          </div>
        }
      />

      {cats.map((cat) => (
        <Card key={cat.name} className="gap-0 py-0">
          <CardHeader className="border-b !py-3.5">
            <CardTitle>
              {cat.href ? <a href={cat.href} className="hover:underline">{cat.name}</a> : cat.name}
            </CardTitle>
          </CardHeader>
          <CardContent className="grid divide-y divide-border px-0 py-0" role="list">
            {cat.boards.map((b) => (
              <div key={b.href} role="listitem" className="grid items-start gap-y-1 px-6 py-3.5 transition-colors hover:bg-accent/40 focus-within:bg-accent/40 lg:grid-cols-[minmax(0,1fr)_110px_minmax(180px,260px)] lg:gap-x-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {b.hasNew && <span className="size-2 shrink-0 rounded-full bg-brand" title="new posts" />}
                    <a href={b.href} className="font-display truncate text-[14.5px] font-semibold hover:underline">{b.name}</a>
                    {b.locked && <Lock className="size-3.5 shrink-0 text-muted-foreground" />}
                  </div>
                  {b.desc && <p className="mt-0.5 line-clamp-1 text-[12.5px] text-muted-foreground">{b.desc}</p>}
                  {b.subBoards.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {b.subBoards.map((s) => (
                        <Badge key={s.href} variant="secondary" asChild className="font-normal">
                          <a href={s.href}>
                            {s.hasNew && <span className="mr-1 size-1.5 rounded-full bg-brand" />}
                            {s.name}
                          </a>
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 font-mono text-[11.5px] tabular-nums text-muted-foreground lg:hidden">
                    {fmtInt(b.topics)} topics · {fmtInt(b.posts)} posts
                    {b.last.at && <> · {relTime(b.last.at)}</>}
                  </div>
                </div>
                <div className="hidden text-right font-mono text-[12px] tabular-nums text-muted-foreground lg:block">
                  {fmtInt(b.topics)} topics
                  <br />
                  {fmtInt(b.posts)} posts
                </div>
                <div className="hidden min-w-0 text-[12px] leading-snug text-muted-foreground lg:block">
                  {b.last.topic ? (
                    <>
                      <a href={b.last.href ?? '#'} className="line-clamp-1 font-medium text-foreground hover:underline">{b.last.topic}</a>
                      <span>
                        by <UserLink name={b.last.by} color={b.last.byColor} /> · {relTime(b.last.at)}
                      </span>
                    </>
                  ) : (
                    <span>–</span>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
