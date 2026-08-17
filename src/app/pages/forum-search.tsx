import { useMemo, useRef, useState } from 'react'
import { ChevronsUpDown, MessagesSquare, Search } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { cleanHtml } from '@/lib/sanitize'
import { relTime, utcTitle } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { FacetOptions, FilterBar, FilterFacet, FilterRow, FilterSearch, FilterSelect } from '@/components/filters'
import { mutedUserColor } from '@/lib/colors'
import { mamFetch } from '@/lib/mam-fetch'

const SEARCH_URL = 'https://cdn.myanonamouse.net/forums/json/search.php'
const PAGE_SIZE = 25

interface Opt { value: string; label: string }
interface ForumOpt { value: string; label: string; category: boolean }
interface Row {
  board: { name: string; href: string } | null
  topic: { name: string; href: string } | null
  author: { name: string; color: string | null } | null
  at: string | null
  bodyHtml: string | null
  truncated: boolean
}

/** Body-content typography for a search hit (matches RichHtml + MAM's .quote). */
const HIT_BODY =
  'text-[13px] leading-relaxed text-foreground/85 [&_.quote]:my-2 [&_.quote]:rounded-md [&_.quote]:bg-muted [&_.quote]:px-3 [&_.quote]:py-1.5 [&_.quote]:text-[12.5px] [&_.quote_span]:text-[11.5px] [&_.quote_span]:text-muted-foreground [&_hr]:my-2 [&_hr]:border-t [&_hr]:border-border'

const clean = (s: string | null | undefined) => s?.replace(/ /g, ' ').replace(/\s+/g, ' ').trim() ?? ''

/** Read the (hidden) original #searchForum for its option lists. */
function readForm(doc: Document) {
  const form = doc.querySelector('#searchForum')
  if (!form) return null
  const opts = (name: string): Opt[] =>
    [...form.querySelectorAll<HTMLOptionElement>(`select[name="${name}"] option`)].map((o) => ({ value: o.value, label: clean(o.textContent) }))
  const forums: ForumOpt[] = [...form.querySelectorAll<HTMLOptionElement>('select[name="FtS[]"] option')]
    .filter((o) => o.value !== '-1')
    .map((o) => ({ value: o.value, label: clean(o.textContent), category: /^o\d+/.test(o.value) }))
  return { searchIn: opts('searchIn'), order: opts('order'), forums }
}

