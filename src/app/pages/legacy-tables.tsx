import { useMemo } from 'react'
import { Inbox } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

interface Section { title: string | null; headers: string[]; rows: string[][]; text: string | null }

const EDGE = '[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6'

function extract(doc: Document): Section[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const all = [...main.querySelectorAll('.blockCon')]
  const leaves = all.filter((b) => !b.querySelector('.blockCon'))
  const scope: Element[] = leaves.length ? leaves : [main]
  const sections: Section[] = []
  for (const b of scope) {
    const title = b.querySelector('.blockHeadCon h4, h4, h2, h1')?.textContent?.replace(/\s+/g, ' ').trim() || null
    const table = b.querySelector('table')
    if (table && table.querySelector('td')) {
      // A header row has cells that are ALL th (column captions). Tables that
      // start every data row with a th instead have no such row, so that th
      // stays the row's first cell.
      const cellsOf = (tr: Element) => [...tr.querySelectorAll(':scope > td, :scope > th')]
      const trs = [...table.querySelectorAll('tbody tr, tr')].filter((tr) => cellsOf(tr).length > 0)
      const headerRow =
        table.querySelector('thead tr') ??
        trs.find((tr) => cellsOf(tr).every((c) => c.tagName === 'TH'))
      const headers = headerRow ? cellsOf(headerRow).map((c) => c.textContent?.replace(/\s+/g, ' ').trim() ?? '') : []
      const rows = trs
        .filter((tr) => tr !== headerRow && tr.querySelector('td'))
        .map((tr) => cellsOf(tr).map((c) => cleanHtml(c) ?? ''))
      sections.push({ title, headers, rows, text: null })
    } else {
      const body = (b.querySelector('.blockBodyCon') ?? b).cloneNode(true) as HTMLElement
      body.querySelectorAll('.blockHead, .blockHeadCon, h4').forEach((e) => e.remove())
      const text = cleanHtml(body)
      sections.push({ title, headers: [], rows: [], text: text && text.replace(/<[^>]+>/g, '').trim() ? text : null })
    }
  }
  return sections
}

function Section({ s }: { s: Section }) {
  const hasTable = s.rows.length > 0
  return (
    <Card className="gap-0 py-0">
      {s.title && (
        <CardHeader className="border-b !py-3.5"><CardTitle>{s.title}</CardTitle></CardHeader>
      )}
      {hasTable ? (
        <Table className={EDGE}>
          {s.headers.some(Boolean) && (
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {s.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {s.rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} className="whitespace-normal align-top text-[13px] [&_a]:text-brand [&_a]:underline" dangerouslySetInnerHTML={{ __html: c }} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : s.text ? (
        <CardContent className="py-5"><RichHtml html={s.text} className="text-[13px]" /></CardContent>
      ) : (
        <CardContent className="py-10 text-center text-sm text-muted-foreground">Nothing here right now.</CardContent>
      )}
    </Card>
  )
}

function LegacyTables({ props, title, sub }: { props: PageProps; title: string; sub?: string }) {
  const sections = useMemo(() => extract(document), [])
  if (!sections) return <LegacyView {...props} />
  const meaningful = sections.filter((s) => s.rows.length || s.text || s.title)
  return (
    <div className="grid gap-5">
      <PageHeader title={title} sub={sub} />
      {meaningful.length > 0 ? (
        meaningful.map((s, i) => <Section key={i} s={s} />)
      ) : (
        <Card><CardContent>
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
              <EmptyTitle>Nothing here</EmptyTitle>
              <EmptyDescription>There is nothing to show on this page right now.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </CardContent></Card>
      )}
    </div>
  )
}

export function RecentlyDeletedView(props: PageProps) {
  return <LegacyTables props={props} title="Recently deleted" sub="Torrents removed from the library in the last while." />
}
export function PeersView(props: PageProps) {
  return <LegacyTables props={props} title="Peers" sub="Where your torrent clients are connected right now." />
}
export function UserHistoryView(props: PageProps) {
  return <LegacyTables props={props} title="Account history" sub="Notable events on your account." />
}
export function MediaTypesView(props: PageProps) {
  return <LegacyTables props={props} title="Media types" sub="How the library is organised by media." />
}
export function CategoriesView(props: PageProps) {
  return <LegacyTables props={props} title="Categories" sub="Every category in the library." />
}
