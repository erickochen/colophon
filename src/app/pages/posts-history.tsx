import { useMemo } from 'react'
import { MessagesSquare } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, POST_SPACING, RichHtml } from '@/app/shell/bits'
import { localDateTime, utcTitle } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface Post {
  date: string
  rel: string | null
  forum: string | null
  topic: { name: string; href: string } | null
  postHref: string | null
  postNum: string | null
  bodyHtml: string
}

function extract(doc: Document): Post[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const posts: Post[] = []
  for (const t of main.querySelectorAll('table.coltable')) {
    const head = t.querySelector('.colhead2')
    const body = t.querySelector('.clearalt4')
    if (!head || !body) continue
    const links = [...head.querySelectorAll<HTMLAnchorElement>('a')]
    const href = (a: HTMLAnchorElement | undefined) => a?.getAttribute('href') ?? ''
    const postA = links.find((a) => /\/p\//.test(href(a)))
    const topicA = links.find((a) => a !== postA && /\/f\/t\//.test(href(a)))
    const forumA = links.find((a) => a !== postA && a !== topicA)
    const headText = head.textContent?.replace(/\s+/g, ' ').trim() ?? ''
    const date = headText.split('--')[0].replace(/\([^)]*\)/, '').trim()
    posts.push({
      date,
      rel: headText.match(/\(([^)]+ago)\)/)?.[1] ?? null,
      forum: forumA?.textContent?.replace(/\s+/g, ' ').trim() || null,
      topic: topicA ? { name: topicA.textContent?.replace(/\s+/g, ' ').trim() ?? '', href: topicA.getAttribute('href') ?? '#' } : null,
      postHref: postA?.getAttribute('href') ?? null,
      postNum: postA?.textContent?.trim() ?? null,
      bodyHtml: cleanHtml(body) ?? '',
    })
  }
  return posts.length ? posts : null
}

export function PostsHistoryView(props: PageProps) {
  const posts = useMemo(() => extract(document), [])
  if (!posts) return <LegacyView {...props} />

  const who = props.page.title?.replace(/^Posts?\s+history(\s+for)?\s*/i, '').trim()

  return (
    <div className="grid gap-5">
      <PageHeader title="Post history" sub={`${posts.length} recent forum post${posts.length === 1 ? '' : 's'}${who ? ` by ${who}` : ''}`} />
      <div className="grid gap-3">
        {posts.map((p, i) => (
          <Card key={i} className="gap-0 py-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 bg-muted/30 px-5 py-2.5 text-12-5">
              <MessagesSquare className="size-3.5 shrink-0 text-brand" />
              {p.topic ? (
                <a href={p.topic.href} className="font-medium hover:underline">{p.topic.name}</a>
              ) : (
                <span className="font-medium">Post</span>
              )}
              {p.forum && <Badge variant="secondary" className="text-10-5">{p.forum}</Badge>}
              <span className="ml-auto flex items-center gap-2 text-muted-foreground">
                {p.postHref && <a href={p.postHref} className="font-mono hover:underline">#{p.postNum}</a>}
                <span title={utcTitle(p.date)}>{p.rel ?? localDateTime(p.date)}</span>
              </span>
            </div>
            <CardContent className="py-4">
              <RichHtml
                html={p.bodyHtml}
                className={`${POST_SPACING} text-13-5 [&_.quote]:my-1 [&_.quote]:rounded-md [&_.quote]:bg-muted [&_.quote]:px-3 [&_.quote]:py-2 [&_.quote]:text-12-5 [&_.quote_span]:text-muted-foreground [&_img]:inline`}
              />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
