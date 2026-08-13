import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Gift } from 'lucide-react'
import type { PageProps } from '@/app/router'
import type { RequestQuery, RequestRow } from '@/lib/mam-api'
import {
  REQUESTERS,
  REQUESTS_PER_PAGE,
  REQUEST_FILL_STATES,
  REQUEST_SORTS,
  parsePeople,
  requestQueryFromUrl,
  requestUrl,
  requestedAt,
  requestsUrl,
  searchRequests,
} from '@/lib/mam-api'
import { dateOnly, decodeEntities, fmtInt, localDate, plural, utcTitle } from '@/lib/format'
import { useFeature } from '@/lib/settings'
import { PageHeader } from '@/app/shell/bits'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { CopyResultsButton } from '@/components/copy-results'
import {
  FacetSection, FilterBar, FilterFacet, FilterRow, FilterSearch, FilterSegments, FilterSelect, FilterSummary,
} from '@/components/filters'

const SKELETON_ROWS = 8

/** A request without a release date carries MAM's zero stamp. */
function released(value: string | null): string | null {
  return value && !value.startsWith('0000-') ? dateOnly(value) : null
}

export function RequestsView(_props: PageProps) {
  const [state, setState] = useState(requestQueryFromUrl)
  const [text, setText] = useState(state.text)
  const [found, setFound] = useState(0)
  const [rows, setRows] = useState<RequestRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [hideHidden, setHideHidden] = useFeature('hideHiddenRequesters')
  const seq = useRef(0)

  const shown = rows == null ? null : hideHidden ? rows.filter((r) => r.pubuid) : rows
  const hiddenCount = rows != null && shown != null ? rows.length - shown.length : 0

  const load = useCallback(async (q: RequestQuery) => {
    const mine = ++seq.current
    setRows(null)
    setError(null)
    try {
      const res = await searchRequests(q)
      if (seq.current !== mine) return
      setRows(res.data)
      setFound(res.found ?? 0)
    } catch (e) {
      if (seq.current === mine) setError(e instanceof Error ? e.message : 'Loading failed')
    }
  }, [])

  useEffect(() => {
    void load(state)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const run = (next: Required<RequestQuery>) => {
    setState(next)
    history.replaceState(null, '', requestsUrl(next))
    void load(next)
  }

  /** Filter change: takes whatever sits in the search box along with it. */
  const apply = (patch: Partial<RequestQuery>) => run({ ...state, text, start: 0, ...patch })

  /** Paging stays on the query that produced this page, typing or not. */
  const goTo = (start: number) => run({ ...state, start })

  return (
    <div className="grid gap-4">
      <PageHeader
        title="Requests"
        sub="Books members are hoping someone uploads"
        action={
          <Button asChild size="sm">
            <a href="/tor/newRequest.php"><Gift /> New request</a>
          </Button>
        }
      />

      <FilterBar>
        <FilterSearch value={text} onChange={setText} onSubmit={() => apply({})} placeholder="Search requests…" />
        <FilterRow>
          <FilterSegments
            options={[...REQUEST_FILL_STATES]}
            value={state.filled}
            onChange={(v) => apply({ filled: v })}
          />
          <FilterSelect
            value={state.requester}
            onChange={(v) => apply({ requester: v })}
            options={[...REQUESTERS]}
            ariaLabel="Requested by"
          />
          <FilterFacet label="Filters" count={hideHidden ? 1 : 0} icon={<Filter className="size-3.5" />}>
            <FacetSection title="Personal" note="only in this browser">
              <Label className="flex items-center gap-2 py-1 text-[12.5px] font-normal">
                <Checkbox checked={hideHidden} onCheckedChange={(v) => setHideHidden(!!v)} />
                Hide hidden requesters
              </Label>
            </FacetSection>
          </FilterFacet>
          <FilterSelect
            value={state.sortType}
            onChange={(v) => apply({ sortType: v })}
            options={[...REQUEST_SORTS]}
            align="end"
            ariaLabel="Sort order"
            className="ml-auto"
          />
        </FilterRow>
      </FilterBar>

      <FilterSummary
        chips={hideHidden ? [{ key: 'hideHidden', label: 'Hide hidden requesters', onRemove: () => setHideHidden(false) }] : []}
      />

      <Card className="overflow-hidden py-0">
        {/* Same head as the browse list: the count on the left, the controls
            that act on it on the right. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b bg-muted/25 px-6 py-2">
          <span className="text-[12.5px] tabular-nums text-muted-foreground">
            {rows ? plural(found, 'request') : 'Loading…'}
          </span>
          <span className="ml-auto flex flex-wrap items-center gap-1.5">
            <CopyResultsButton rows={rows ?? []} decode />
          </span>
        </div>
        <Table className="[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Request</TableHead>
              <TableHead className="w-14 text-right md:w-24">Votes</TableHead>
              <TableHead className="hidden w-24 md:table-cell">Status</TableHead>
              <TableHead className="hidden w-28 text-right md:table-cell">Requested</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows === null && !error &&
              Array.from({ length: SKELETON_ROWS }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="mb-1.5 h-4 w-2/3" /><Skeleton className="h-3 w-1/3" /></TableCell>
                  <TableCell><Skeleton className="ml-auto h-4 w-8" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                  <TableCell className="hidden md:table-cell"><Skeleton className="ml-auto h-4 w-16" /></TableCell>
                </TableRow>
              ))}
            {error && (
              <TableRow><TableCell colSpan={4} className="py-10 text-center text-sm text-destructive">{error}</TableCell></TableRow>
            )}
            {rows?.length === 0 && (
              <TableRow><TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">No requests match.</TableCell></TableRow>
            )}
            {rows != null && rows.length > 0 && shown?.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="py-12 text-center text-sm text-muted-foreground">
                  Every request on this page is from a hidden requester.{' '}
                  <button type="button" className="underline" onClick={() => setHideHidden(false)}>Show them</button>
                </TableCell>
              </TableRow>
            )}
            {shown?.map((r) => {
              const authors = parsePeople(r.author_info)
              const narrators = parsePeople(r.narrator_info)
              const series = parsePeople(r.series_info)
              const stamp = requestedAt(r.requesttime)
              const releaseDate = released(r.releasedate)
              return (
                <TableRow key={r.requesttime}>
                  <TableCell className="whitespace-normal">
                    <a href={requestUrl(r.requesttime)} className="grid gap-0.5">
                      <span className="font-display text-[14px] font-medium leading-snug hover:underline">
                        {decodeEntities(r.title)}
                      </span>
                      <span className="text-[12px] text-muted-foreground">
                        {authors.length > 0 && <>by {authors.map((a) => a.name).join(', ')}</>}
                        {narrators.length > 0 && <> · read by {narrators.map((x) => x.name).join(', ')}</>}
                        {series.length > 0 && <> · {series.map((s) => s.name + (s.part ? ` #${s.part}` : '')).join(', ')}</>}
                        {releaseDate && <> · released {releaseDate}</>}
                        <span className="md:hidden"> · requested {localDate(stamp)}</span>
                      </span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        <Badge variant="outline">{r.cat_name}</Badge>
                        {r.lang_code && r.lang_code !== 'ENG' && <Badge variant="outline">{r.lang_code}</Badge>}
                        {r.filled ? (
                          <Badge className="bg-ok/15 text-ok md:hidden" variant="secondary">Filled</Badge>
                        ) : (
                          <Badge className="md:hidden" variant="secondary">Open</Badge>
                        )}
                      </span>
                    </a>
                  </TableCell>
                  <TableCell className="text-right font-mono text-[13px] tabular-nums">{fmtInt(r.votes)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {r.filled ? (
                      <Badge className="bg-ok/15 text-ok" variant="secondary">Filled</Badge>
                    ) : (
                      <Badge variant="secondary">Open</Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden text-right text-[12.5px] text-muted-foreground md:table-cell" title={utcTitle(stamp)}>
                    {localDate(stamp)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>

      <div className="flex items-center justify-end gap-2">
        <span className="mr-auto text-[12.5px] text-muted-foreground">
          {rows ? `Showing ${fmtInt(found === 0 ? 0 : state.start + 1)}–${fmtInt(Math.min(found, state.start + rows.length))}` : ''}
          {hiddenCount > 0 && ` · ${fmtInt(hiddenCount)} hidden on this page`}
        </span>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={state.start === 0 || rows === null}
          onClick={() => goTo(Math.max(0, state.start - REQUESTS_PER_PAGE))}
        >
          <ChevronLeft className="size-4" /> Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          disabled={rows === null || state.start + REQUESTS_PER_PAGE >= found}
          onClick={() => goTo(state.start + REQUESTS_PER_PAGE)}
        >
          Next <ChevronRight className="size-4" />
        </Button>
      </div>
    </div>
  )
}
