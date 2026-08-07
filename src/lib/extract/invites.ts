// The two invite pages. /invite/unconfirmed.php holds the stash plus the
// invites that went out and have not been accepted yet; /invite/send.php holds
// the form. Both pages tell their blocks apart by the h4 in the block head.

import { findSubmitter } from '@/lib/form-mirror'

export interface InviteRow {
  added: string
  expires: string
}

/** The sent-but-unaccepted table. Its columns are unmeasured, so they are
 * carried over exactly as MAM serves them. */
export interface UnconfirmedTable {
  headers: string[]
  rows: string[][]
}

export interface Invites {
  unstarted: InviteRow[]
  /** null when the block shows an empty state instead of a table. */
  unconfirmed: UnconfirmedTable | null
  /** MAM's confirmation right after a send, which it only serves on the
   * ?emailCon= URL it redirects to. */
  sentNote: string | null
}

export interface SendForm {
  form: HTMLFormElement
  email: HTMLInputElement
  message: HTMLTextAreaElement
  submitter: HTMLElement | null
  /** The pool this invite comes from, as MAM names it above the form. */
  source: string | null
  emailHint: string
  ipWarning: string
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''

function blockByHeading(root: ParentNode, match: RegExp): Element | null {
  for (const b of root.querySelectorAll('.blockCon')) {
    if (match.test(clean(b.querySelector(':scope > .blockHead h4')?.textContent))) return b
  }
  return null
}

const cellsOf = (tr: Element) => [...tr.children].filter((c) => c.tagName === 'TD' || c.tagName === 'TH')

function dataRows(table: Element): string[][] {
  const out: string[][] = []
  for (const tr of table.querySelectorAll('tr')) {
    const cells = cellsOf(tr)
    if (!cells.length || cells.some((c) => c.tagName === 'TH')) continue
    out.push(cells.map((c) => clean(c.textContent)))
  }
  return out
}

function headerCells(table: Element): string[] {
  for (const tr of table.querySelectorAll('tr')) {
    const cells = cellsOf(tr)
    if (cells.some((c) => c.tagName === 'TH')) return cells.map((c) => clean(c.textContent))
  }
  return []
}

/** A header row wider than its data rows carries blank padding cells, the way
 * MAM pads one with a rowspan. Dropping those lines the columns back up. */
function alignHeaders(headers: string[], rows: string[][]): string[] {
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0)
  if (!width || headers.length <= width) return headers
  return headers.filter((h) => h !== '')
}

/** The unconfirmed table ends on a spacer column that is empty in the header
 * and in every row. Dropping it costs nothing and saves a dead column. */
function dropEmptyColumns(headers: string[], rows: string[][]): { headers: string[]; rows: string[][] } {
  const width = Math.max(headers.length, ...rows.map((r) => r.length))
  const keep: number[] = []
  for (let i = 0; i < width; i++) {
    const headerFilled = (headers[i] ?? '') !== ''
    const anyCellFilled = rows.some((r) => (r[i] ?? '') !== '')
    if (headerFilled || anyCellFilled) keep.push(i)
  }
  if (keep.length === width) return { headers, rows }
  return {
    headers: headers.length ? keep.map((i) => headers[i] ?? '') : headers,
    rows: rows.map((r) => keep.map((i) => r[i] ?? '')),
  }
}

export function extractInvites(root: ParentNode): Invites | null {
  const stash = blockByHeading(root, /unstarted/i)
  const sent = blockByHeading(root, /unconfirmed/i)
  if (!stash && !sent) return null

  const stashTable = stash?.querySelector('table')
  const unstarted: InviteRow[] = stashTable
    ? dataRows(stashTable).map((r) => ({ added: r[0] ?? '', expires: r[1] ?? '' }))
    : []

  const sentTable = sent?.querySelector('table')
  const unconfirmed = sentTable
    ? (() => {
        const rows = dataRows(sentTable)
        return dropEmptyColumns(alignHeaders(headerCells(sentTable), rows), rows)
      })()
    : null

  // The confirmation sits directly under #mainBody, outside both blocks. MAM
  // serves it only on the ?emailCon= URL. Matching on the wording keeps an
  // unrelated heading from being shown as a success message.
  const heading =
    root.querySelector('#mainBody > h1') ?? root.querySelector(':scope > h1') ?? root.querySelector('h1')
  const headingText = clean(heading?.textContent)
  const sentNote = /\binvite\b/i.test(headingText) && /\bsent\b/i.test(headingText) ? headingText : null

  return {
    unstarted,
    unconfirmed,
    sentNote,
  }
}

/** The lines MAM prints beside the email field, minus the controls themselves
 * and the separate warning below them. */
function fieldNote(email: HTMLInputElement): string {
  const cell = email.closest('td') ?? email.parentElement
  if (!cell) return ''
  const copy = cell.cloneNode(true) as HTMLElement
  copy.querySelectorAll('input, textarea, select, h2').forEach((e) => e.remove())
  return clean(copy.textContent)
}

export function extractSendForm(root: ParentNode): SendForm | null {
  const form =
    root.querySelector<HTMLFormElement>('form[action*="/invite/send"]') ??
    root.querySelector<HTMLFormElement>('form[method="post" i]')
  if (!form) return null
  const email = form.querySelector<HTMLInputElement>('input[name="email"]')
  const message = form.querySelector<HTMLTextAreaElement>('textarea[name="mess"]')
  if (!email || !message) return null

  // The page carries two h2s: the pool name above the form plus the red
  // duplicate-IP warning inside it.
  const source = clean(root.querySelector('h2:not(.red)')?.textContent) || null

  return {
    form,
    email,
    message,
    submitter: findSubmitter(form),
    source,
    emailHint: fieldNote(email),
    ipWarning: clean(root.querySelector('h2.red')?.textContent),
  }
}
