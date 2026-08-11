import { useMemo } from 'react'
import { Mail, UserMinus, Users, UserX } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface Person {
  id: string
  name: string
  avatar: string | null
  donor: boolean
  klass: string | null
  lastSeen: string | null
  actions: { label: string; href: string }[]
}
interface FriendList { title: string; blocked: boolean; people: Person[] }

function abs(href: string): string {
  return href.startsWith('http') || href.startsWith('/') ? href : '/' + href
}

const isProfileLink = (href: string) => /userdetails\.php|\/u\//.test(href)
const SEEN_MARKER = 'Last Seen:'

// The action links share the cell with the profile, so skip their text.
function infoText(td: Element): string {
  let out = ''
  const walk = document.createTreeWalker(td, NodeFilter.SHOW_TEXT)
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const a = n.parentElement?.closest('a[href]')
    if (a && !isProfileLink(a.getAttribute('href') ?? '')) continue
    out += n.nodeValue ?? ''
  }
  return out.replace(/\s+/g, ' ').trim()
}

function parseCell(td: Element): Person | null {
  const a = td.querySelector<HTMLAnchorElement>('a[href*="userdetails.php?id="], a[href^="/u/"]')
  if (!a) return null
  const id = a.getAttribute('href')?.match(/(?:id=|\/u\/)(\d+)/)?.[1] ?? ''
  const name = a.querySelector('b')?.textContent?.trim() || a.textContent?.trim() || ''
  if (!name) return null
  const img = td.querySelector<HTMLImageElement>('img[src*="avatar"]')
  const src = img?.getAttribute('src') ?? null
  const avatar = src && !/default_avatar/.test(src) ? src : null
  const donor = !!td.querySelector('img[alt="Donor"], img[title="Donor"]')
  const actions = [...td.querySelectorAll<HTMLAnchorElement>('a[href]')]
    .filter((x) => !isProfileLink(x.getAttribute('href') ?? ''))
    .map((x) => ({ label: x.textContent?.trim() ?? '', href: abs(x.getAttribute('href') ?? '#') }))
    .filter((x) => x.label)
  const cellText = infoText(td)
  const at = cellText.toLowerCase().lastIndexOf(SEEN_MARKER.toLowerCase())
  const head = at < 0 ? cellText : cellText.slice(0, at)
  const klass = head.match(/\(([^()]+)\)\s*$/)?.[1]?.trim() ?? null
  const lastSeen = at < 0 ? null : cellText.slice(at + SEEN_MARKER.length).trim() || null
  return { id, name, avatar, donor, klass, lastSeen, actions }
}

function extract(doc: Document): FriendList[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const lists: FriendList[] = []
  for (const block of main.querySelectorAll('.blockCon')) {
    const title = block.querySelector('.blockHeadCon h4')?.textContent?.trim()
    if (!title || !/list/i.test(title)) continue
    const people: Person[] = []
    for (const td of block.querySelectorAll('td.bottom')) {
      const p = parseCell(td)
      if (p) people.push(p)
    }
    lists.push({ title, blocked: /block/i.test(title), people })
  }
  return lists.length ? lists : null
}

function actionIcon(label: string) {
  if (/pm|message/i.test(label)) return <Mail className="size-3.5" />
  return <UserMinus className="size-3.5" />
}

function PersonCard({ p }: { p: Person }) {
  return (
    <Card className="py-0">
      <CardContent className="flex items-start gap-3 py-4">
        <a href={`/u/${p.id}`} className="shrink-0">
          <Avatar className="size-12 rounded-lg">
            {p.avatar && <AvatarImage src={p.avatar} alt="" />}
            <AvatarFallback className="rounded-lg text-[13px] font-semibold">{initials(p.name)}</AvatarFallback>
          </Avatar>
        </a>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <a href={`/u/${p.id}`} className="truncate text-[14px] font-semibold hover:underline">{p.name}</a>
            {p.donor && <span title="Donor" className="text-[12px] text-warn">★</span>}
          </div>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            {p.klass && <Badge variant="secondary" className="text-[10.5px]">{p.klass}</Badge>}
            {p.lastSeen && <span className="text-[11.5px] text-muted-foreground">Seen {p.lastSeen}</span>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {p.actions.map((a) => (
              <Button key={a.href} asChild size="sm" variant="outline" className="h-7 text-[12px]">
                <a href={a.href}>{actionIcon(a.label)} {a.label}</a>
              </Button>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export function FriendsView(props: PageProps) {
  const lists = useMemo(() => extract(document), [])
  if (!lists) return <LegacyView {...props} />

  return (
    <div className="grid gap-6">
      <PageHeader title="Friends" sub="The people you follow and the ones you would rather not hear from." />
      {lists.map((list) => (
        <section key={list.title} className="grid gap-3">
          <h2 className="font-display flex items-center gap-2 text-[15px] font-semibold">
            {list.blocked ? <UserX className="size-4 text-muted-foreground" /> : <Users className="size-4 text-brand" />}
            {list.blocked ? 'Blocked' : 'Friends'}
            <span className="text-[13px] font-normal text-muted-foreground">{list.people.length}</span>
          </h2>
          {list.people.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {list.people.map((p) => <PersonCard key={p.id || p.name} p={p} />)}
            </div>
          ) : (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              {list.blocked ? 'You have not blocked anyone.' : 'No friends yet. Add members from their profile.'}
            </CardContent></Card>
          )}
        </section>
      ))}
    </div>
  )
}
