import { useMemo, useReducer } from 'react'
import { BellOff, Bookmark, CheckCheck, CheckCircle2 } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { cleanHtml } from '@/lib/sanitize'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'

interface WatchedThread {
  title: string
  href: string
  board: { name: string; href: string | null } | null
}

const tidy = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** MAM puts the board in a "Board > " span in front of the topic title. */
function readThread(link: HTMLAnchorElement, row: Element): WatchedThread {
  const tag = link.querySelector('.forumLink')
  const boardLink = row.querySelector<HTMLAnchorElement>('a[href*="/f/b/"]')
  const name = tidy(tag?.textContent).replace(/[>»]\s*$/, '').trim() || tidy(boardLink?.textContent)
  const title = tag
    ? tidy([...link.childNodes].filter((n) => n !== tag).map((n) => n.textContent).join(' '))
    : tidy(link.textContent)
  return {
    title,
    href: link.getAttribute('href') ?? '#',
    board: name ? { name, href: boardLink?.getAttribute('href') ?? null } : null,
  }
}

/** The /newPosts listing: topics on the watchlist that picked up replies.
 * The /doClean result serves the same listing under a "List cleared" h1. */
export function extractNewPosts(doc: Document) {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const heads = [...main.querySelectorAll('h1')].map((h) => h.textContent ?? '')
  if (!heads.some((t) => /watchlist/i.test(t))) return null
  const cleared = heads.some((t) => /list cleared/i.test(t))

  const threads: WatchedThread[] = []
  const rows = new Set<Element>()
  for (const link of main.querySelectorAll<HTMLAnchorElement>('a[href*="/f/t/"]')) {
    // closest('tr') can escape into MAM's page layout table, which would fold
    // every thread into one row, so only take a row that lives in the page body.
    const tr = link.closest('tr')
    const row = tr && main.contains(tr) ? tr : link.parentElement
    if (!row || rows.has(row)) continue
    rows.add(row)
    threads.push(readThread(link, row))
  }
  return {
    threads,
    cleared,
    empty: /no threads with new post/i.test(main.textContent ?? ''),
    clearHref: main.querySelector('a[href*="subscriptions.php/clean"]')?.getAttribute('href') ?? null,
    body: main.querySelector('.blockCon .blockBody .blockBodyCon'),
  }
}

