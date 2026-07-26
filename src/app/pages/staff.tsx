import { useMemo } from 'react'
import { LifeBuoy, ShieldCheck } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface StaffMember { name: string; uid: string; flag: string | null; country: string | null }
interface StaffGroup { role: string; members: StaffMember[] }

function extract(doc: Document): StaffGroup[] | null {
  const main = doc.querySelector('#mainBody')
  const table = main?.querySelector('table.main')
  if (!main || !table) return null
  const groups: StaffGroup[] = []
  let cur: StaffGroup | null = null
  for (const tr of table.querySelectorAll('tr')) {
    const links = [...tr.querySelectorAll<HTMLAnchorElement>('a[href^="/u/"]')]
    const bold = tr.querySelector('b')
    if (bold && links.length === 0) {
      const role = bold.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (role) { cur = { role, members: [] }; groups.push(cur) }
      continue
    }
    if (!links.length) continue
    if (!cur) { cur = { role: 'Staff', members: [] }; groups.push(cur) }
    for (const a of links) {
      const td = a.closest('td')
      const flag = td?.previousElementSibling?.querySelector('img')
      cur.members.push({
        name: a.textContent?.trim() ?? '',
        uid: a.getAttribute('href')?.match(/\/u\/(\d+)/)?.[1] ?? '',
        flag: flag?.getAttribute('src') ?? null,
        country: flag?.getAttribute('alt') ?? null,
      })
    }
  }
  return groups.filter((g) => g.members.length)
}

export function StaffView(props: PageProps) {
  const groups = useMemo(() => extract(document), [])
  if (!groups) return <LegacyView {...props} />

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Staff"
        sub="The people keeping the library running. Please reach them through the ticket system, not directly."
        action={
          <Button asChild size="sm">
            <a href="/ticket.php/myTickets"><LifeBuoy /> Contact staff</a>
          </Button>
        }
      />
      {groups.map((g) => (
        <section key={g.role} className="grid gap-3">
          <h2 className="font-display flex items-center gap-2 text-[15px] font-semibold">
            <ShieldCheck className="size-4 text-brand" /> {g.role}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {g.members.map((m) => (
              <Card key={m.uid + m.name} className="py-0 transition-colors hover:border-brand/40">
                <CardContent className="flex items-center gap-3 py-3.5">
                  <a href={`/u/${m.uid}`} className="shrink-0">
                    <Avatar className="size-10 rounded-lg">
                      <AvatarFallback className="rounded-lg bg-brand-soft text-[12px] font-semibold text-accent-foreground">{initials(m.name)}</AvatarFallback>
                    </Avatar>
                  </a>
                  <div className="min-w-0 flex-1">
                    <a href={`/u/${m.uid}`} className="block truncate text-[14px] font-semibold hover:underline">{m.name}</a>
                    <span className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
                      {m.flag && <img src={m.flag} alt={m.country ?? ''} className="h-3 rounded-[2px]" />}
                      {m.country}
                    </span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