function parseResults(html: string): { rows: Row[]; total: number | null } {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const total = Number((doc.body.textContent?.match(/out of\s+([\d,]+)/) ?? [])[1]?.replace(/,/g, '')) || null
  const rows: Row[] = [...doc.querySelectorAll('.row2')].map((r) => {
    const as = r.querySelectorAll('a')
    const span = r.querySelector<HTMLElement>('span[style]')
    // The matching post body follows each meta row as `.row1.forumSearchReduce`
    // (present in "Topic and Body" mode); a trailing `.forSTswap` means MAM
    // truncated it ("Show More").
    const next = r.nextElementSibling
    const bodyEl = next?.classList.contains('forumSearchReduce') ? next : null
    const truncated = !!bodyEl?.nextElementSibling?.classList.contains('forSTswap')
    // In "Topic and Body" mode the topic anchor text is "title#<postid>"; the
    // href already carries the post anchor, so drop the suffix for display.
    return {
      board: as[0] ? { name: clean(as[0].textContent), href: as[0].getAttribute('href') ?? '#' } : null,
      topic: as[1] ? { name: clean(as[1].textContent).replace(/#\d+$/, ''), href: as[1].getAttribute('href') ?? '#' } : null,
      author: span ? { name: clean(span.textContent), color: span.style.color || null } : null,
      at: (r.textContent?.match(/on\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/) ?? [])[1] ?? null,
      bodyHtml: cleanHtml(bodyEl),
      truncated,
    }
  })
  return { rows, total }
}

function ResultCard({ r }: { r: Row }) {
  const [expanded, setExpanded] = useState(false)
  const clamp = r.truncated && !expanded
  return (
    <div className="grid gap-2 px-6 py-4 transition-colors hover:bg-accent/30">
      <div className="min-w-0">
        <a href={r.topic?.href ?? '#'} className="text-[14px] font-medium leading-snug hover:text-brand hover:underline">{r.topic?.name}</a>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 pt-1 text-[12px] text-muted-foreground">
          {r.board && <a href={r.board.href}><Badge variant="secondary" className="text-[10.5px] hover:bg-secondary/80">{r.board.name}</Badge></a>}
          {r.author && <span>by <span style={{ color: mutedUserColor(r.author.color) }}>{r.author.name}</span></span>}
          {r.at && <span title={utcTitle(r.at)}>· {relTime(r.at)}</span>}
        </div>
      </div>
      {r.bodyHtml && (
        <div className={cn('rounded-lg bg-muted/40 px-3.5 py-2.5', clamp && 'max-h-32 overflow-hidden')}>
          <RichHtml html={r.bodyHtml} className={HIT_BODY} />
        </div>
      )}
      {r.truncated && (
        <Button variant="link" onClick={() => setExpanded(!expanded)} className="h-auto w-fit gap-1 p-0 text-[12px] text-brand">
          <ChevronsUpDown className="size-3.5" /> {expanded ? 'Show less' : 'Show more'}
        </Button>
      )}
    </div>
  )
}

export function ForumSearchView(props: PageProps) {
  const form = useMemo(() => readForm(document), [])
  const [text, setText] = useState('')
  const [searchIn, setSearchIn] = useState('1')
  const [order, setOrder] = useState('default')
  const [forums, setForums] = useState<string[]>([]) // empty = all
  const [start, setStart] = useState(0)
  const [rows, setRows] = useState<Row[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const reqId = useRef(0)

  if (!form) return <LegacyView {...props} />

  async function run(startAt: number) {
    const q = text.trim()
    if (!q) return
    const id = ++reqId.current
    setLoading(true)
    setError(false)
    setStart(startAt)
    const params = new URLSearchParams()
    params.set('text', q)
    params.set('searchIn', searchIn)
    params.set('order', order)
    params.set('start', String(startAt))
    for (const v of forums.length ? forums : ['-1']) params.append('FtS[]', v)
    try {
      const res = await mamFetch(SEARCH_URL, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
        body: params.toString(),
      })
      const parsed = parseResults(await res.text())
      if (id !== reqId.current) return
      setRows(parsed.rows)
      setTotal(parsed.total)
    } catch {
      if (id === reqId.current) setError(true)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  const label = forums.length === 0
    ? 'All forums'
    : forums.length === 1
      ? form.forums.find((f) => f.value === forums[0])?.label ?? '1 forum'
      : `${forums.length} forums`

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader title="Search the forums" sub="Find topics across every board." />

      <FilterBar>
        <FilterSearch
          value={text}
          onChange={setText}
          onSubmit={() => run(0)}
          placeholder="Search topics and posts…"
          autoFocus
        />
        <FilterRow>
          <FilterSelect value={searchIn} onChange={setSearchIn} options={form.searchIn} ariaLabel="What to search" />
          <FilterSelect value={order} onChange={setOrder} options={form.order} ariaLabel="Sort order" />
          <FilterFacet label={label} count={forums.length} width="w-72">
            <FacetOptions
              options={form.forums.map((f) => ({ value: f.value, label: f.label, depth: f.category ? 0 : 1 }))}
              selected={forums}
              onToggle={(v) => setForums((s) => (s.includes(v) ? s.filter((x) => x !== v) : [...s, v]))}
              onClear={() => setForums([])}
              maxHeight="max-h-80"
              emptyText="No forums listed."
            />
          </FilterFacet>
        </FilterRow>
      </FilterBar>

      {/* Results */}
      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground"><Spinner className="size-4" /> Searching…</div>
      )}

      {!loading && error && (
        <Card><CardContent className="py-10 text-center text-[13px] text-muted-foreground">Something went wrong. Try again.</CardContent></Card>
      )}

      {!loading && !error && rows && (
        rows.length > 0 ? (
          <div className="grid gap-3">
            <p className="text-[12.5px] text-muted-foreground">
              {total != null ? `${total.toLocaleString('en-US')} results` : `${rows.length} results`}
            </p>
            <Card className="py-0">
              <CardContent className="grid gap-0 divide-y divide-border/60 px-0 py-0">
                {rows.map((r, i) => <ResultCard key={i} r={r} />)}
              </CardContent>
            </Card>
            {total != null && total > PAGE_SIZE && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12.5px] text-muted-foreground">
                  {start + 1}–{Math.min(start + PAGE_SIZE, total)} of {total.toLocaleString('en-US')}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={start === 0} onClick={() => run(Math.max(0, start - PAGE_SIZE))}>Prev</Button>
                  <Button variant="secondary" size="sm" disabled={start + PAGE_SIZE >= total} onClick={() => run(start + PAGE_SIZE)}>Next</Button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <Card><CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><MessagesSquare /></EmptyMedia>
                <EmptyTitle>No topics found</EmptyTitle>
                <EmptyDescription>Try different words or widen the search to more forums.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent></Card>
        )
      )}

      {!loading && !error && !rows && (
        <Card><CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Search /></EmptyMedia>
              <EmptyTitle>Search the forums</EmptyTitle>
              <EmptyDescription>Type a word or phrase and press Search.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent></Card>
      )}
    </div>
  )
}