export function SubscriptionNewPostsView(props: PageProps) {
  const data = useMemo(() => extractNewPosts(document), [])
  if (!data) return <LegacyView {...props} />
  const threads = data.threads

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader
        title="New posts on your watchlist"
        sub={data.cleared ? 'Notifications cleared' : 'Topics you follow that picked up replies'}
        action={
          <div className="flex flex-wrap gap-1.5">
            <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
              <a href="/forums/subscriptions.php"><Bookmark /> Manage subscriptions</a>
            </Button>
            {data.clearHref && (
              <Button asChild variant="outline" size="sm" className="h-8 text-[12.5px]">
                <a href={data.clearHref}><CheckCheck /> Clear notifications</a>
              </Button>
            )}
          </div>
        }
      />

      {threads.length > 0 ? (
        <Card className="py-0">
          <CardContent className="grid divide-y divide-border/60 px-0 py-0">
            {threads.map((t, i) => (
              <div key={i} className="grid grid-cols-1 gap-0.5 px-6 py-3">
                <a href={t.href} className="truncate text-[13.5px] font-medium hover:underline">{t.title}</a>
                {t.board && (
                  t.board.href ? (
                    <a href={t.board.href} className="w-fit text-[12px] text-muted-foreground hover:underline">
                      in {t.board.name}
                    </a>
                  ) : (
                    <span className="text-[12px] text-muted-foreground">in {t.board.name}</span>
                  )
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : data.cleared || data.empty || !data.body ? (
        <Card><CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">{data.cleared ? <CheckCircle2 className="text-ok" /> : <BellOff />}</EmptyMedia>
              <EmptyTitle>{data.cleared ? 'All caught up' : 'Nothing new'}</EmptyTitle>
              <EmptyDescription>
                {data.cleared
                  ? 'Every new-post notification is cleared. The topics stay on your watchlist.'
                  : 'None of the topics you follow have unread posts right now.'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent></Card>
      ) : (
        <Card><CardContent><RichHtml html={cleanHtml(data.body) ?? ''} /></CardContent></Card>
      )}
    </div>
  )
}

/** The /clean confirmation. The real "yes" link stays in the hidden legacy
 * DOM and gets a native click, so the request MAM sees is its own. */
export function SubscriptionCleanView(props: PageProps) {
  const confirmAnchor = useMemo(
    () => document.querySelector<HTMLAnchorElement>('#mainBody a[href*="doClean"]'),
    []
  )
  if (!confirmAnchor) return <LegacyView {...props} />

  return (
    <div className="mx-auto grid w-full max-w-xl gap-5">
      <PageHeader title="Clear watchlist notifications" sub="One click and the list starts fresh" />
      <Card>
        <CardContent className="grid gap-4">
          <p className="text-[13.5px]">
            Clear all new-post notifications? The topics stay on your watchlist. Only the new-post markers go.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => confirmAnchor.click()}>
              <CheckCheck /> Clear them
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/forums/subscriptions.php/newPosts">Keep them</a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

interface TopicSub { id: string; title: string; href: string }
interface BoardSub {
  id: string
  name: string
  section: string
  state: 'unsubscribed' | 'new-topics' | 'all-posts'
  hideFront: boolean
}

function extract(doc: Document) {
  const topics: TopicSub[] = [...doc.querySelectorAll<HTMLElement>('#topics [id^="tid"]')].map((div) => ({
    id: div.id.replace(/^tid/, ''),
    title: div.querySelector('a')?.textContent?.trim() ?? '',
    href: div.querySelector('a')?.getAttribute('href') ?? '#',
  }))

  const boards: BoardSub[] = []
  let section = ''
  for (const tr of doc.querySelectorAll('#forums tr')) {
    const th = tr.querySelector('th[colspan]')
    if (th) {
      section = th.textContent?.trim() ?? section
      continue
    }
    if (!tr.id?.startsWith('bid')) continue
    const buttons = [...tr.querySelectorAll<HTMLButtonElement>('button')]
    const disabled = buttons.find((b) => b.disabled)
    const state = disabled?.dataset.type === 'unsubscribed' || !disabled
      ? 'unsubscribed'
      : disabled.dataset.allposts === '1' ? 'all-posts' : 'new-topics'
    boards.push({
      id: tr.id,
      name: tr.querySelector('td')?.textContent?.trim() ?? '',
      section,
      state: state as BoardSub['state'],
      hideFront: tr.querySelector<HTMLInputElement>('input[data-type="hideFrontPage"]')?.checked ?? false,
    })
  }
  if (!doc.querySelector('#topics') && !doc.querySelector('#forums')) return null
  return { topics, boards }
}

export function SubscriptionsView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [, bump] = useReducer((x: number) => x + 1, 0)
  if (!data) return <LegacyView {...props} />

  function unsubscribeTopic(t: TopicSub) {
    const btn = document.querySelector<HTMLInputElement>(`#tid${CSS.escape(t.id)} input.unSubOnly`)
    if (!btn) return toast.error('Unsubscribe control not found.')
    btn.click()
    toast.success(`Unsubscribed from “${t.title}”`)
    window.setTimeout(() => location.reload(), 1200)
  }

  function setBoard(b: BoardSub, mode: 'unsubscribed' | 'new-topics' | 'all-posts') {
    const row = document.getElementById(b.id)
    const btn = mode === 'unsubscribed'
      ? row?.querySelector<HTMLButtonElement>('button[data-type="unsubscribed"]')
      : row?.querySelector<HTMLButtonElement>(`button[data-type="subscribe"][data-allposts="${mode === 'all-posts' ? 1 : 0}"]`)
    if (!btn) return toast.error('Control not found.')
    btn.click()
    b.state = mode
    bump()
    toast.success(`${b.name}: ${mode.replace('-', ' ')}`)
  }

  function toggleHide(b: BoardSub, v: boolean) {
    const cb = document.getElementById(b.id)?.querySelector<HTMLInputElement>('input[data-type="hideFrontPage"]')
    if (!cb) return toast.error('Control not found.')
    if (cb.checked !== v) cb.click()
    b.hideFront = v
    bump()
  }

  const sections = [...new Set(data.boards.map((b) => b.section))]

  return (
    <div className="grid gap-4">
      <PageHeader title="Forum subscriptions" sub="Which topics and boards keep you posted" />

      <Card className="gap-0 py-0">
        <CardHeader className="!py-3.5">
          <CardTitle className="flex items-center gap-2"><Bookmark className="size-4" /> Subscribed topics</CardTitle>
        </CardHeader>
        <CardContent className="grid px-0 py-1">
          {data.topics.length === 0 && (
            <p className="px-6 py-6 text-center text-sm text-muted-foreground">You follow no individual topics. Subscribe from any topic page.</p>
          )}
          {data.topics.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-3 px-6 py-2.5">
              <a href={t.href} className="min-w-0 truncate text-[13.5px] font-medium hover:underline">{t.title}</a>
              <Button variant="outline" size="sm" className="h-7 text-[12px]" onClick={() => unsubscribeTopic(t)}>
                <BellOff /> Unsubscribe
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {sections.map((section) => (
        <Card key={section} className="gap-0 py-0">
          <CardHeader className="!py-3.5">
            <CardTitle>{section || 'Boards'}</CardTitle>
          </CardHeader>
          <CardContent className="grid px-0 py-1">
            {data.boards.filter((b) => b.section === section).map((b) => (
              <div key={b.id} className="grid items-center gap-3 px-6 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
                <span className="truncate text-[13.5px] font-medium">{b.name}</span>
                <div className="flex rounded-lg border p-0.5">
                  {([['unsubscribed', 'Off'], ['new-topics', 'New topics'], ['all-posts', 'All posts']] as const).map(([mode, label]) => (
                    <button
                      key={mode}
                      onClick={() => setBoard(b, mode)}
                      className={
                        'rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ' +
                        (b.state === mode ? 'bg-brand-soft text-accent-foreground' : 'text-muted-foreground hover:text-foreground')
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <Label className="flex items-center gap-2 text-[12px] font-normal text-muted-foreground">
                  Hide on dashboard
                  <Switch checked={b.hideFront} onCheckedChange={(v) => toggleHide(b, v === true)} />
                </Label>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
