import { useMemo, useRef, useState } from 'react'
import { Inbox } from 'lucide-react'
import type { PageProps } from '@/app/router'
import { cleanHtml } from '@/lib/sanitize'
import { swapStatusIcons } from '@/lib/status-dots'
import { LegacyView } from '@/app/pages/legacy'
import { PageHeader, RichHtml } from '@/app/shell/bits'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Spinner } from '@/components/ui/spinner'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'

interface TablePart { kind: 'table'; caption: string | null; headers: string[]; rows: string[][] }
interface TextPart { kind: 'text'; html: string }
type Part = TablePart | TextPart

interface LinkAction { kind: 'link'; el: Element; label: string; href: string }
interface SubmitAction { kind: 'submit'; el: HTMLElement; label: string; form: HTMLFormElement; confirm: boolean }
type Action = LinkAction | SubmitAction

interface Section { title: string | null; parts: Part[]; actions: Action[] }

/** Anchors MAM styles as buttons. */
const ACTION_LINK = 'a[class~="buttonLink"], a[class~="forumButtonLink"], a[class~="torFormButton"]'
const SUBMIT = 'input[type="submit"], button[type="submit"], button:not([type])'
const CONTROLS = 'form, input, select, textarea, button'
/** An anchor that goes nowhere is a script handle, not a link. */
const DEAD_LINK = 'a[href="#"], a:not([href])'
/** Controls, script handles and block scaffolding: shown as buttons or not at
 * all, never as reader text. */
const JUNK = `${CONTROLS}, ${DEAD_LINK}, .blockHead, .blockFoot, .bHi, ${ACTION_LINK}`
/** Input types that carry no user choice, so a form holding only these is a
 * plain action button. */
const PASSIVE_TYPES = new Set(['hidden', 'submit', 'reset', 'button', 'image'])
/** Tags that only mean something inside a table, so they are walked rather than
 * kept: on their own the HTML parser throws them away. */
const TABLE_PART = /^(TBODY|THEAD|TFOOT|TR|TD|TH|CAPTION|COLGROUP|COL)$/
/** A heading up to this length above a table reads as its caption. */
const CAPTION_MAX = 80
/** Past this length a label is a sentence, so let it wrap instead of stretching
 * the row it sits in. */
const LONG_LABEL = 32
/** What a browser paints on a submit button that carries no value. */
const DEFAULT_SUBMIT = 'Submit'

const EDGE = '[&_th:first-child]:pl-6 [&_td:first-child]:pl-6 [&_th:last-child]:pr-6 [&_td:last-child]:pr-6'

/** Cell styling, with a cap on MAM's own icons, which arrive without the sizing
 * their stylesheet gives them. Status dots are styled in index.css. */
const CELL = [
  'whitespace-normal align-top text-[13px] [&_a]:text-brand [&_a]:underline',
  '[&_img]:inline [&_img]:h-[1.15em] [&_img]:w-auto',
].join(' ')

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''
const cellsOf = (tr: Element) => [...tr.querySelectorAll(':scope > td, :scope > th')]
const rowsOf = (t: Element) => [...t.querySelectorAll('tr')].filter((tr) => cellsOf(tr).length > 0)

/** Real data: a leaf table with more than one cell. MAM also uses tables for
 * layout and for one-cell notice boxes, which read better as text. A table with
 * only its header row counts, so an empty list keeps its heading. */
function isDataTable(t: Element): boolean {
  if (t.querySelector('table')) return false
  const rows = rowsOf(t)
  if (!rows.length) return false
  return rows.length > 1 || rows.some((tr) => cellsOf(tr).length > 1)
}

/** The single cell of a one-cell table, which MAM uses to frame a notice. */
function loneCell(t: Element): Element | null {
  const rows = rowsOf(t)
  if (rows.length !== 1) return null
  const cells = cellsOf(rows[0])
  return cells.length === 1 ? cells[0] : null
}

/** A cell as reader HTML. Copied controls go: a copy is not the control MAM
 * submits, so it could only ever look like it works. */
function cellHtml(cell: Element): string {
  const copy = cell.cloneNode(true) as Element
  copy.querySelectorAll(CONTROLS).forEach((e) => e.remove())
  swapStatusIcons(copy)
  return cleanHtml(copy) ?? ''
}

/** A header row holds nothing but column captions: either all th or all colhead,
 * the way older MAM pages mark them. One colhead cell spanning the width is a
 * band inside the table rather than its header, so a header needs at least two. */
const HEAD_CELL = /(^|\s)colhead\d*(\s|$)/i

function isHeaderRow(tr: Element): boolean {
  const cells = cellsOf(tr)
  if (!cells.length) return false
  if (cells.every((c) => c.tagName === 'TH')) return true
  return cells.length > 1 && cells.every((c) => HEAD_CELL.test(c.className))
}

/** A row that holds only controls reads as empty once those are dropped: MAM
 * wraps a lone button in a table now and then. */
function hasContent(tr: Element): boolean {
  return cellsOf(tr).some((c) => clean(c.textContent) !== '' || c.querySelector('img') !== null)
}

