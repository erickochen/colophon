// Mailbox reader for /messages.php. MAM keeps private messages flat in two
// boxes with no thread id. A conversation is rebuilt in two steps: group on the
// other party with the subject stripped of its Re: prefixes, then peel off the
// quote stack MAM puts in every reply.
import { cleanHtml } from '@/lib/sanitize'

/** MAM's own account, sender of gift and system notices. */
const SYSTEM_UID = '6'
/** Messages MAM serves per box page. */
const PAGE_SIZE = 100
/** How far back a scan walks per box, so a huge mailbox stays cheap. */
const SCAN_PAGE_LIMIT = 5

export type PmBox = 1 | -1

export interface PmParty {
  name: string
  uid: string | null
  href: string | null
  color: string | null
}

export interface PmMessage {
  id: string
  box: PmBox
  date: string | null
  /** Subject as MAM shows it, Re: prefixes and sentbox marker included. */
  subject: string
  party: PmParty | null
  /** Server-rendered body when MAM inlined it, else null until fetched. */
  bodyHtml: string | null
  deleteHref: string | null
  replyHref: string | null
  reportHref: string | null
}

export interface MailboxData {
  box: PmBox
  page: number
  messages: PmMessage[]
  pages: { label: string; href: string; current: boolean }[]
  /** True when MAM offers a page after this one. */
  hasMore: boolean
}

export interface QuoteLevel {
  author: string
  html: string
}

