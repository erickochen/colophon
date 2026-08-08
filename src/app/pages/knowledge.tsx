import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Sparkles } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { extractFaq, extractRules, type KbSection } from '@/lib/extract/knowledge'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { FilterSearch } from '@/components/filters'
import { Kbd } from '@/components/ui/kbd'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

const RICH =
  'text-[13.5px] leading-relaxed text-foreground/85 [overflow-wrap:anywhere] [&_a]:text-brand [&_a]:underline [&_h1]:my-2 [&_h1]:font-display [&_h1]:text-base [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:font-semibold [&_li]:ml-4 [&_ol]:list-decimal [&_ol]:my-2 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_table]:my-2 [&_td]:px-2 [&_td]:py-1 [&_th]:px-2 [&_th]:py-1 [&_ul]:list-disc [&_ul]:my-2'

interface KbItemK { key: string; title: string; bodyHtml: string; meta: string | null; updated: boolean; text: string }
interface KbSectionK { key: string; title: string; items: KbItemK[] }
function keyed(sections: KbSection[]): KbSectionK[] {
  return sections.map((s, i) => ({
    key: `sec-${i}`,
    title: s.title,
    items: s.items.map((it, j) => ({ key: `sec-${i}-${j}`, title: it.title, bodyHtml: it.bodyHtml, meta: it.meta, updated: it.updated, text: it.text })),
  }))
}

/** Compact tab label from a long category title. Keeps the leading number and
 * for "Upload Rules – Specific MUSIC TORRENT Category Guidelines"-style names
 * keeps only the distinctive part ("7 Music"). The full title still shows as the
 * section heading and as the tab's tooltip, so nothing is lost. */
function shortLabel(title: string): string {
  const m = title.match(/^(\d+)\s+(.*)$/)
  const num = m ? m[1] : ''
  let rest = m ? m[2] : title
  if (/[–-]/.test(rest)) {
    const after = rest.split(/[–-]/).slice(1).join(' ').trim()
    if (after) rest = after
    rest = rest.replace(/\bspecific\b/gi, '').replace(/\btorrent\b/gi, '').replace(/\bcategory\b/gi, '').replace(/\bguidelines?\b/gi, '').replace(/\bupload(ing)?\b/gi, '')
  }
  rest = rest
    .replace(/\brules?\b/gi, '')
    .replace(/\s+for\s+.*$/i, '')
    .replace(/\s*&\s*comment.*$/i, '')
    .replace(/\bsection\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  // Title-case SHOUTING words (MUSIC -> Music) but leave short acronyms (IRC, VPN).
  rest = rest.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase())
  if (!rest) rest = (m ? m[2] : title).split(/\s+/)[0]
  const label = (num ? `${num} ` : '') + rest
  return label.length > 26 ? label.slice(0, 24).trimEnd() + '…' : label
}

function Highlight({ text, needle }: { text: string; needle: string }) {
  if (!needle) return <>{text}</>
  const i = text.toLowerCase().indexOf(needle)
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/20 px-0.5 text-inherit">{text.slice(i, i + needle.length)}</mark>
      {text.slice(i + needle.length)}
    </>
  )
}

/** One category's items, rendered either as readable rule articles or as a FAQ
 * accordion. Shared by the per-tab view and the search-results view. */
