import { useMemo } from 'react'
import { Medal, Trophy } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Card, CardContent } from '@/components/ui/card'
import { mutedUserColor } from '@/lib/colors'

interface Winner { name: string; uid: string; color: string | null }
interface Tier { place: string; amount: string | null; winners: Winner[] }
interface WinnersData { title: string; entrants: string | null; sweetening: string | null; tiers: Tier[] }

function extract(doc: Document): WinnersData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const title = main.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() ?? 'Lotto winners'
  const text = (main.textContent ?? '').replace(/\s+/g, ' ')
  if (!/winner|lotter|place/i.test(text)) return null
  // Read the "N people entered …" line from its own text node: the h1 ("… 2026-29")
  // and this line concatenate with no separator, which would fuse the digits.
  let line = ''
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (/people entered/i.test(n.nodeValue ?? '')) { line = (n.nodeValue ?? '').replace(/\s+/g, ' '); break }
  }
  const entrants = line.match(/([\d,]+)\s+people entered/i)?.[1] ?? null
  const sweetening = line.match(/sweetening of\s*([\d,]+\s*G[iB]+)/i)?.[1] ?? null
  const tiers: Tier[] = []
  let cur: Tier | null = null
  for (const el of main.querySelectorAll('h3, span, a[href^="/u/"]')) {
    if (el.tagName === 'H3') {
      cur = { place: el.textContent?.replace(/\s+/g, ' ').trim() ?? '', amount: null, winners: [] }
      tiers.push(cur)
    } else if (cur && el.tagName === 'SPAN' && !cur.amount) {
      const t = el.textContent?.trim() ?? ''
      if (/\d\s*G[iB]/i.test(t)) cur.amount = t
    } else if (cur && el.tagName === 'A') {
      cur.winners.push({
        name: el.textContent?.trim() ?? '',
        uid: el.getAttribute('href')?.match(/\/u\/(\d+)/)?.[1] ?? '',
        color: (el as HTMLElement).style.color || null,
      })
    }
  }
  const clean = tiers.filter((t) => t.winners.length)
  if (!clean.length) return null
  return { title, entrants, sweetening, tiers: clean }
}

const MEDAL = ['oklch(0.78 0.13 85)', 'oklch(0.62 0.02 260)', 'oklch(0.55 0.11 50)']

export function LottoWinnersView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-5">
      <PageHeader
        title="Lotto winners"
        sub={[data.title.replace(/^Results for\s*/i, ''), data.entrants && `${data.entrants} entrants`, data.sweetening && `${data.sweetening} sweetened`].filter(Boolean).join(' · ')}
      />
      <div className="grid gap-4">
        {data.tiers.map((t, i) => (
          <Card key={t.place} className="gap-0 overflow-hidden py-0">
            <CardContent className="grid gap-3 py-5 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-start">
              <div className="flex items-center gap-2.5">
                {i < 3 ? <Medal className="size-6" style={{ color: MEDAL[i] }} /> : <Trophy className="size-5 text-muted-foreground" />}
                <div>
                  <div className="font-display text-[15px] font-semibold capitalize">{t.place.toLowerCase()}</div>
                  {t.amount && <div className="font-mono text-[13px] font-medium text-ok">{t.amount}</div>}
                </div>
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {t.winners.map((w, j) => (
                  <a key={w.uid + j} href={`/u/${w.uid}`} className="text-[13px] font-medium hover:underline" style={{ color: mutedUserColor(w.color) }}>
                    {w.name}
                  </a>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
