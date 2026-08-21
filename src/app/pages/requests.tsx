import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, Filter, Gift } from 'lucide-react'
import type { PageProps } from '@/app/router'
import type { RequestQuery, RequestRow } from '@/lib/mam-api'
import {
  REQUESTERS,
  REQUESTS_PER_PAGE,
  REQUEST_DEFAULTS,
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
import { pinnedSet } from '@/lib/saved-filters'
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
  FacetSection, FilterBar, FilterFacet, FilterRow, FilterSaved, FilterSavedActions, FilterSearch,
  FilterSegments, FilterSelect, FilterSummary, useSavedViews,
} from '@/components/filters'

const SKELETON_ROWS = 8

const REQUESTS_PAGE = 'requests'

const label = (options: readonly { value: string; label: string }[], v: string) =>
  options.find((o) => o.value === v)?.label ?? v

/** A set sits right above the segments it stands for, so its name says what it
 * covers rather than repeating a button. */
const FILL_IN_NAME: Record<string, string> = {
  filled: 'Filled requests',
  either: 'Filled and unfilled',
}

const EMPTY_EXTRA: RequestQuery['extra'] = { com: {}, req: {} }

/** What a saved set holds here: the query without the page it stopped on. */
const savedOf = (q: Required<RequestQuery>) => ({
  text: q.text,
  filled: q.filled,
  requester: q.requester,
  sortType: q.sortType,
  extra: q.extra,
})

/** A stored set read back, keeping anything it does not carry. */
function patchFromSaved(raw: Record<string, unknown>): Partial<RequestQuery> {
  const out: Partial<RequestQuery> = { start: 0 }
  if (typeof raw.text === 'string') out.text = raw.text
  if (REQUEST_FILL_STATES.some((o) => o.value === raw.filled)) out.filled = raw.filled as string
  if (REQUESTERS.some((o) => o.value === raw.requester)) out.requester = raw.requester as string
  if (REQUEST_SORTS.some((o) => o.value === raw.sortType)) out.sortType = raw.sortType as string
  if (raw.extra && typeof raw.extra === 'object') out.extra = raw.extra as RequestQuery['extra']
  return out
}

/** Whether one stored blob value narrows anything. MAM's own scripts write
 * neutral values into the blob: an empty string, a zero, an off switch. None of
 * those is a choice, so none of them speaks for the link. */
const chose = (v: unknown): boolean => {
  if (v == null || v === '') return false
  if (typeof v === 'boolean') return v
  // Entity branches nest, as in com[author][id][]. An emptied one narrows
  // nothing, so the branch is walked rather than counted.
  if (typeof v === 'object') return Object.values(v).some(chose)
  return Number(v) !== 0
}

const narrows = (branch: Record<string, unknown> | undefined): boolean => Object.values(branch ?? {}).some(chose)

/** Whether the link itself narrows the list. A pinned set steps aside for one
 * that does, so a link from MAM's own menu keeps showing what it names. */
function linkChose(q: Required<RequestQuery>): boolean {
  return (
    q.text.length > 0 ||
    q.filled !== REQUEST_DEFAULTS.filled ||
    q.requester !== REQUEST_DEFAULTS.requester ||
    q.sortType !== REQUEST_DEFAULTS.sortType ||
    narrows(q.extra.com) ||
    narrows(q.extra.req)
  )
}

/** The query this page opens with: the URL where it names filters, otherwise the
 * pinned set on top of it. The flag says which, since a set has to reach the
 * address bar as well. */
function openingQuery(): { query: Required<RequestQuery>; pinned: boolean } {
  const fromUrl = requestQueryFromUrl()
  const pin = linkChose(fromUrl) ? undefined : pinnedSet(REQUESTS_PAGE)?.state
  if (!pin) return { query: fromUrl, pinned: false }
  return { query: { ...fromUrl, ...patchFromSaved(pin) }, pinned: true }
}

/** A request without a release date carries MAM's zero stamp. */
function released(value: string | null): string | null {
  return value && !value.startsWith('0000-') ? dateOnly(value) : null
}

export function RequestsView(_props: PageProps) {
  const opening = useMemo(openingQuery, [])
  const [state, setState] = useState(opening.query)
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
    // A pinned set opens a list the address bar has to name too, so copying the
    // URL hands over what is on screen rather than the plain search.
    if (opening.pinned) history.replaceState(null, '', requestsUrl(state))
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

  const savedName = [
    state.text.trim(),
    state.filled === REQUEST_DEFAULTS.filled ? '' : FILL_IN_NAME[state.filled] ?? label(REQUEST_FILL_STATES, state.filled),
    state.requester === REQUEST_DEFAULTS.requester ? '' : label(REQUESTERS, state.requester),
    state.sortType === REQUEST_DEFAULTS.sortType ? '' : label(REQUEST_SORTS, state.sortType),
  ]
    .filter(Boolean)
    .join(' · ')

  const views = useSavedViews({
    page: REQUESTS_PAGE,
    state: savedOf(state),
    name: savedName,
    filtered: savedName.length > 0,
    onApply: (saved) => {
      const patch = patchFromSaved(saved)
      // The box holds its own value, so a set has to land there too. Without
      // it the next filter click would send the old text along.
      setText(patch.text ?? '')
      apply(patch)
    },
    // The blob fields go too: no control on this bar names them, so leaving
    // them behind would keep narrowing the list from nowhere.
    onClear: () => {
      setText('')
      apply({ text: '', ...REQUEST_DEFAULTS, extra: EMPTY_EXTRA })
    },
  })

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
        <FilterSaved views={views} />
        <FilterSearch value={text} onChange={setText} onSubmit={() => apply({})} placeholder="Search requests…" />
        <FilterRow>
          <FilterSegments
            ariaLabel="Which requests to show"
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
        actions={views.hasActions ? <FilterSavedActions views={views} /> : undefined}
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
                  <Button variant="link" className="h-auto p-0 text-sm" onClick={() => setHideHidden(false)}>Show them</Button>
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
