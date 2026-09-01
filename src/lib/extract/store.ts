// Store extractor (/store.php). MAM serves two layouts, switched with its own
// ?switchView link. The table layout is a rowspan matrix of th>h1 title,
// description cell plus (cost, button) rows. The row layout writes a section as
// an h2.bonusRow heading with the block after it, pricing on button[title].
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

const flat = (s: string) => s.replace(/\s+/g, ' ').trim()

/** The element carrying the class that names the purchase: the cell in the
 * table layout, the block after the heading in the row layout. */
const kindHost = (btn: HTMLButtonElement): Element | null => btn.closest('td, .bonusRow')

/** MAM marks each purchase with its own cell class or button id; site.js binds
 * the matching call to exactly those. Anything else stays generic plus keeps
 * going through MAM's own button. */
function kindOf(btn: HTMLButtonElement): StoreKind {
  if (btn.id === 'seedtimeButton') return 'seedtime'
  if (btn.id === 'giveTitle') return 'title'
  const host = kindHost(btn)?.className ?? ''
  if (/uploadCreditContent/.test(host)) return 'upload'
  if (/vipStatusContent/.test(host)) return 'vip'
  if (/cheeseWedgesContent/.test(host)) return 'wedges'
  return 'other'
}

/** "1250 points" plus "5 cheese" carry a figure; "variable points" does not. */
function priceOf(cost: string): { points: number | null; cheese: number | null } {
  const n = Number(cost.replace(/,/g, '').match(/\d+/)?.[0])
  if (!Number.isFinite(n)) return { points: null, cheese: null }
  return /cheese/i.test(cost) ? { points: null, cheese: n } : { points: n, cheese: null }
}

/** The class naming the purchase, so one selector fits both layouts: the row
 * layout wraps that same name in bonusRow plus hideMe. */
function hostClass(el: Element | null): string | null {
  const classes = (el?.className ?? '').split(/\s+/).filter(Boolean)
  return classes.find((c) => c.endsWith('Content')) ?? null
}

function selectorFor(btn: HTMLButtonElement): string {
  if (btn.id) return `#${CSS.escape(btn.id)}`
  const value = btn.getAttribute('value') ?? ''
  const cls = hostClass(kindHost(btn))
  if (cls) return `.${CSS.escape(cls)} button[value="${CSS.escape(value)}"]`
  return `#mainBody button[value="${CSS.escape(value)}"]`
}

/** MAM's own words around a purchase, with its controls taken out. */
function describe(el: Element | null | undefined): string | null {
  if (!el) return null
  const clone = el.cloneNode(true) as HTMLElement
  clone.querySelectorAll('input, button').forEach((e) => e.remove())
  return cleanHtml(clone)
}

function addOffer(section: StoreSection, cost: string, btn: HTMLButtonElement): void {
  // Every row of a block posts the same call, so the first one names it.
  if (section.kind === 'other') section.kind = kindOf(btn)
  section.offers.push({
    cost,
    label: txt(btn) ?? '',
    ...priceOf(cost),
    value: btn.getAttribute('value'),
    buttonSelector: selectorFor(btn),
  })
}

function addInput(section: StoreSection, inp: HTMLInputElement): void {
  if (section.inputs.some((x) => x.name === inp.name)) return
  section.inputs.push({
    name: inp.name,
    placeholder: inp.name.includes('torrent') ? 'Torrent ID' : inp.name,
  })
}

function addInputs(section: StoreSection, root: Element | null | undefined): void {
  for (const inp of root?.querySelectorAll<HTMLInputElement>('input[name]') ?? []) addInput(section, inp)
}

const emptySection = (title: string, descHtml: string | null): StoreSection => ({
  kind: 'other', title, descHtml, offers: [], inputs: [],
})

function readTable(table: Element): StoreSection[] {
  const sections: StoreSection[] = []
  let current: StoreSection | null = null
  for (const tr of table.querySelectorAll(':scope > tbody > tr, :scope > tr')) {
    const th = tr.querySelector<HTMLElement>(':scope > th h1')
    if (th) {
      const descCell = tr.querySelector(':scope > td[rowspan], :scope > td:not(.cost)')
      const tc = th.cloneNode(true) as HTMLElement
      tc.querySelectorAll('br').forEach((br) => br.replaceWith(' '))
      current = emptySection(flat(tc.textContent ?? ''), describe(descCell))
      sections.push(current)
      addInputs(current, descCell)
    }
    if (!current) continue
    const cost = tr.querySelector(':scope > td.cost')
    const btn = tr.querySelector<HTMLButtonElement>('button')
    if (cost && btn) addOffer(current, txt(cost) ?? '', btn)
    // Inputs living in non-rowspan description cells (seedtime/ratio/title rows)
    for (const cell of tr.querySelectorAll(':scope > td:not(.cost)')) addInputs(current, cell)
  }
  return sections
}

/** One purchase per h3, in both layouts. The row layout groups several of them
 * under one heading ("Torrent changes"), so a block splits on its headings and
 * nothing an account is offered goes missing. The nodes stay live, so a button
 * still knows which block it sits in. */
function splitOnHeadings(body: Element): ChildNode[][] {
  const parts: ChildNode[][] = []
  let current: ChildNode[] | null = null
  for (const node of body.childNodes) {
    if (!current || (node.nodeType === Node.ELEMENT_NODE && (node as Element).matches('h3'))) {
      current = []
      parts.push(current)
    }
    current.push(node)
  }
  return parts
}

/** Elements of one kind inside a run of nodes, the nodes themselves included. */
function within<T extends Element>(nodes: ChildNode[], selector: string): T[] {
  const out: T[] = []
  for (const node of nodes) {
    if (node.nodeType !== Node.ELEMENT_NODE) continue
    const el = node as Element
    if (el.matches(selector)) out.push(el as T)
    out.push(...el.querySelectorAll<T>(selector))
  }
  return out
}

function readRows(main: Element): StoreSection[] {
  const sections: StoreSection[] = []
  for (const head of main.querySelectorAll('h2.bonusRow')) {
    const body = head.nextElementSibling
    if (!body?.classList.contains('bonusRow')) continue
    const parts = splitOnHeadings(body).filter((p) => within(p, 'button').length > 0)
    for (const part of parts) {
      // With one purchase the block heading names it; with several, each h3 does.
      const own = parts.length > 1 ? flat(txt(within(part, 'h3')[0]) ?? '') : ''
      const clone = body.ownerDocument.createElement('div')
      part.forEach((n) => clone.appendChild(n.cloneNode(true)))
      // A heading used as the title would read twice inside the block itself.
      if (own) clone.querySelector('h3')?.remove()
      const section = emptySection(own || flat(head.textContent ?? ''), describe(clone))
      for (const btn of within<HTMLButtonElement>(part, 'button')) {
        addOffer(section, btn.getAttribute('title') ?? '', btn)
      }
      for (const inp of within<HTMLInputElement>(part, 'input[name]')) addInput(section, inp)
      sections.push(section)
    }
  }
  return sections
}

export function extractStore(doc: Document): StoreData | null {
  const main = doc.querySelector('#mainBody')
  if (!main) return null
  const table = doc.querySelector('.storeTable')
  const sections = table ? readTable(table) : readRows(main)
  if (sections.length === 0) return null

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
