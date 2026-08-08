import { useEffect, useMemo, useRef, useState } from 'react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface TocItem { id: string; text: string; level: number }

/** Reader shell shared by content pages and guides: sanitized HTML in Reading
 * Room typography with a sticky table of contents built from its headings. */
function DocReader({ title, html }: { title: string; html: string }) {
  const bodyRef = useRef<HTMLDivElement>(null)
  const [toc, setToc] = useState<TocItem[]>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const root = bodyRef.current
    if (!root) return
    const items: TocItem[] = []
    let n = 0
    for (const h of root.querySelectorAll('h1, h2, h3')) {
      const text = h.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (!text || text.length > 90) continue
      const id = h.id || h.querySelector('[id]')?.id || `doc-h-${n++}`
      h.id = id
      items.push({ id, text, level: h.tagName === 'H1' ? 1 : h.tagName === 'H2' ? 2 : 3 })
    }
    setToc(items.slice(0, 60))

    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-10% 0% -80% 0%' }
    )
    for (const i of items) {
      const el = root.querySelector(`#${CSS.escape(i.id)}`)
      if (el) obs.observe(el)
    }
    return () => obs.disconnect()
  }, [html])

  const hasToc = toc.length >= 4

  return (
    <div className="grid gap-4">
      <PageHeader title={title} />
      <div className={cn('grid items-start gap-6', hasToc ? 'xl:grid-cols-[minmax(0,1fr)_230px]' : 'max-w-3xl')}>
        <Card>
          <CardContent>
            <div ref={bodyRef}>
              <RichHtml
                html={html}
                className="[&_.blockHead]:hidden [&_.blockFoot]:hidden [&_.hideMe]:hidden [&_h1]:font-display [&_h1]:my-3 [&_h1]:scroll-mt-20 [&_h1]:text-xl [&_h1]:font-semibold [&_h2]:my-2.5 [&_h2]:scroll-mt-20 [&_h2]:text-[16px] [&_h2]:font-semibold [&_h3]:my-2 [&_h3]:scroll-mt-20 [&_h3]:text-[14.5px] [&_h3]:font-semibold [&_h4]:my-1.5 [&_h4]:font-semibold [&_summary]:cursor-pointer [&_summary]:py-1 [&_summary_h4]:inline"
              />
            </div>
          </CardContent>
        </Card>
        {hasToc && (
          <nav className="sticky top-20 hidden max-h-[calc(100vh-6rem)] overflow-y-auto pl-1 xl:block">
            <div className="pb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">On this page</div>
            <div className="grid gap-0.5">
              {toc.map((t) => (
                <a
                  key={t.id}
                  href={`#${t.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    bodyRef.current?.querySelector(`#${CSS.escape(t.id)}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                  }}
                  className={cn(
                    'rounded-md px-2 py-1 text-[12px] leading-snug transition-colors hover:text-foreground',
                    t.level === 1 ? 'pl-3 font-medium' : t.level === 2 ? 'pl-5' : 'pl-7',
                    active === t.id ? 'bg-brand-soft font-medium text-accent-foreground' : 'text-muted-foreground'
                  )}
                >
                  {t.text}
                </a>
              ))}
            </div>
          </nav>
        )}
      </div>
    </div>
  )
}

/** Reader view for pure-content pages (rules, FAQ, update notes): the original
 * #mainBody, sanitized, in Reading Room typography. */
export function DocView(props: PageProps) {
  const html = useMemo(() => cleanHtml(props.page.mainContent), [props.page.mainContent])
  if (!html) return <LegacyView {...props} />
  return <DocReader title={props.page.title || 'MyAnonaMouse'} html={html} />
}

/** A single guide. MAM ships an empty #guideBox and fetches the body over AJAX
 * (loadGuide.php), so we do the same fetch and render it as a reader. */
export function GuideView(props: PageProps) {
  const gid = useMemo(() => new URLSearchParams(location.search).get('gid'), [])
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!gid) { setError(true); return }
    fetch(`/guides/loadGuide.php?gid=${encodeURIComponent(gid)}`, { credentials: 'include' })
      .then((r) => r.text())
      .then((t) => {
        const body = new DOMParser().parseFromString(t, 'text/html').body
        setHtml(cleanHtml(body))
      })
      .catch(() => setError(true))
  }, [gid])

  if (error) return <LegacyView {...props} />
  if (html === null) {
    return (
      <div className="grid gap-4">
        <PageHeader title={props.page.title || 'Guide'} />
        <Card><CardContent className="grid gap-2 py-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-4 w-full" />)}</CardContent></Card>
      </div>
    )
  }
  if (!html) return <LegacyView {...props} />
  return <DocReader title={props.page.title || 'Guide'} html={html} />
}