export interface PmThread {
  key: string
  party: PmParty | null
  /** Subject of the newest message, which is what a list row previews. */
  subject: string
  /** Every subject in the conversation without its Re: prefixes, oldest first. */
  topics: string[]
  /** Oldest first, the order a conversation reads in. */
  messages: PmMessage[]
  last: PmMessage
  /** Notices from MAM itself rather than a member. */
  isSystem: boolean
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null
const DATE_RE = /\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
/** Shown where a message carries no subject of its own. */
export const NO_SUBJECT = '(no subject)'

/** Strips the sentbox marker and any stacked Re: so both sides of a
 * conversation land on the same key. */
export function baseSubject(subject: string): string {
  return subject
    .replace(/^[\s✓✔]+/, '')
    .replace(/^(\s*re\s*:\s*)+/i, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function parseParty(tr: Element): PmParty | null {
  const cell = tr.querySelector('.pmFrom')
  if (!cell) return null
  const a = cell.querySelector<HTMLAnchorElement>('a[href^="/u/"]')
  // MAM writes "Received from <name>" or "Sent to <name>". System notices carry
  // the name as plain text without a profile link.
  const name = a ? txt(a) : (txt(cell) ?? '').replace(/^(received from|sent to)\s*/i, '')
  if (!name) return null
  const href = a?.getAttribute('href') ?? null
  return {
    name,
    uid: href?.match(/\/u\/(\d+)/)?.[1] ?? null,
    href,
    color: a?.querySelector<HTMLElement>('span')?.style.color || null,
  }
}

function parseRows(doc: Document, box: PmBox): PmMessage[] {
  const table = doc.querySelector('#pmMessages')
  if (!table) return []
  const out: PmMessage[] = []
  for (const toggle of table.querySelectorAll<HTMLAnchorElement>('a[data-pmid]')) {
    const id = toggle.getAttribute('data-pmid')!
    const tr = toggle.closest('tr')
    if (!tr) continue
    // Scoped to the cell holding the toggle: the sender name in .pmFrom is also
    // wrapped in <b>, so a row-wide lookup could pick that up instead.
    const subject = txt(toggle.parentElement?.querySelector('b')) ?? NO_SUBJECT
    // MAM inlines a body as a table. Anything else means it has to be fetched.
    const holder = doc.getElementById('ka' + id)
    const inlined = holder && /^\s*<table/i.test(holder.innerHTML) ? holder.querySelector('.pm_msg, td') : null
    out.push({
      id,
      box,
      date: toggle.textContent?.match(DATE_RE)?.[0] ?? null,
      subject,
      party: parseParty(tr),
      bodyHtml: cleanHtml(inlined),
      deleteHref: tr.querySelector<HTMLAnchorElement>('a[href*="deletemessage"]')?.getAttribute('href') ?? null,
      replyHref: tr.querySelector<HTMLAnchorElement>('a[href*="replyto="]')?.getAttribute('href') ?? null,
      reportHref: tr.querySelector<HTMLAnchorElement>('a[href*="newTicket"]')?.getAttribute('href') ?? null,
    })
  }
  return out
}

function parsePager(doc: Document, page: number) {
  const pages: MailboxData['pages'] = []
  const pageDiv = doc.querySelector('#mainBody > div[align="right"]')
  const current = pageDiv?.querySelector('a.minusDiv')
  if (current) pages.push({ label: txt(current) ?? String(page), href: '#', current: true })
  for (const a of pageDiv?.querySelectorAll('a') ?? []) {
    const label = txt(a) ?? ''
    if (!/^\d+$/.test(label) || a.classList.contains('minusDiv')) continue
    pages.push({ label, href: a.getAttribute('href') ?? '#', current: false })
  }
  pages.sort((a, b) => Number(a.label) - Number(b.label))
  return { pages, hasMore: pages.some((p) => Number(p.label) > page) }
}

/** Reads the mailbox page the browser is on. */
export function extractMailbox(): MailboxData | null {
  if (!document.querySelector('#pmMessages')) return null
  const params = new URLSearchParams(location.search)
  const selected = document.querySelector<HTMLOptionElement>('select[name="box"] option[selected]')?.value
  const box: PmBox = (selected ?? params.get('box')) === '-1' ? -1 : 1
  const page = Number(params.get('page') ?? '1') || 1
  return { box, page, messages: parseRows(document, box), ...parsePager(document, page) }
}

const mailboxUrl = (box: PmBox, page: number) =>
  `/messages.php?action=viewmailbox&box=${box}&page=${page}`

export interface BoxScan {
  messages: PmMessage[]
  /** True when the box holds pages beyond the scan limit. */
  truncated: boolean
  /** True when a page did not come back, so the result is incomplete. */
  failed: boolean
}

/** Walks a box from the given page onward. MAM serves these pages to a plain
 * fetch, so the rest of the mailbox is readable without leaving this page. */
export async function scanBox(box: PmBox, fromPage = 1): Promise<BoxScan> {
  const messages: PmMessage[] = []
  let truncated = false
  let failed = false
  for (let page = fromPage; page < fromPage + SCAN_PAGE_LIMIT; page++) {
    try {
      const res = await fetch(mailboxUrl(box, page), { credentials: 'same-origin' })
      if (!res.ok) {
        failed = true
        break
      }
      const doc = new DOMParser().parseFromString(await res.text(), 'text/html')
      const rows = parseRows(doc, box)
      messages.push(...rows)
      const more = rows.length === PAGE_SIZE && parsePager(doc, page).hasMore
      if (!more) break
      truncated = page + 1 === fromPage + SCAN_PAGE_LIMIT
    } catch {
      // A dropped page leaves the rest of the mailbox out, which the caller says.
      failed = true
      break
    }
  }
  return { messages, truncated, failed }
}

/** Bodies fetched at the same time, so opening a long thread stays polite. */
const BODY_CONCURRENCY = 6

/** Fetches bodies in small batches, keyed by box and id. */
export async function fetchPmBodies(list: PmMessage[]): Promise<[string, string | null][]> {
  const out: [string, string | null][] = []
  for (let i = 0; i < list.length; i += BODY_CONCURRENCY) {
    const batch = list.slice(i, i + BODY_CONCURRENCY)
    const done = await Promise.all(
      batch.map(async (m) => [`${m.box}:${m.id}`, await fetchPmBody(m.id, m.box)] as [string, string | null])
    )
    out.push(...done)
  }
  return out
}

/** Fetches one body through the endpoint MAM's own mailbox uses. */
export async function fetchPmBody(id: string, box: PmBox): Promise<string | null> {
  const stamp = Date.now()
  const url = `/jsonLoadPM.php/${stamp}?box=${box}&pid=${encodeURIComponent(id)}&timestamp=${stamp}`
  try {
    const res = await fetch(url, { credentials: 'same-origin' })
    if (!res.ok) return null
    const data = (await res.json()) as { message?: string; Error?: string }
    if (!data.message) return null
    // Parsed in a document of its own, so nothing in the markup runs while the
    // sanitizer is still working on it.
    const doc = new DOMParser().parseFromString(data.message, 'text/html')
    return cleanHtml(doc.body)
  } catch {
    return null
  }
}

// MAM separates a quoted message with "-------- name wrote: --------" and puts
// the newest text on top, so the whole history travels along in every reply.
// The dash runs are pinned at eight, the length MAM writes: an open-ended run
// would let a line of dashes in someone's message backtrack for seconds.
const QUOTE_SEP = /(?:<br\s*\/?>\s*)*-{8}\s*([^<>\n]{1,40}?)\s*wrote:\s*-{8}\s*(?:<br\s*\/?>)?/gi

/** Splits a body into its own text plus the messages quoted under it. */
export function splitQuoteStack(html: string): { head: string; quotes: QuoteLevel[] } {
  const parts = html.split(QUOTE_SEP)
  const quotes: QuoteLevel[] = []
  for (let i = 1; i < parts.length; i += 2) {
    quotes.push({ author: parts[i].trim(), html: (parts[i + 1] ?? '').trim() })
  }
  return { head: parts[0].trim(), quotes }
}

/** Characters of someone else's message worth carrying along. A quote points at
 * what you answer; the reader already owns the message itself. */
const QUOTE_CHAR_BUDGET = 240
const QUOTE_TRIM_MARKER = ' [..]'
/** Longest author name the separator can carry back out again. */
const QUOTE_AUTHOR_MAX = 40

/** Trims to the budget on a word boundary. */
export function capQuote(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= QUOTE_CHAR_BUDGET) return clean
  const cut = clean.slice(0, QUOTE_CHAR_BUDGET)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut) + QUOTE_TRIM_MARKER
}

/** Plain text of a body, without the history it dragged along. */
export function quoteText(html: string | null | undefined): string {
  if (!html) return ''
  const own = splitQuoteStack(html).head
  const doc = new DOMParser().parseFromString(own, 'text/html')
  return capQuote(doc.body.textContent ?? '')
}

/** Name as it can appear between the separator dashes, so our own reader can
 * split it back off. Markup characters are dropped rather than escaped: an
 * escape would grow the name past the length the separator can carry. */
export function quoteAuthor(name: string | null | undefined): string {
  return (name ?? 'them').replace(/[<>&\n]/g, '').replace(/\s+/g, ' ').trim().slice(0, QUOTE_AUTHOR_MAX) || 'them'
}

const isSystemParty = (p: PmParty | null) => !p || p.uid === SYSTEM_UID || (!p.uid && /^system$/i.test(p.name))

// One conversation per member. MAM has no thread id. The same donation or
// request tends to arrive under several subjects, so the person is the anchor
// while the subject only marks where the topic turns.
function threadKey(m: PmMessage): string {
  // Some notices name "System" as plain text without a profile link. Those
  // belong with the linked system account rather than in a lookalike thread.
  if (isSystemParty(m.party)) return SYSTEM_UID
  return m.party?.uid ?? `name:${m.party?.name}`
}

const byDate = (a: PmMessage, b: PmMessage) =>
  (a.date ?? '').localeCompare(b.date ?? '') || Number(a.id) - Number(b.id)

/** Groups both boxes into conversations, newest activity first. */
export function buildThreads(messages: PmMessage[]): PmThread[] {
  const groups = new Map<string, PmMessage[]>()
  const seen = new Set<string>()
  for (const m of messages) {
    // A page can arrive twice: once from the DOM, once from a scan.
    const dedupe = `${m.box}:${m.id}`
    if (seen.has(dedupe)) continue
    seen.add(dedupe)
    const key = threadKey(m)
    const list = groups.get(key)
    if (list) list.push(m)
    else groups.set(key, [m])
  }

  const threads: PmThread[] = []
  for (const [key, list] of groups) {
    list.sort(byDate)
    // Newest party wins, so a renamed member shows under the name they use now.
    const withParty = [...list].reverse().find((m) => m.party) ?? list[0]
    const last = list[list.length - 1]
    const topics: string[] = []
    for (const m of list) {
      const topic = baseSubject(m.subject) || NO_SUBJECT
      if (!topics.includes(topic)) topics.push(topic)
    }
    threads.push({
      key,
      party: withParty.party,
      subject: baseSubject(last.subject) || NO_SUBJECT,
      topics,
      messages: list,
      last,
      isSystem: isSystemParty(withParty.party),
    })
  }
  threads.sort((a, b) => byDate(b.last, a.last))
  return threads
}
