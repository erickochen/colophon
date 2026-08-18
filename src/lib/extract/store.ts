// Store extractor (/store.php). The storeTable is a rowspan matrix: each
// section = th>h1 title + description cell + N (cost, button) rows.
import { cleanHtml } from '@/lib/sanitize'

/** Which purchase a block makes. MAM binds each one to its own call, so the
 * kind decides both the wording plus which endpoint the button reaches. */
export type StoreKind = 'upload' | 'vip' | 'wedges' | 'seedtime' | 'title' | 'other'

export interface StoreOffer {
  /** MAM's own words for the price, e.g. "1250 points" or "5 cheese". */
  cost: string
  label: string
  /** What the price comes to, null where MAM only says "variable". */
  points: number | null
  cheese: number | null
  /** The value MAM's own handler sends along, e.g. "2.5", "max", "cheese". */
  value: string | null
  buttonSelector: string
}

export interface StoreSection {
  kind: StoreKind
  title: string
  descHtml: string | null
  offers: StoreOffer[]
  inputs: { name: string; placeholder: string }[]
}
/** The figures behind MAM's "Points earning" paragraph. Null where the wording
 * changed, in which case the paragraph itself is shown instead. */
export interface StoreEarning {
  satisfied: number | null
  unsatisfied: number | null
  leeching: number | null
  updatedAt: string | null
}

export interface StoreData {
  points: string | null
  cheese: string | null
  earning: StoreEarning | null
  earningHtml: string | null
  sections: StoreSection[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? null

/** MAM marks each purchase with its own cell class or button id; site.js binds
 * the matching call to exactly those. Anything else stays generic plus keeps
 * going through MAM's own button. */
function kindOf(btn: HTMLButtonElement): StoreKind {
  if (btn.id === 'seedtimeButton') return 'seedtime'
  if (btn.id === 'giveTitle') return 'title'
  const cell = btn.closest('td')?.className ?? ''
  if (/uploadCreditContent/.test(cell)) return 'upload'
  if (/vipStatusContent/.test(cell)) return 'vip'
  if (/cheeseWedgesContent/.test(cell)) return 'wedges'
  return 'other'
}

/** "1250 points" plus "5 cheese" carry a figure; "variable points" does not. */
function priceOf(cost: string): { points: number | null; cheese: number | null } {
  const n = Number(cost.replace(/,/g, '').match(/\d+/)?.[0])
  if (!Number.isFinite(n)) return { points: null, cheese: null }
  return /cheese/i.test(cost) ? { points: null, cheese: n } : { points: n, cheese: null }
}

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
      current = { kind: 'other', title: (tc.textContent ?? '').replace(/\s+/g, ' ').trim(), descHtml, offers: [], inputs: [] }
      sections.push(current)
      for (const inp of descCell?.querySelectorAll<HTMLInputElement>('input[name]') ?? []) {
        current.inputs.push({ name: inp.name, placeholder: inp.name.includes('torrent') ? 'Torrent ID' : inp.name })
      }
    }
    if (!current) continue
    const cost = tr.querySelector(':scope > td.cost')
    const btn = tr.querySelector<HTMLButtonElement>('button')
    if (cost && btn) {
      const price = txt(cost) ?? ''
      // Every row of a block posts the same call, so the first one names it.
      if (current.kind === 'other') current.kind = kindOf(btn)
      current.offers.push({
        cost: price,
        label: txt(btn) ?? '',
        ...priceOf(price),
        value: btn.getAttribute('value'),
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
    earning: readEarning(earningHtml),
    earningHtml,
    sections,
  }
}

const figure = (text: string, re: RegExp): number | null => {
  const n = Number(re.exec(text)?.[1])
  return Number.isFinite(n) ? n : null
}

/** Pulls the counts out of MAM's earning paragraph. One figure we know is
 * enough to use it; none means the wording moved on. */
function readEarning(html: string | null): StoreEarning | null {
  if (!html) return null
  const text = new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
  const found: StoreEarning = {
    satisfied: figure(text, /(\d+)\s+satisfied torrents/i),
    unsatisfied: figure(text, /(\d+)\s+seeding unsatisfied/i),
    leeching: figure(text, /(\d+)\s+leeching torrents/i),
    updatedAt: /Last update was\s+([\d-]+\s[\d:]+)/i.exec(text)?.[1] ?? null,
  }
  return Object.values(found).some((v) => v != null) ? found : null
}
