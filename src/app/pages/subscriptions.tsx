import { useMemo, useReducer } from 'react'
import { BellOff, Bookmark } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { toast } from '@/components/ui/toast'

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
