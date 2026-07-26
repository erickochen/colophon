// Freeleech picks extractor (/freeleech.php): server-rendered groups of
// div.freeleechItem inside div.media_cat sections, plus a period selector.

export interface FlItem {
  tid: string
  title: string
  author: string | null
  cats: { name: string; id: string | null }[]
  language: string | null
  group: string
}

export interface FreeleechData {
  heading: string | null
  seedNote: string | null
  groups: { key: string; label: string; items: FlItem[] }[]
  periods: { value: string; label: string; selected: boolean }[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

export function extractFreeleech(doc: Document): FreeleechData | null {
  const list = doc.querySelector('#freeleechList')
  if (!list) return null

  const groups: FreeleechData['groups'] = []
  for (const g of list.querySelectorAll<HTMLElement>('.media_cat')) {
    const label = txt(g.querySelector('.torrentInfo'))?.replace(/\s+/g, ' ') ?? g.id
    const items: FlItem[] = []
    for (const item of g.querySelectorAll<HTMLElement>('.freeleechItem')) {
      const a = item.querySelector<HTMLAnchorElement>('a.fLeech')
      if (!a) continue
      const lang = item.querySelector('.searchMultiCat a.language')
      items.push({
        tid: item.id.replace(/^tid/, ''),
        title: txt(a.querySelector('h4')) ?? txt(a) ?? '',
        author: txt(a.querySelector('.green'))?.replace(/^By:\s*/i, '') ?? null,
        cats: [...item.querySelectorAll<HTMLAnchorElement>('.searchMultiCat a.mCat:not(.language)')].map((c) => ({
          name: txt(c) ?? '',
          id: c.getAttribute('data-mCatID') ?? c.getAttribute('data-mcatid'),
        })),
        language: lang?.getAttribute('title') ?? txt(lang),
        group: g.id,
      })
    }
    if (items.length) groups.push({ key: g.id, label, items })
  }

  return {
    heading: txt(doc.querySelector('#mainBody h1')),
    seedNote: txt(doc.querySelector('#mainBody h2')),
    groups,
    periods: [...doc.querySelectorAll<HTMLOptionElement>('select[name="past"] option')].map((o) => ({
      value: o.value,
      label: txt(o) ?? o.value,
      selected: o.selected,
    })),
  }
}