function readTable(table: Element): TablePart {
  // Tables that start every data row with a th have no header row of their own,
  // so that th stays the row's first cell.
  const trs = rowsOf(table)
  const headerRow = table.querySelector('thead tr') ?? trs.find(isHeaderRow)
  const headers = headerRow ? cellsOf(headerRow).map((c) => clean(c.textContent)) : []
  const rows = trs
    .filter((tr) => tr !== headerRow && tr.querySelector('td') && hasContent(tr))
    .map((tr) => cellsOf(tr).map(cellHtml))
  return { kind: 'table', caption: null, headers, rows }
}

/** Everything a block holds, in reading order: its tables plus the text between
 * them. A short heading directly above a table becomes that table's caption. The
 * heading that became the card title is left out so it is not shown twice. */
function readParts(body: Element, titleEl: Element | null): Part[] {
  const doc = body.ownerDocument
  const parts: Part[] = []
  let buffer = doc.createElement('div')

  /** Lifts a short trailing heading out of the held text: it announces the table
   * that follows rather than the copy above it. */
  function takeCaption(): string | null {
    const last = buffer.lastElementChild
    if (!last || !/^H[1-6]$/.test(last.tagName)) return null
    const text = clean(last.textContent)
    if (!text || text.length > CAPTION_MAX) return null
    for (let n = last.nextSibling; n; n = n.nextSibling) {
      if (clean(n.textContent)) return null
    }
    last.remove()
    return text
  }

  function flush() {
    if (clean(buffer.textContent) || buffer.querySelector('img')) {
      const html = cleanHtml(buffer)
      if (html) parts.push({ kind: 'text', html })
    }
    buffer = doc.createElement('div')
  }

  function hold(node: Node) {
    if (node.nodeType === Node.TEXT_NODE) {
      buffer.append(node.cloneNode(true))
      return
    }
    const el = node as Element
    if (el.matches(JUNK)) return
    const copy = el.cloneNode(true) as Element
    copy.querySelectorAll(JUNK).forEach((e) => e.remove())
    buffer.append(copy)
  }

  function visit(node: Node) {
    for (const child of node.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        hold(child)
        continue
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue
      const el = child as Element
      if (el === titleEl) continue
      if (el.tagName === 'TABLE') {
        if (isDataTable(el)) {
          const table = readTable(el)
          // Nothing but controls in it: those show as buttons, so the table
          // itself has nothing left to say.
          if (table.headers.some(Boolean) || table.rows.length) {
            table.caption = takeCaption()
            flush()
            parts.push(table)
          }
          continue
        }
        const cell = loneCell(el)
        visit(cell ?? el)
        continue
      }
      // Rows and cells of a layout table: keep their content, spaced so the
      // words of two cells do not run together.
      if (TABLE_PART.test(el.tagName)) {
        visit(el)
        if (el.tagName === 'TD' || el.tagName === 'TH') buffer.append(doc.createTextNode(' '))
        continue
      }
      // Walk into anything wrapping a table or the title so both stay in place.
      if (el.querySelector('table') || (titleEl && el.contains(titleEl))) visit(el)
      else hold(el)
    }
  }

  visit(body)
  flush()
  return parts
}

/** The buttons and links MAM puts beside a table. Submits keep pointing at the
 * original control, so its name plus every hidden field ride along. */
function readActions(scope: Element): Action[] {
  const actions: Action[] = []
  for (const a of scope.querySelectorAll<HTMLAnchorElement>(ACTION_LINK)) {
    const label = clean(a.textContent)
    const href = a.getAttribute('href')
    if (label && href && href !== '#') actions.push({ kind: 'link', el: a, label, href })
  }
  // Every submit is taken from its own form owner rather than from the form node
  // it happens to sit in.
  for (const el of scope.querySelectorAll<HTMLInputElement | HTMLButtonElement>(SUBMIT)) {
    const form = el.form
    if (!form) continue
    // A submit without a value reads as "Submit" on MAM's own page: the browser
    // paints that default, the property stays empty.
    const label = clean(el.value || el.textContent) || DEFAULT_SUBMIT
    actions.push({ kind: 'submit', el, label, form, confirm: form.method === 'post' })
  }
  return actions
}

/** True when the page asks for typing or ticking. That is more than tables plus
 * buttons, so those pages keep MAM's own form instead of a half copy of it. */
function hasEditableControl(main: Element): boolean {
  for (const el of main.querySelectorAll('input, select, textarea')) {
    if (el instanceof HTMLInputElement && PASSIVE_TYPES.has(el.type)) continue
    return true
  }
  return false
}

