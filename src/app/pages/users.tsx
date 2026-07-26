import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, UsersRound } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader } from '@/app/shell/bits'
import { relTime } from '@/lib/format'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Spinner } from '@/components/ui/spinner'

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

interface ClassOpt { value: string; label: string }
interface UserRow {
  name: string
  href: string
  registered: string
  lastAccess: string
  className: string
  country: string | null
  flag: string | null
}

/** Class dropdown options live in the original (hidden) search form. */
function readClasses(doc: Document): ClassOpt[] {
  const opts = [...doc.querySelectorAll<HTMLOptionElement>('#mainBody select option')]
  return opts.length ? opts.map((o) => ({ value: o.value, label: clean(o.textContent) })) : [{ value: '-', label: '(any class)' }]
}

function parseUsers(html: string): UserRow[] {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const table = doc.querySelector('#mainBody table')
  if (!table) return []
  const rows = [...table.querySelectorAll('tr')]
  const out: UserRow[] = []
  for (const tr of rows) {
    const tds = [...tr.querySelectorAll('td')]
    const a = tds[0]?.querySelector('a')
    if (!a || tds.length < 5) continue // skip header / malformed
    const flagImg = tds[4]?.querySelector('img')
    out.push({
      name: clean(a.textContent),
      href: a.getAttribute('href') ?? '#',
      registered: clean(tds[1]?.textContent),
      lastAccess: clean(tds[2]?.textContent),
      className: clean(tds[3]?.textContent),
      country: flagImg?.getAttribute('title') ?? null,
      flag: flagImg?.getAttribute('src') ?? null,
    })
  }
  return out
}

export function UsersView(props: PageProps) {
  const classes = useMemo(() => readClasses(document), [])
  const [text, setText] = useState('')
  const [cls, setCls] = useState('-')
  const [rows, setRows] = useState<UserRow[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const reqId = useRef(0)

  async function run() {
    const id = ++reqId.current
    setLoading(true)
    setError(false)
    const params = new URLSearchParams({ search: text.trim(), class: cls === '-' ? '' : cls })
    try {
      const res = await fetch(`/users.php?${params.toString()}`, { credentials: 'include' })
      const parsed = parseUsers(await res.text())
      if (id !== reqId.current) return
      setRows(parsed)
    } catch {
      if (id === reqId.current) setError(true)
    } finally {
      if (id === reqId.current) setLoading(false)
    }
  }

  // Populate with MAM's default listing on first open.
  useEffect(() => { run() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (!document.querySelector('#mainBody')) return <LegacyView {...props} />

  return (
    <div className="mx-auto grid w-full max-w-4xl gap-5">
      <PageHeader title="Find members" sub="Search the membership by name, class or country." />

      <Card>
        <CardContent className="py-5">
          <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); run() }}>
            <div className="relative min-w-56 flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Member name…" className="h-10 pl-9" autoFocus />
            </div>
            <Select value={cls} onValueChange={setCls}>
              <SelectTrigger className="h-10 w-44 text-[13px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {classes.map((c) => <SelectItem key={c.value} value={c.value || '-'}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" size="lg" className="h-10" disabled={loading}>Search</Button>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <div className="flex items-center justify-center gap-2 py-12 text-[13px] text-muted-foreground"><Spinner className="size-4" /> Searching…</div>
      )}
      {!loading && error && (
        <Card><CardContent className="py-10 text-center text-[13px] text-muted-foreground">Something went wrong. Try again.</CardContent></Card>
      )}
      {!loading && !error && rows && (
        rows.length > 0 ? (
          <div className="grid gap-3">
            <p className="text-[12.5px] text-muted-foreground">{rows.length}{rows.length === 100 ? '+' : ''} members</p>
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
                    <span className="text-[12px] text-muted-foreground" title={u.registered}>{u.registered.slice(0, 10)}</span>
                    <span className="text-[12px] text-muted-foreground" title={u.lastAccess}>{relTime(u.lastAccess)}</span>
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
