import { useMemo, useState } from 'react'
import { BookOpen, Search } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractFreeleech } from '@/lib/extract/freeleech'
import { coverUrl } from '@/lib/mam-api'
import { Book } from '@/components/book'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export function FreeleechView(props: PageProps) {
  const data = useMemo(() => extractFreeleech(document), [])
  const [q, setQ] = useState('')
  if (!data) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const groups = data.groups
    .map((g) => ({
      ...g,
      items: needle
        ? g.items.filter((i) => (i.title + ' ' + (i.author ?? '') + ' ' + i.cats.map((c) => c.name).join(' ')).toLowerCase().includes(needle))
        : g.items,
    }))
    .filter((g) => g.items.length > 0)
  const total = data.groups.reduce((n, g) => n + g.items.length, 0)
  const shown = groups.reduce((n, g) => n + g.items.length, 0)

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Freeleech picks"
        sub={data.heading ?? undefined}
        action={
          data.periods.length > 0 && (
            <Select
              defaultValue={data.periods.find((p) => p.selected)?.value ?? data.periods[0]?.value}
              onValueChange={(v) => location.assign(`/freeleech.php?past=${v}`)}
            >
              <SelectTrigger size="sm" className="h-9 w-auto"><SelectValue /></SelectTrigger>
              <SelectContent align="end" className="max-h-72">
                {data.periods.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        }
      />
      {data.seedNote && <p className="text-[12.5px] text-muted-foreground">{data.seedNote}</p>}

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Filter ${total.toLocaleString()} picks…`} className="pl-9" />
      </div>
      {needle && <p className="text-[12px] text-muted-foreground">{shown.toLocaleString()} of {total.toLocaleString()} picks match</p>}

      {groups.map((g) => (
        <Card key={g.key} className="gap-0 py-0">
          <CardHeader className="!py-3">
            <CardTitle>{g.label} <span className="ml-1 text-[12px] font-normal text-muted-foreground">{g.items.length}</span></CardTitle>
          </CardHeader>
          <CardContent className="grid gap-x-6 px-4 py-3 sm:grid-cols-2 xl:grid-cols-3">
            {g.items.map((i) => (
              <a key={i.tid} href={`/t/${i.tid}`} className="group flex gap-2.5 rounded-md px-2 py-1.5 hover:bg-accent/50">
                <Book
                  poster={coverUrl(Number(i.tid))}
                  title={i.title}
                  size="mini"
                  plain
                  className="w-12 shrink-0"
                />
                <span className="min-w-0">
                  <span className="font-display block truncate text-[13px] font-medium group-hover:underline">{i.title}</span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1">
                    {i.author && <span className="truncate text-[11.5px] text-muted-foreground">{i.author}</span>}
                    {i.language && <Badge variant="outline" className="h-4 px-1 text-[9.5px]">{i.language}</Badge>}
                    {i.cats.slice(0, 2).map((c) => (
                      <Badge key={c.name} variant="secondary" className="h-4 px-1 text-[9.5px] font-normal">{c.name}</Badge>
                    ))}
                  </span>
                </span>
              </a>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
