import { useMemo, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

interface Hunt { date: string; name: string; href: string }

function extract(doc: Document): Hunt[] | null {
  const main = doc.querySelector('#mainBody')
  const table = main?.querySelector('table')
  if (!main || !table) return null
  const hunts: Hunt[] = []
  for (const tr of table.querySelectorAll('tbody tr, tr')) {
    const a = tr.querySelector<HTMLAnchorElement>('a[href*="hunt"]')
    const date = tr.querySelector('td')?.textContent?.trim() ?? ''
    if (a && a.textContent?.trim()) hunts.push({ date, name: a.textContent.trim(), href: a.getAttribute('href') ?? '#' })
  }
  return hunts.length ? hunts : null
}

export function HuntsView(props: PageProps) {
  const hunts = useMemo(() => extract(document), [])
  const [q, setQ] = useState('')
  if (!hunts) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const shown = needle ? hunts.filter((h) => h.name.toLowerCase().includes(needle)) : hunts

  return (
    <div className="grid gap-5">
      <PageHeader title="Treasure hunts" sub={`${hunts.length} hunts have run across the library.`} />
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a hunt…" className="pl-9" />
      </div>
      <Card className="gap-0 py-0">
        <CardContent className="grid px-0 py-1">
          {shown.map((h) => (
            <a key={h.href} href={h.href} className="flex items-center justify-between gap-4 px-6 py-3 transition-colors hover:bg-accent/50">
              <span className="flex min-w-0 items-center gap-2.5">
                <Sparkles className="size-3.5 shrink-0 text-brand" />
                <span className="truncate text-[13.5px] font-medium">{h.name}</span>
              </span>
              <span className="shrink-0 font-mono text-[12px] tabular-nums text-muted-foreground">{h.date}</span>
            </a>
          ))}
          {shown.length === 0 && <p className="px-6 py-10 text-center text-sm text-muted-foreground">No hunt matches “{q.trim()}”.</p>}
        </CardContent>
      </Card>
    </div>
  )
}
