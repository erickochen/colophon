import { useEffect, useMemo, useRef, useState } from 'react'
import { UsersRound } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { MEMBER_PAGE_SIZE, searchMembers, type UserRow } from '@/lib/extract/users'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { localDate, plural, relTime, utcTitle } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import {
  FilterBar, FilterRow, FilterSaved, FilterSavedActions, FilterSearch, FilterSelect, FilterSummary,
  useSavedViews,
} from '@/components/filters'

const USERS_PAGE = 'users'

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

interface ClassOpt { value: string; label: string }

/** Class dropdown options live in the original (hidden) search form. MAM writes
 * its catch-all as "(any class)"; on a bar of plain controls it reads as a
 * value like the rest. */
function readClasses(doc: Document): ClassOpt[] {
  const opts = [...doc.querySelectorAll<HTMLOptionElement>('#mainBody select option')]
  const label = (o: HTMLOptionElement) => (o.value === '-' ? 'Any class' : clean(o.textContent))
  return opts.length ? opts.map((o) => ({ value: o.value, label: label(o) })) : [{ value: '-', label: 'Any class' }]
}

export function UsersView(props: PageProps) {
  // Decided once, before the effects: a page without MAM's body falls through to
  // the legacy view, so nothing should be fetched for it.
  const usable = useMemo(() => !!document.querySelector('#mainBody'), [])
  const classes = useMemo(() => readClasses(document), [])
  const [text, setText] = useState('')
  const [cls, setCls] = useState('-')
  const [rows, setRows] = useState<UserRow[] | null>(null)
  // What the shown list was asked for, which is what a set stands for.
  const [asked, setAsked] = useState({ text: '', cls: '-' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const reqId = useRef(0)

  async function run(nextText: string = text, nextCls: string = cls) {
    const id = ++reqId.current
    setAsked({ text: nextText, cls: nextCls })
    setLoading(true)
    setError(false)
    try {
      const parsed = await searchMembers(nextText, nextCls === '-' ? '' : nextCls)
      if (id !== reqId.current) return
      setRows(parsed)
    } catch {
      if (id === reqId.current) setError(true)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  // Populate with MAM's default listing on first open.
  useEffect(() => {
    if (usable) void run()
  }, [usable]) // eslint-disable-line react-hooks/exhaustive-deps

  const savedName = [asked.text.trim(), asked.cls === '-' ? '' : classes.find((c) => c.value === asked.cls)?.label]
    .filter(Boolean)
    .join(' · ')

  const views = useSavedViews({
    page: USERS_PAGE,
    state: { ...asked },
    name: savedName,
    filtered: savedName.length > 0,
    onApply: (saved) => {
      const nextText = typeof saved.text === 'string' ? saved.text : ''
      const nextCls = typeof saved.cls === 'string' ? saved.cls : '-'
      setText(nextText)
      setCls(nextCls)
      void run(nextText, nextCls)
    },
    onClear: () => {
      setText('')
      setCls('-')
      void run('', '-')
    },
  })

  if (!usable) return <LegacyView {...props} />

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader title="Find members" sub="Search the membership by name, class or country." />

      <FilterBar>
        <FilterSaved views={views} />
        <FilterSearch value={text} onChange={setText} onSubmit={() => run()} placeholder="Member name…" autoFocus />
        <FilterRow>
          <FilterSelect
            value={cls}
            onChange={(v) => {
              setCls(v)
              void run(text, v)
            }}
            options={classes.map((c) => ({ value: c.value || '-', label: c.label }))}
            ariaLabel="Member class"
          />
        </FilterRow>
      </FilterBar>

      {views.hasActions && <FilterSummary actions={<FilterSavedActions views={views} />} />}

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
              {plural(rows.length, 'member')}
              {rows.length === MEMBER_PAGE_SIZE && ' or more'}
            </p>
            <Card className="py-0">
              <CardContent className="grid gap-0 px-0 py-0">
                {/* header */}
                <div className="grid grid-cols-[minmax(0,1fr)_auto_120px_120px] items-center gap-3 px-6 py-2.5 text-[10.5px] uppercase tracking-wide text-muted-foreground">
                  <span>Member</span><span>Country</span><span>Registered</span><span>Last access</span>
                </div>
                {rows.map((u, i) => (
                  <a
                    key={u.href + i}
                    href={u.href}
                    className="grid grid-cols-[minmax(0,1fr)_auto_120px_120px] items-center gap-3 px-6 py-2.5 text-[13px] transition-colors odd:bg-muted/25 hover:bg-accent/50"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate font-medium">{u.name}</span>
                      {u.className && <Badge variant="secondary" className="shrink-0 text-[10px]">{u.className}</Badge>}
                    </span>
                    <span className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      {u.flag && <img src={u.flag} alt="" className="h-3.5 w-auto" />}
                      <span className="hidden sm:inline">{u.country ?? ''}</span>
                    </span>
                    <span className="text-[12px] text-muted-foreground" title={utcTitle(u.registered)}>{localDate(u.registered)}</span>
                    <span className="text-[12px] text-muted-foreground" title={utcTitle(u.lastAccess)}>{relTime(u.lastAccess)}</span>
                  </a>
                ))}
              </CardContent>
            </Card>
          </div>
        ) : (
          <Card><CardContent>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><UsersRound /></EmptyMedia>
                <EmptyTitle>No members found</EmptyTitle>
                <EmptyDescription>Try a different name or widen the class filter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent></Card>
        )
      )}
    </div>
  )
}
