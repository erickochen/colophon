import { useMemo, useState } from 'react'
import { Gift, Mail, UserPlus } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { initials } from '@/lib/format'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FilterSearch } from '@/components/filters'
import { useGiftedSet } from '@/lib/giftmam'
import { mutedUserColor } from '@/lib/colors'

interface Member { uid: string; name: string; color: string | null; href: string }

function extract(doc: Document): Member[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const members = [...main.querySelectorAll<HTMLInputElement>('input[name="sendGiftTo[]"]')].map((cb) => {
    const label = cb.closest('label')
    const a = label?.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
    const span = a?.querySelector<HTMLElement>('span')
    return {
      uid: cb.value,
      name: (span?.textContent ?? a?.textContent ?? '').trim(),
      color: span?.style.color || null,
      href: a?.getAttribute('href') ?? `/u/${cb.value}`,
    }
  }).filter((m) => m.name)
  return members.length ? members : null
}

export function NewMembersView(props: PageProps) {
  const members = useMemo(() => extract(document), [])
  const [q, setQ] = useState('')
  const gifted = useGiftedSet()
  if (!members) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const shown = needle ? members.filter((m) => m.name.toLowerCase().includes(needle)) : members

  return (
    <div className="grid gap-5">
      <PageHeader title="New members" sub={`${members.length} mice joined recently. Say hello and make them feel at home.`} />

      <FilterSearch value={q} onChange={setQ} placeholder="Find a new member…" className="max-w-md" />
      {needle && <p className="-mt-2 text-[12.5px] text-muted-foreground">{shown.length} of {members.length} match</p>}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((m) => (
          <Card key={m.uid} className="group py-0 transition-colors hover:border-brand/40">
            <CardContent className="flex items-center gap-3 py-3">
              <a href={m.href} className="shrink-0">
                <Avatar className="size-10 rounded-lg">
                  <AvatarFallback className="rounded-lg bg-brand-soft text-[12px] font-semibold text-accent-foreground">{initials(m.name)}</AvatarFallback>
                </Avatar>
              </a>
              <a href={m.href} className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold hover:underline" style={{ color: mutedUserColor(m.color) }}>{m.name}</span>
                {gifted.has(m.uid) ? (
                  <span className="flex items-center gap-1 text-[11.5px] text-gifted" title="Already gifted (GiftMAM)">
                    <Gift className="size-3" /> gifted
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-[11.5px] text-muted-foreground"><UserPlus className="size-3" /> new mouse</span>
                )}
              </a>
              <Button asChild size="icon" variant="ghost" className="size-8 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                <a href={`/sendmessage.php?receiver=${m.uid}`} title={`Welcome ${m.name}`}><Mail className="size-4" /></a>
              </Button>
            </CardContent>
          </Card>
        ))}
        {shown.length === 0 && (
          <Card className="sm:col-span-2 lg:col-span-3 xl:col-span-4">
            <CardContent className="py-12 text-center text-sm text-muted-foreground">No new member matches “{q.trim()}”.</CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
