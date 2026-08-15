// Freeleech picks extractor (/freeleech.php): server-rendered groups of
// div.freeleechItem inside div.media_cat sections, plus a period selector.
// Group ids read mi-<mediaType>-<mainCat>, where mainCat 0 means neither
// Fiction nor Nonfiction applies.

export interface FlItem {
  tid: string
  title: string
  author: string | null
  cats: { name: string; id: string | null }[]
  language: string | null
  group: string
  mediaTypeId: string
  mainCatId: string
}

export interface FlGroup {
  key: string
  label: string
  mediaType: string
  mediaTypeId: string
  mainCat: string | null
  mainCatId: string
  items: FlItem[]
}

export interface FreeleechData {
  heading: string | null
  seedNote: string | null
  searchHref: string | null
  groups: FlGroup[]
  periods: { value: string; label: string; selected: boolean }[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

/** Direct text lines of an element, so "Audiobook<br>Fiction" splits in two. */
function lines(el: Element | null): string[] {
  if (!el) return []
  return [...el.childNodes]
    .filter((n) => n.nodeType === Node.TEXT_NODE)
    .map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '')
    .filter(Boolean)
}

export function extractFreeleech(doc: Document): FreeleechData | null {
  const list = doc.querySelector('#freeleechList')
  if (!list) return null

  const groups: FlGroup[] = []
  for (const g of list.querySelectorAll<HTMLElement>('.media_cat')) {
    const ids = /^mi-(\d+)-(\d+)$/.exec(g.id)
    const heads = [...g.querySelectorAll('.torrentInfo a')].map(lines).find((l) => l.length > 0) ?? []
    const mediaType = heads[0] ?? txt(g.querySelector('.torrentInfo')) ?? g.id
    const mainCat = heads[1] ?? null
    const items: FlItem[] = []
    // With MAM's group-by-category preference on, a section repeats an item once
    // per genre it carries, so one torrent can appear several times. Our own
    // "Group by" control covers that, so each torrent is read once here.
    const seen = new Set<string>()
    for (const item of g.querySelectorAll<HTMLElement>('.freeleechItem')) {
      const a = item.querySelector<HTMLAnchorElement>('a.fLeech')
      if (!a) continue
      const tid = item.id.replace(/^tid/, '')
      if (seen.has(tid)) continue
      seen.add(tid)
      const lang = item.querySelector('.searchMultiCat a.language')
      items.push({
        tid,
        title: txt(a.querySelector('h4')) ?? txt(a) ?? '',
        author: txt(a.querySelector('.green'))?.replace(/^By:\s*/i, '') ?? null,
        cats: [...item.querySelectorAll<HTMLAnchorElement>('.searchMultiCat a.mCat:not(.language)')].map((c) => ({
          name: txt(c) ?? '',
          id: c.getAttribute('data-mCatID') ?? c.getAttribute('data-mcatid'),
        })),
        language: lang?.getAttribute('title') ?? txt(lang),
        group: g.id,
        mediaTypeId: ids?.[1] ?? '',
        mainCatId: ids?.[2] ?? '0',
      })
    }
    if (items.length) {
      groups.push({
        key: g.id,
        label: mainCat ? `${mediaType} ${mainCat}` : mediaType,
        mediaType,
        mediaTypeId: ids?.[1] ?? '',
        mainCat,
        mainCatId: ids?.[2] ?? '0',
        items,
      })
    }
  }

  return {
    heading: txt(doc.querySelector('#mainBody h1')),
    seedNote: txt(doc.querySelector('#mainBody h2')),
    searchHref: doc.querySelector<HTMLAnchorElement>('#mainBody h3 a[href*="search.php"]')?.getAttribute('href') ?? null,
    groups,
    periods: [...doc.querySelectorAll<HTMLOptionElement>('select[name="past"] option')].map((o) => ({
      value: o.value,
      label: txt(o) ?? o.value,
      selected: o.selected,
    })),
  }
}
