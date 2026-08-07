// Profile extractor (/u/<id>). The page is one coltable of label/value rows -
// values can hold links/colors; unknown rows are kept generically.
import { cleanHtml } from '@/lib/sanitize'

export interface ProfileField { label: string; html: string; text: string }
export interface ProfileAction { label: string; href: string; kind: 'friend' | 'block' | 'pm' }

/** The donation record, which MAM serves as a table folded away behind a handle.
 * It gets a card of its own, so the row it came from is not kept as a field. */
export interface Donations {
  label: string
  total: string | null
  headers: string[]
  rows: string[][]
}

export interface ProfileData {
  name: string
  uid: string | null
  country: { name: string; flag: string } | null
  avatar: string | null
  bioHtml: string | null
  fields: ProfileField[]
  donations: Donations | null
  actions: ProfileAction[]
}

const clean = (s: string | null | undefined) => s?.replace(/\s+/g, ' ').trim() ?? ''
const cellsOf = (tr: Element) => [...tr.querySelectorAll(':scope > td, :scope > th')]

/** Header cells on this table are marked colhead the way older MAM pages do. */
function readDonationTable(table: Element, label: string): Donations {
  const trs = [...table.querySelectorAll('tr')].filter((tr) => cellsOf(tr).length > 0)
  const headerRow = trs.find((tr) => cellsOf(tr).every((c) => /(^|\s)colhead/i.test(c.className)))
  return {
    label,
    total: null,
    headers: headerRow ? cellsOf(headerRow).map((c) => clean(c.textContent)) : [],
    rows: trs.filter((tr) => tr !== headerRow).map((tr) => cellsOf(tr).map((c) => clean(c.textContent))),
  }
}

export function extractProfile(doc: Document): ProfileData | null {
  const main = doc.querySelector('#mainBody')
  const h1 = main?.querySelector('h1')
  if (!main || !h1) return null

  const fields: ProfileField[] = []
  let avatar: string | null = null
  let donations: Donations | null = null
  // The user-written "Info" text renders as a label-less full-width row.
  const bioParts: string[] = []
  for (const tr of main.querySelectorAll('table.coltable tr')) {
    const label = tr.querySelector('td.rowhead')
    const value = tr.querySelector('td.row1')
    if (!label && value) {
      const text = value.textContent?.replace(/\s+/g, ' ').trim() ?? ''
      if (text && !/^[\d.,\s]*$/.test(text)) bioParts.push(cleanHtml(value) ?? '')
      continue
    }
    if (!label || !value) continue
    const labelText = label.textContent?.replace(/ /g, ' ').replace(/\s+/g, ' ').trim() ?? ''
    const img = value.querySelector('img.avatar')
    if (img) {
      avatar = img.getAttribute('src')
      continue
    }
    if (!labelText || labelText.length > 60) continue
    // A table folded away behind a handle: the record itself, not a one-line
    // field. The rows of the page's own table are the loop we are in, so the
    // nested one is what belongs to this row.
    const folded = value.querySelector('[data-klappe]') && value.querySelector('table')
    if (folded && !donations) {
      donations = readDonationTable(value.querySelector('table')!, labelText)
      continue
    }
    fields.push({
      label: labelText,
      html: cleanHtml(value) ?? '',
      text: value.textContent?.replace(/\s+/g, ' ').trim() ?? '',
    })
  }

  const actions: ProfileAction[] = [...main.querySelectorAll<HTMLAnchorElement>('a[href*="friends.php?action="], a[href*="sendmessage.php?receiver="]')].map((a) => {
    const href = a.getAttribute('href') ?? '#'
    return {
      label: a.textContent?.replace(/\s+/g, ' ').trim() ?? '',
      href: href.startsWith('/') ? href : '/' + href,
      kind: /type=friend/.test(href) ? ('friend' as const) : /type=block/.test(href) ? ('block' as const) : ('pm' as const),
    }
  }).filter((a) => a.label)

  // The total sits in its own row above the record. With a record on the page it
  // belongs on that card, so it moves out of the field list.
  if (donations) {
    const at = fields.findIndex((f) => /^total donated/i.test(f.label))
    if (at >= 0) {
      donations.total = fields[at].text
      fields.splice(at, 1)
    }
  }

  const flag = main.querySelector<HTMLImageElement>('img.ud_country')
  return {
    name: h1.textContent?.trim() ?? '',
    uid: doc.querySelector('#mainBody input[name="uid"]')?.getAttribute('value') ?? location.pathname.match(/\/u\/(\d+)/)?.[1] ?? null,
    country: flag ? { name: flag.getAttribute('title') ?? '', flag: flag.getAttribute('src') ?? '' } : null,
    avatar,
    bioHtml: bioParts.filter(Boolean).join('<br/>') || null,
    fields,
    donations,
    actions,
  }
}
