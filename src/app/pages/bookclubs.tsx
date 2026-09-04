import { useMemo } from 'react'
import { ArrowUpRight, BookOpen, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { coverCandidates } from '@/lib/mam-api'
import { useFeature } from '@/lib/settings'
import { useSnatchIndex } from '@/lib/snatch-index'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { Book } from '@/components/book'
import { SnatchMark, snatchMarked } from '@/components/status-badge'
import { BlurFade } from '@/components/ui/blur-fade'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

interface Club { name: string; href: string | null; desc: string; inactive: boolean }
interface Pick { tid: number | null; title: string; author: string; format: string; href: string }
interface PickCat { name: string; picks: Pick[] }
interface ClubsData { clubs: Club[]; cats: PickCat[]; suggestHref: string | null }

function parseClubs(block: Element): Club[] {
  const clubs: Club[] = []
  let cur: Club | null = null
  const walk = (el: Element) => {
    for (const n of el.childNodes) {
      if (n.nodeType === 1) {
        const e = n as HTMLElement
        if (e.matches('a.altlink_blue')) {
          const name = (e.textContent ?? '').replace(/\s+/g, ' ').replace(/:\s*$/, '').trim()
          cur = { name, href: e.getAttribute('href'), desc: '', inactive: false }
          clubs.push(cur)
        } else {
          walk(e)
        }
      } else if (n.nodeType === 3 && cur) {
        cur.desc += n.nodeValue ?? ''
      }
    }
  }
  walk(block)
  for (const c of clubs) {
    c.desc = c.desc.replace(/\s+/g, ' ').replace(/^[\s:.–-]+/, '').trim()
    c.inactive = /inactive/i.test(c.name) || /^\s*\(?currently inactive/i.test(c.desc)
    c.name = c.name.replace(/^\d+\.\s*/, '').replace(/\(currently inactive\)/i, '').trim()
  }
  return clubs.filter((c) => c.name.length > 2)
}

function parsePicks(block: Element): PickCat[] {
  const cats: PickCat[] = []
  let cur: PickCat | null = null
  for (const el of block.querySelectorAll<HTMLElement>('a.biglink, a.fLeech')) {
    if (el.classList.contains('biglink')) {
      cur = { name: (el.textContent ?? '').replace(/\s+/g, ' ').trim(), picks: [] }
      cats.push(cur)
    } else if (cur) {
      const href = el.getAttribute('href') ?? ''
      const tid = Number(href.match(/\/t\/(\d+)/)?.[1]) || null
      const author = el.querySelector('.green')?.textContent?.replace(/^By:\s*/i, '').trim() ?? ''
      const format = el.querySelector('.copyright')?.textContent?.trim() ?? ''
      const clone = el.cloneNode(true) as HTMLElement
      clone.querySelectorAll('.green, .copyright').forEach((x) => x.remove())
      const title = (clone.textContent ?? '').replace(/\(\s*\)/g, '').replace(/\s+/g, ' ').trim()
      if (title) cur.picks.push({ tid, title, author, format, href })
    }
  }
  return cats.filter((c) => c.picks.length)
}

function extract(doc: Document): ClubsData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const blocks = [...main.querySelectorAll('.blockCon')]
  const clubsBlock = blocks.find((b) => /club/i.test(b.querySelector('.blockHeadCon')?.textContent ?? '')) ?? blocks[0]
  const picksBlock = blocks.find((b) => /pick/i.test(b.querySelector('.blockHeadCon')?.textContent ?? '')) ?? blocks[1]
  if (!clubsBlock && !picksBlock) return null
  const clubs = clubsBlock ? parseClubs(clubsBlock.querySelector('.blockBodyCon') ?? clubsBlock) : []
  const cats = picksBlock ? parsePicks(picksBlock) : []
  const suggestHref = main.querySelector<HTMLAnchorElement>('a[href*="/f/t/72126"], a[href*="/f/t/"]')?.getAttribute('href') ?? null
  if (!clubs.length && !cats.length) return null
  return { clubs, cats, suggestHref }
}

function PickCard({ p, pile }: { p: Pick; pile?: string | null }) {
  return (
    <a href={p.href} className="group grid content-end gap-2">
      <span className="relative block transition-[translate,box-shadow] duration-350 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-y-1 motion-reduce:transition-none">
        <Book
          poster={p.tid ? coverCandidates(p.tid) : null}
          title={p.title}
          author={p.author}
          plain
          size="shelf"
          className="group-hover:shadow-book-lift"
        />
        {p.format && (
          <span className="absolute right-1 top-1 z-3 rounded bg-black/55 px-1 py-0.5 font-mono text-8-5 font-semibold uppercase tracking-wide text-white backdrop-blur-[2px]">{p.format}</span>
        )}
        <span className="absolute bottom-1.5 left-1.5 z-3 flex items-center gap-1 rounded-full bg-card/90 px-1.5 py-0.5 text-8-5 font-semibold tracking-wide text-ok">
          <Sparkles className="size-2.5" /> FL
        </span>
      </span>
      <div className="grid gap-0.5">
        <span className="font-display line-clamp-2 text-13 font-medium leading-snug group-hover:underline">{p.title}</span>
        {p.author && <span className="line-clamp-1 text-11 text-muted-foreground">{p.author}</span>}
        {/* A pick you already hold, since the point of this page is finding one
            you have not read. */}
        {snatchMarked(pile) && (
          <span className="mt-0.5 flex">
            <SnatchMark pile={pile} dense />
          </span>
        )}
      </div>
    </a>
  )
}

export function BookClubsView(props: PageProps) {
  const data = useMemo(() => extract(document), [])
  const [checkOn] = useFeature('snatchCheck')
  // A pick carries a torrent id plus nothing else, so the snatch piles are the
  // only side that knows whether this member already holds it.
  const { index: snatches } = useSnatchIndex(checkOn && data != null)
  if (!data) return <LegacyView {...props} />

  return (
    <div className="grid gap-6">
      <PageHeader
        title="Book clubs"
        sub={`${data.clubs.length} clubs reading together. This month's picks are all freeleech and refresh on the 1st.`}
      />

      {data.clubs.length > 0 && (
        <section className="grid gap-3">
          <h2 className="font-display text-15 font-semibold">The clubs</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {data.clubs.map((c, i) => (
              <BlurFade key={c.href ?? c.name} delay={0.03 * i} direction="up" offset={8}>
                <Card className="h-full py-0 transition-colors hover:border-brand/40">
                  <CardContent className="flex h-full flex-col gap-1.5 py-5">
                    <div className="flex items-start justify-between gap-2">
                      <a href={c.href ?? '#'} className="font-display text-15 font-semibold leading-snug hover:text-brand hover:underline">
                        {c.name}
                      </a>
                      {c.inactive ? (
                        <Badge variant="outline" className="shrink-0 text-10 text-muted-foreground">inactive</Badge>
                      ) : (
                        <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" />
                      )}
                    </div>
                    {c.desc && <p className="line-clamp-4 text-12-5 leading-normal text-muted-foreground">{c.desc}</p>}
                  </CardContent>
                </Card>
              </BlurFade>
            ))}
          </div>
        </section>
      )}

      {data.cats.length > 0 && (
        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-display text-15 font-semibold">This month's picks</h2>
            {data.suggestHref && (
              <a href={data.suggestHref} className="inline-flex items-center gap-1 text-12-5 font-medium text-brand hover:underline">
                Suggestion &amp; discussion threads <ArrowUpRight className="size-3.5" />
              </a>
            )}
          </div>
          {data.cats.map((cat) => (
            <div key={cat.name} className="grid gap-2.5">
              <h3 className="flex items-center gap-2 text-13-5 font-semibold text-muted-foreground">
                <BookOpen className="size-3.5" /> {cat.name}
              </h3>
              <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8">
                {cat.picks.map((p, i) => (
                  <PickCard key={p.href + i} p={p} pile={p.tid ? snatches?.have.get(p.tid) ?? null : null} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
