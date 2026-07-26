// Store extractor (/store.php). The storeTable is a rowspan matrix: each
// section = th>h1 title + description cell + N (cost, button) rows.
import { cleanHtml } from '@/lib/sanitize'

export interface StoreOffer { cost: string; label: string; buttonSelector: string }
export interface StoreSection {
  title: string
  descHtml: string | null
  offers: StoreOffer[]
  inputs: { name: string; placeholder: string }[]
}
export interface StoreData {
  points: string | null
  cheese: string | null
  earningHtml: string | null
  sections: StoreSection[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

function selectorFor(btn: HTMLButtonElement, section: string, i: number): string {
  if (btn.id) return `#${CSS.escape(btn.id)}`
  const cellClass = btn.closest('td')?.className?.split(/\s+/).find(Boolean)
  const value = btn.getAttribute('value') ?? ''
  if (cellClass) return `td.${CSS.escape(cellClass)} button[value="${CSS.escape(value)}"]`
  return `.storeTable button[value="${CSS.escape(value)}"]`
}

export function extractStore(doc: Document): StoreData | null {
  const table = doc.querySelector('.storeTable')
  const main = doc.querySelector('#mainBody')
  if (!table || !main) return null

  const sections: StoreSection[] = []
  let current: StoreSection | null = null
  for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
    const th = tr.querySelector<HTMLElement>(':scope > th h1')
    if (th) {
      const descCell = tr.querySelector(':scope > td[rowspan], :scope > td:not(.cost)')
      let descHtml: string | null = null
      if (descCell) {
        const clone = descCell.cloneNode(true) as HTMLElement
        clone.querySelectorAll('input, button').forEach((e) => e.remove())
        descHtml = cleanHtml(clone)
      }
      const tc = th.cloneNode(true) as HTMLElement
      tc.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
      current = { title: (tc.textContent ?? '').replace(/\s+/g, ' ').trim(), descHtml, offers: [], inputs: [] }
      sections.push(current)
      for (const inp of descCell?.querySelectorAll<HTMLInputElement>('input[name]') ?? []) {
        current.inputs.push({ name: inp.name, placeholder: inp.name.includes('torrent') ? 'Torrent ID' : inp.name })
      }
    }
    if (!current) continue
    const cost = tr.querySelector(':scope > td.cost')
    const btn = tr.querySelector<HTMLButtonElement>('button')
    if (cost && btn) {
      current.offers.push({
        cost: txt(cost) ?? '',
        label: txt(btn) ?? '',
        buttonSelector: selectorFor(btn, current.title, current.offers.length),
      })
    }
    // inputs living in non-rowspan description cells (seedtime/ratio/title rows)
    for (const inp of tr.querySelectorAll<HTMLInputElement>(':scope > td:not(.cost) input[name]')) {
      if (!current.inputs.some((x) => x.name === inp.name)) {
        current.inputs.push({ name: inp.name, placeholder: inp.name.includes('torrent') ? 'Torrent ID' : inp.name.replace(/([A-Z])/g, ' $1').toLowerCase() })
      }
    }
  }

  const earning = main.querySelector('h3')?.nextSibling
  let earningHtml: string | null = null
  {
    // "Points earning" block: text nodes between the first h3 and the cheese h1.
    const container = document.createElement('div')
    let node: ChildNode | null | undefined = earning
    while (node && !(node.nodeType === 1 && (node as Element).matches('h1'))) {
      container.appendChild(node.cloneNode(true))
      node = node.nextSibling
    }
    earningHtml = cleanHtml(container)
  }

  return {
    points: txt(main.querySelector('#currentBonusPoints')),
    cheese: txt(main.querySelector('#currentCheese')),
    earningHtml,
    sections,
  }
}