function SectionBody({ section, mode, needle }: { section: KbSectionK; mode: 'doc' | 'faq'; needle: string }) {
  if (mode === 'doc') {
    return (
      <Card className="py-0">
        <CardContent className="divide-y divide-border/70 px-6 py-0">
          {section.items.map((it) => (
            <article key={it.key} id={it.key} className="scroll-mt-24 py-5 first:pt-6 last:pb-6">
              <div className="mb-1.5 flex flex-wrap items-center gap-2">
                <h3 className="text-[14.5px] font-semibold leading-snug"><Highlight text={it.title} needle={needle} /></h3>
                {it.updated && (
                  <Badge className="gap-1 bg-brand-soft text-[10px] text-accent-foreground" variant="secondary"><Sparkles className="size-2.5" /> updated</Badge>
                )}
                {it.meta && <span className="text-[11px] text-muted-foreground">· updated {it.meta}</span>}
              </div>
              <RichHtml html={it.bodyHtml} className={RICH} />
            </article>
          ))}
        </CardContent>
      </Card>
    )
  }
  return (
    <Card className="py-0">
      <CardContent className="px-6 py-0">
        <Accordion className="w-full" defaultValue={needle && section.items[0] ? [section.items[0].key] : undefined}>
          {section.items.map((it) => (
            <AccordionItem key={it.key} value={it.key} id={it.key} className="scroll-mt-24">
              <AccordionTrigger className="py-4 text-left text-[14px] font-medium hover:no-underline">
                <Highlight text={it.title} needle={needle} />
              </AccordionTrigger>
              <AccordionContent><RichHtml html={it.bodyHtml} className={RICH} /></AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </CardContent>
    </Card>
  )
}

function KnowledgeBase({ title, sub, sections: raw, mode }: { title: string; sub: string; sections: KbSection[]; mode: 'doc' | 'faq' }) {
  const sections = useMemo(() => keyed(raw), [raw])
  const [q, setQ] = useState('')
  const [tab, setTab] = useState(sections[0]?.key ?? '')
  const searchRef = useRef<HTMLInputElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const needle = q.trim().toLowerCase()

  const filtered = useMemo(() => {
    if (!needle) return []
    return sections
      .map((s) => ({ ...s, items: s.items.filter((it) => it.text.includes(needle)) }))
      .filter((s) => s.items.length > 0)
  }, [sections, needle])
  const totalMatches = filtered.reduce((n, s) => n + s.items.length, 0)

  const updated = useMemo(
    () => sections.flatMap((s) => s.items.filter((it) => it.updated).map((it) => ({ sec: s.key, it }))),
    [sections]
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && !el.isContentEditable) {
        e.preventDefault()
        searchRef.current?.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  function openUpdated(secKey: string, itemKey: string) {
    setQ('')
    setTab(secKey)
    // Two frames so the newly-activated tab content mounts before we scroll.
    requestAnimationFrame(() =>
      requestAnimationFrame(() => rootRef.current?.querySelector(`#${CSS.escape(itemKey)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
    )
  }

  return (
    <div ref={rootRef} className="grid gap-5">
      <PageHeader title={title} sub={sub} />

      <FilterSearch
        value={q}
        onChange={setQ}
        inputRef={searchRef}
        placeholder={`Search ${title.toLowerCase()}…`}
        hint={<Kbd>/</Kbd>}
        className="max-w-xl"
      />

      {!needle && updated.length > 0 && (
        <div className="-mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
          <span className="flex items-center gap-1 font-medium text-brand"><Sparkles className="size-3.5" /> Recently updated</span>
          {updated.map(({ sec, it }) => (
            <button key={it.key} onClick={() => openUpdated(sec, it.key)} className="text-muted-foreground underline-offset-2 hover:text-foreground hover:underline">{it.title}</button>
          ))}
        </div>
      )}

      {needle ? (
        <div className="grid gap-6">
          <p className="-mt-1 text-[12.5px] text-muted-foreground">{totalMatches} match{totalMatches === 1 ? '' : 'es'} for “{q.trim()}”</p>
          {filtered.map((s) => (
            <section key={s.key} className="grid gap-2.5">
              <h2 className="font-display text-[16px] font-semibold tracking-tight">{s.title}</h2>
              <SectionBody section={s} mode={mode} needle={needle} />
            </section>
          ))}
          {totalMatches === 0 && (
            <Card><CardContent className="grid justify-items-center gap-1 py-12 text-center">
              <Search className="size-5 text-muted-foreground" />
              <p className="text-sm font-medium">Nothing matches “{q.trim()}”</p>
              <button onClick={() => setQ('')} className="text-[12.5px] text-brand hover:underline">Clear search</button>
            </CardContent></Card>
          )}
        </div>
      ) : (
        <Tabs value={tab} onValueChange={setTab} className="gap-5">
          <TabsList className="w-full flex-wrap justify-start gap-1.5 bg-transparent p-0 group-data-[orientation=horizontal]/tabs:h-auto">
            {sections.map((s) => (
              <TabsTrigger
                key={s.key}
                value={s.key}
                title={s.title}
                className="h-auto flex-none rounded-full border border-border bg-card px-3 py-1.5 text-[12.5px] text-muted-foreground shadow-none transition-colors hover:bg-accent/50 data-active:border-brand/40 data-active:bg-brand-soft data-active:font-medium data-active:text-accent-foreground data-active:shadow-none"
              >
                {shortLabel(s.title)}
                <span className="ml-1.5 rounded-full bg-muted px-1.5 text-[10px] tabular-nums">{s.items.length}</span>
              </TabsTrigger>
            ))}
          </TabsList>
          {sections.map((s) => (
            <TabsContent key={s.key} value={s.key} className="mt-0 max-w-3xl">
              <div className="mb-3 flex items-baseline gap-2">
                <h2 className="font-display text-[18px] font-semibold tracking-tight">{s.title}</h2>
                <span className="text-[12px] tabular-nums text-muted-foreground">{s.items.length}</span>
              </div>
              <SectionBody section={s} mode={mode} needle="" />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}

export function RulesView(props: PageProps) {
  const sections = useMemo(() => extractRules(document), [])
  if (!sections.length) return <LegacyView {...props} />
  const rules = sections.reduce((n, s) => n + s.items.length, 0)
  return <KnowledgeBase title="Rules" sub={`${rules} rules across ${sections.length} categories`} sections={sections} mode="doc" />
}

export function FaqView(props: PageProps) {
  const sections = useMemo(() => extractFaq(document), [])
  if (!sections.length) return <LegacyView {...props} />
  const qs = sections.reduce((n, s) => n + s.items.length, 0)
  return <KnowledgeBase title="FAQ" sub={`${qs} answers across ${sections.length} topics`} sections={sections} mode="faq" />
}