function extract(doc: Document): Section[] | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  if (hasEditableControl(main)) return null
  const all = [...main.querySelectorAll('.blockCon')]
  const leaves = all.filter((b) => !b.querySelector('.blockCon'))
  const scope: Element[] = leaves.length ? leaves : [main]
  const sections: Section[] = scope.map((b) => {
    const titleEl = b.querySelector('.blockHeadCon h4, h4, h2, h1')
    const title = clean(titleEl?.textContent) || null
    return {
      title,
      parts: readParts(b.querySelector('.blockBodyCon') ?? b, title ? titleEl : null),
      actions: readActions(b),
    }
  })
  // Controls MAM puts outside every block still belong to the page.
  const loose = readActions(main).filter((a) => !scope.some((b) => b.contains(a.el)))
  if (loose.length) sections.push({ title: null, parts: [], actions: loose })
  return sections
}

function wrapClass(label: string): string | undefined {
  return label.length > LONG_LABEL ? 'h-auto max-w-full whitespace-normal py-2 text-left leading-snug' : undefined
}

/** Anything that posts asks first: the label is the only thing we know about what
 * it does, so it is shown in full. */
function ConfirmSubmit({ action, onClose }: { action: SubmitAction; onClose: () => void }) {
  const [busy, setBusy] = useState(false)
  // The button goes disabled a render later, so a held Enter can fire twice.
  const inFlight = useRef(false)

  function go() {
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    action.form.requestSubmit(action.el)
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent className="gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Are you sure?</AlertDialogTitle>
          <AlertDialogDescription>
            This goes to MyAnonaMouse right away and the page reloads with the result.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="rounded-lg bg-muted/50 px-3 py-2 text-left text-[13px] leading-snug">{action.label}</div>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} disabled={busy}>
            {busy && <Spinner />}
            {busy ? 'Sending' : 'Continue'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

function ActionBar({ actions, divided }: { actions: Action[]; divided: boolean }) {
  const [pending, setPending] = useState<SubmitAction | null>(null)
  return (
    <div className={cn('flex flex-wrap items-center gap-2 px-6 py-4', divided && 'border-t')}>
      {actions.map((a, i) =>
        a.kind === 'link' ? (
          <Button key={i} size="sm" variant="outline" className={wrapClass(a.label)} asChild>
            <a href={a.href}>{a.label}</a>
          </Button>
        ) : (
          <Button
            key={i}
            size="sm"
            className={wrapClass(a.label)}
            onClick={() => (a.confirm ? setPending(a) : a.form.requestSubmit(a.el))}
          >
            {a.label}
          </Button>
        ),
      )}
      {pending && <ConfirmSubmit action={pending} onClose={() => setPending(null)} />}
    </div>
  )
}

const NOTHING = 'Nothing here right now.'

function TableView({ p }: { p: TablePart }) {
  return (
    <>
      {p.caption && <div className="border-b px-6 py-2.5 text-[13px] font-medium">{p.caption}</div>}
      {p.rows.length === 0 ? (
        <CardContent className="py-8 text-center text-[13px] text-muted-foreground">{NOTHING}</CardContent>
      ) : (
        <Table className={EDGE}>
          {p.headers.some(Boolean) && (
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                {p.headers.map((h, i) => <TableHead key={i}>{h}</TableHead>)}
              </TableRow>
            </TableHeader>
          )}
          <TableBody>
            {p.rows.map((r, i) => (
              <TableRow key={i}>
                {r.map((c, j) => (
                  <TableCell key={j} className={CELL} dangerouslySetInnerHTML={{ __html: c }} />
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </>
  )
}

function SectionCard({ s }: { s: Section }) {
  return (
    <Card className="gap-0 py-0">
      {s.title && (
        <CardHeader className="border-b !py-3.5"><CardTitle>{s.title}</CardTitle></CardHeader>
      )}
      {s.parts.map((p, i) => (
        <div key={i} className={i > 0 ? 'border-t' : undefined}>
          {p.kind === 'table' ? (
            <TableView p={p} />
          ) : (
            <CardContent className="py-5">
              <RichHtml html={p.html} className="text-[13px] [&_h1]:my-2 [&_h1]:font-display [&_h1]:text-lg [&_h1]:font-semibold [&_h2]:my-2 [&_h2]:text-[15px] [&_h2]:font-semibold" />
            </CardContent>
          )}
        </div>
      ))}
      {s.parts.length === 0 && s.actions.length === 0 && (
        <CardContent className="py-10 text-center text-sm text-muted-foreground">{NOTHING}</CardContent>
      )}
      {s.actions.length > 0 && <ActionBar actions={s.actions} divided={s.parts.length > 0} />}
    </Card>
  )
}

function LegacyTables({ props, title, sub }: { props: PageProps; title: string; sub?: string }) {
  const sections = useMemo(() => extract(document), [])
  if (!sections) return <LegacyView {...props} />
  const meaningful = sections.filter((s) => s.parts.length || s.actions.length || s.title)
  return (
    <div className="grid gap-5">
      <PageHeader title={title} sub={sub} />
      {meaningful.length > 0 ? (
        meaningful.map((s, i) => <SectionCard key={i} s={s} />)
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
  return <LegacyTables props={props} title="Media types" sub="How the library is organized by media." />
}
export function CategoriesView(props: PageProps) {
  return <LegacyTables props={props} title="Categories" sub="Every category in the library." />
}
