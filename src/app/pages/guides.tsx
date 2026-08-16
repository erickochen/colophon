import { useMemo, useState } from 'react'
import {
  Archive, ArrowUpRight, BookOpen, Compass, Gauge, MonitorDown, Search, Upload, Wifi,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { FilterPill, FilterPillList, FilterSearch } from '@/components/filters'
import { Tabs, TabsContent } from '@/components/ui/tabs'

interface Guide { title: string; href: string }
interface GuideCat { key: string; name: string; guides: Guide[] }

const CAT_ICONS: { test: RegExp; icon: ComponentType<{ className?: string }> }[] = [
  { test: /client/i, icon: MonitorDown },
  { test: /connect/i, icon: Wifi },
  { test: /optim|speed|perf/i, icon: Gauge },
  { test: /upload/i, icon: Upload },
  { test: /legacy|old/i, icon: Archive },
  { test: /site|account/i, icon: Compass },
]
const catIcon = (name: string) => CAT_ICONS.find((c) => c.test.test(name))?.icon ?? BookOpen

function extract(doc: Document): GuideCat[] | null {
  const left = doc.querySelector('.guidesLeft')
  if (!left) return null
  const cats: GuideCat[] = []
  for (const node of left.children) {
    if (node.tagName === 'H3') {
      cats.push({ key: `g-${cats.length}`, name: node.textContent?.trim() ?? '', guides: [] })
    } else {
      const a = node.querySelector?.('a.guideLink')
      if (a && cats.length) {
        cats[cats.length - 1].guides.push({ title: a.textContent?.trim() ?? '', href: a.getAttribute('href') ?? '#' })
      }
    }
  }
  return cats.filter((c) => c.guides.length)
}

function GuideRows({ guides }: { guides: Guide[] }) {
  return (
    <Card className="py-0">
      <CardContent className="grid px-3 py-2">
        {guides.map((g) => (
          <a
            key={g.href}
            href={g.href}
            className="group flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13.5px] font-medium leading-snug transition-colors hover:bg-accent/50"
          >
            <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1">{g.title}</span>
            <ArrowUpRight className="mt-0.5 size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </a>
        ))}
      </CardContent>
    </Card>
  )
}

export function GuidesView(props: PageProps) {
  const cats = useMemo(() => extract(document), [])
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(cats?.[0]?.key ?? '')
  if (!cats) return <LegacyView {...props} />

  const needle = q.trim().toLowerCase()
  const total = cats.reduce((n, c) => n + c.guides.length, 0)
  const matches = needle
    ? cats.map((c) => ({ ...c, guides: c.guides.filter((g) => g.title.toLowerCase().includes(needle)) })).filter((c) => c.guides.length)
    : []
  const matchCount = matches.reduce((n, c) => n + c.guides.length, 0)

  return (
    <div className="grid gap-5">
      <PageHeader title="Guides" sub={`${total} guides across ${cats.length} topics, written by the community`} />

      <FilterSearch value={q} onChange={setQ} placeholder="Find a guide…" className="max-w-md" />

      {needle ? (
        <div className="grid max-w-3xl gap-6">
          <p className="-mt-1 text-[12.5px] text-muted-foreground">{matchCount} match{matchCount === 1 ? '' : 'es'} for “{q.trim()}”</p>
          {matches.map((c) => (
            <section key={c.key} className="grid gap-2.5">
              <h2 className="font-display text-[16px] font-semibold tracking-tight">{c.name.trim()}</h2>
              <GuideRows guides={c.guides} />
            </section>
          ))}
          {matchCount === 0 && (
            <Card><CardContent className="grid justify-items-center gap-1 py-12 text-center">
              <Search className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">No guide matches “{q.trim()}”</p>
              <Button variant="link" onClick={() => setQ('')} className="h-auto p-0 text-[12.5px] text-brand">Clear search</Button>
            </CardContent></Card>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <FilterPillList>
            {cats.map((c) => {
              const Icon = catIcon(c.name)
              return (
                <FilterPill key={c.key} value={c.key} count={c.guides.length}>
                  <Icon className="size-3.5" /> {c.name.trim()}
                </FilterPill>
              )
            })}
          </FilterPillList>
          {cats.map((c) => (
            <TabsContent key={c.key} value={c.key} className="mt-0 max-w-3xl">
              <GuideRows guides={c.guides} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
