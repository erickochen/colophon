// Inbox extractor (/messages.php?action=viewmailbox). Message bodies are
// server-rendered inline in hidden #ka<id> containers - no extra fetches.
import { cleanHtml } from '@/lib/sanitize'

export interface PmMessage {
  id: string
  date: string | null
  subject: string
  unread: boolean
  /** The other side of the message: the sender in the inbox, the recipient in
   * the sentbox. MAM puts both in the same .pmFrom cell. */
  party: { name: string; href: string | null; color: string | null } | null
  bodyHtml: string | null
  deleteHref: string | null
}

export interface MailboxData {
  box: 'inbox' | 'sent'
  messages: PmMessage[]
  pages: { label: string; href: string; current: boolean }[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

export function extractMailbox(doc: Document): MailboxData | null {
  const table = doc.querySelector('#pmMessages')
  if (!table) return null

  const box = doc.querySelector<HTMLOptionElement>('select[name="box"] option[selected]')?.value === '-1' ? 'sent' : 'inbox'

  const messages: PmMessage[] = []
  for (const toggle of table.querySelectorAll<HTMLAnchorElement>('a[data-pmid]')) {
    const id = toggle.getAttribute('data-pmid')!
    const tr = toggle.closest('tr')
    if (!tr) continue
    const partyA = tr.querySelector<HTMLAnchorElement>('.pmFrom a[href^="/u/"]')
    const subject = txt(tr.querySelector('b')) ?? '(no subject)'
    const body = doc.querySelector(`#ka${id} .pm_msg`)
    messages.push({
      id,
      date: toggle.textContent?.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/)?.[0] ?? null,
      subject,
      // row1 = read, row2 = unread on MAM's zebra; the reliable signal is the
      // bold "new" row class MAM uses - fall back to false when absent.
      unread: tr.classList.contains('row2unread') || tr.classList.contains('unread'),
      party: partyA
        ? { name: txt(partyA) ?? '', href: partyA.getAttribute('href'), color: partyA.querySelector('span')?.style.color || null }
        : null,
      bodyHtml: cleanHtml(body),
      deleteHref: tr.querySelector<HTMLAnchorElement>('a[href*="deletemessage"]')?.getAttribute('href') ?? null,
    })
  }

  const pages: MailboxData['pages'] = []
  const pageDiv = doc.querySelector('#mainBody > div[align="right"]')
  for (const a of pageDiv?.querySelectorAll('a') ?? []) {
    const label = txt(a) ?? ''
    if (!/^\d+$/.test(label) && label !== '>>' && label !== '<<') continue
    if (a.classList.contains('minusDiv')) pages.push({ label, href: '#', current: true })
    else if (/^\d+$/.test(label)) pages.push({ label, href: a.getAttribute('href') ?? '#', current: false })
  }
  // .minusDiv (current page) is an <a> without href in the same container.
  const current = pageDiv?.querySelector('a.minusDiv')
  if (current && !pages.some((p) => p.current)) {
    pages.unshift({ label: txt(current) ?? '1', href: '#', current: true })
  }

  return { box, messages, pages }
}
