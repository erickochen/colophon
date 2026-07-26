// Profile extractor (/u/<id>). The page is one coltable of label/value rows -
// values can hold links/colors; unknown rows are kept generically.
import { cleanHtml } from '@/lib/sanitize'

export interface ProfileField { label: string; html: string; text: string }
export interface ProfileAction { label: string; href: string; kind: 'friend' | 'block' | 'pm' }
export interface ProfileData {
  name: string
  uid: string | null
  country: { name: string; flag: string } | null
  avatar: string | null
  bioHtml: string | null
  fields: ProfileField[]
  actions: ProfileAction[]
}

export function extractProfile(doc: Document): ProfileData | null {
  const main = doc.querySelector('#mainBody')
  const h1 = main?.querySelector('h1')
  if (!main || !h1) return null

  const fields: ProfileField[] = []
  let avatar: string | null = null
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

  const flag = main.querySelector<HTMLImageElement>('img.ud_country')
  return {
    name: h1.textContent?.trim() ?? '',
    uid: doc.querySelector('#mainBody input[name="uid"]')?.getAttribute('value') ?? location.pathname.match(/\/u\/(\d+)/)?.[1] ?? null,
    country: flag ? { name: flag.getAttribute('title') ?? '', flag: flag.getAttribute('src') ?? '' } : null,
    avatar,
    bioHtml: bioParts.filter(Boolean).join('<br/>') || null,
    fields,
    actions,
  }
}
