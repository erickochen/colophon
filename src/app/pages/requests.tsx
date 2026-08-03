import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Gift } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { parsePeople } from '@/lib/mam-api'
import { fmtInt } from '@/lib/format'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { FilterBar, FilterRow, FilterSearch, FilterSegments, FilterSelect } from '@/components/filters'

interface RequestRow {
  id: number
  title: string
  cat_name: string
  lang_code: string | null
  votes: number
  filled: number
  torsatch: number
  pubusername: string | null
  authors: string | null
  narrators: string | null
  series: string | null
  releasedate: string | null
}

const VIEW_TYPES = [
  { value: 'unful', label: 'Unfulfilled' },
  { value: 'filled', label: 'Filled' },
  { value: 'mine', label: 'Mine' },
  { value: 'vf', label: 'Voted for' },
  { value: 'all', label: 'All' },
]

/** View behind MAM's header notification link. Not part of the site's own
 * select, so it only shows as a segment when the URL asks for it. */
const UPDATED_VIEW = { value: 'vfn', label: 'Updated' }

function viewTypeFromUrl(): string {
  const v = new URLSearchParams(location.search).get('tor[viewType]')
  return v && [...VIEW_TYPES, UPDATED_VIEW].some((o) => o.value === v) ? v : VIEW_TYPES[0].value
}

const SORTS = [
  { value: 'dateD', label: 'Newest first' },
  { value: 'dateA', label: 'Oldest first' },
  { value: 'votesD', label: 'Most votes' },
  { value: 'votesA', label: 'Fewest votes' },
  { value: 'fillD', label: 'Recently filled' },
  { value: 'titleA', label: 'Title A–Z' },
  { value: 'catA', label: 'Category' },
]

export function RequestsView(_props: PageProps) {
  const [text, setText] = useState(new URLSearchParams(location.search).get('tor[text]') ?? '')
  const [viewType, setViewType] = useState(viewTypeFromUrl)
  const [viewOptions] = useState(() =>
    viewTypeFromUrl() === UPDATED_VIEW.value ? [...VIEW_TYPES, UPDATED_VIEW] : VIEW_TYPES
  )
  const [sort, setSort] = useState('dateD')
  const [start, setStart] = useState(0)
  const [found, setFound] = useState(0)
  const [rows, setRows] = useState<RequestRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const seq = useRef(0)
  const perpage = 50

  const load = useCallback(async (q: { text: string; viewType: string; sort: string; start: number }) => {
    const mine = ++seq.current
    setRows(null)
    setError(null)
    const body = new URLSearchParams()
    body.set('tor[text]', q.text)
    body.set('tor[srchIn][title]', 'true')
    body.set('tor[viewType]', q.viewType)
    body.set('tor[startDate]', '')
    body.set('tor[endDate]', '')
    body.set('tor[startNumber]', String(q.start))
    body.set('tor[sortType]', q.sort)
    body.set('perpage', String(perpage))
    try {
      const res = await fetch('/tor/json/loadRequests.php', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      })
      const json = await res.json()
      if (seq.current !== mine) return
      setRows(Array.isArray(json.data) ? json.data : [])
      setFound(json.found ?? 0)
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : 'Loading failed')
    }
  }, [])

  useEffect(() => {
    void load({ text, viewType, sort, start })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const apply = (patch: Partial<{ text: string; viewType: string; sort: string; start: number }>) => {
    const next = { text, viewType, sort, start: 0, ...patch }
    setText(next.text)
    setViewType(next.viewType)
    setSort(next.sort)
    setStart(next.start)
    void load(next)
  }

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Requests"
        sub={rows ? `${fmtInt(found)} requests` : 'Loading…'}
        action={
          <Button asChild size="sm">
            <a href="/tor/newRequest.php"><Gift /> New request</a>
          </Button>
        }
      />

      <FilterBar>
        <FilterSearch value={text} onChange={setText} onSubmit={() => apply({})} placeholder="Search requests…" />
        <FilterRow>
          <FilterSegments options={viewOptions} value={viewType} onChange={(v) => apply({ viewType: v })} />
          <FilterSelect
            value={sort}
            onChange={(v) => apply({ sort: v })}
            options={SORTS}
            align="end"
            ariaLabel="Sort order"
            className="ml-auto"
          />
        </FilterRow>
      </FilterBar>

      <Card className="overflow-hidden py-0">
        <Table className="[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead className="w-24 text-right">Votes</TableHead>
              <TableHead className="w-28">Status</TableHead>
              <TableHead className="w-28 text-right">Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null && !error &&
              Array.from({ length: 8 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="mb-1.5 h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            {error && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-destructive">{error}</TableCell></TableRow>
            )}
            {rows?.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">No requests match.</TableCell></TableRow>
            )}
            {rows?.map((r) => {
              const authors = parsePeople(r.authors)
              const narrators = parsePeople(r.narrators)
              const series = parsePeople(r.series)
              return (
                <TableRow key={r.id}>
                  <TableCell className="whitespace-normal">
                    {/* URL id = JSON id / 1e5 with 5 decimals (timestamp.frac) */}
                    <a href={`/t/r/${(r.id / 100000).toFixed(5)}`} className="grid gap-0.5">
                      <span className="font-display text-[14px] font-medium leading-snug hover:underline">{r.title}</span>
                      <span className="text-[12px] text-muted-foreground">
                        {authors.length > 0 && <>by {authors.map((a) => a.name).join(', ')}</>}
                        {narrators.length > 0 && <> · read by {narrators.map((x) => x.name).join(', ')}</>}
                        {series.length > 0 && <> · {series.map((s) => s.name + (s.part ? ` #${s.part}` : '')).join(', ')}</>}
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        <Badge variant="outline">{r.cat_name}</Badge>
                        {r.lang_code && r.lang_code !== 'ENG' && <Badge variant="outline">{r.lang_code}</Badge>}
                      </span>
                    </a>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">{fmtInt(r.votes)}</TableCell>
                  <TableCell>
                    {r.filled ? (
                      <Badge className="bg-ok/15 text-ok" variant="secondary">Filled</Badge>
                    ) : (
                      <Badge variant="secondary">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right text-[12.5px] text-muted-foreground">{r.releasedate ?? '–'}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[12.5px] text-muted-foreground">
          {rows ? `Showing ${fmtInt(found === 0 ? 0 : start + 1)}–${fmtInt(Math.min(found, start + (rows?.length ?? 0)))} of ${fmtInt(found)}` : ''}
        </span>
        <Button variant="outline" size="sm" className="h-8" disabled={start === 0 || rows === null} onClick={() => apply({ start: Math.max(0, start - perpage) })}>
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <Button variant="outline" size="sm" className="h-8" disabled={rows === null || start + perpage >= found} onClick={() => apply({ start: start + perpage })}>
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
