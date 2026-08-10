// Extract Rules and FAQ into one knowledge-base model so both render through
// the same searchable accordion UI.
import { cleanHtml } from '@/lib/sanitize'

export interface KbItem {
  id: string
  title: string
  bodyHtml: string
  text: string // plain text for search
  meta: string | null // e.g. rule last-updated date
  updated: boolean // recently updated (rules)
}
export interface KbSection {
  id: string
  title: string
  items: KbItem[]
}

const txt = (el: Element | null | undefined) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''

/** Heading text without the trailing anchor-icon link. */
function headingText(el: Element | null): string {
  if (!el) return ''
  const c = el.cloneNode(true) as HTMLElement
  c.querySelectorAll('a[href^="#"], a[href*="#rc"], a[href*="#rsc"], a[href*="#id_"], img').forEach((a) => a.remove())
  return c.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

export function extractRules(doc: Document): KbSection[] {
  const sections: KbSection[] = []
  for (const cat of doc.querySelectorAll('[style="rulesCat"]')) {
    const h1 = cat.querySelector('h1')
    const items: KbItem[] = []
    for (const sub of cat.querySelectorAll('.rulesSubCat')) {
      const h2a = sub.querySelector('h2 a[data-rscc], h2 a[id^="rsc"]')
      if (!h2a) continue
      const bodyEl = sub.querySelector('.rulesSubCatText')
      const updated = !!sub.querySelector('.RulesRecentUpdated')
      const date = txt(sub.querySelector('.RulesRecentUpdated, .RulesNotRecent')) || null
      items.push({
        id: (h2a as HTMLElement).id || `rule-${items.length}`,
        title: headingText(h2a),
        bodyHtml: cleanHtml(bodyEl) ?? '',
        text: (headingText(h2a) + ' ' + txt(bodyEl)).toLowerCase(),
        meta: date,
        updated,
      })
    }
    if (items.length) {
      sections.push({ id: h1?.querySelector('a[id]')?.id ?? headingText(h1), title: headingText(h1), items })
    }
  }
  return sections
}

export function extractFaq(doc: Document): KbSection[] {
  const sections: KbSection[] = []
  for (const sec of doc.querySelectorAll('.faqMSec')) {
    const h3 = sec.querySelector('h3')
    const items: KbItem[] = []
    // Direct children only: an answer can nest its own <details> blocks (per
    // client walkthroughs) and those belong inside their parent's body.
    for (const det of sec.querySelectorAll(':scope > details')) {
      const q = headingText(det.querySelector(':scope > summary h4') ?? det.querySelector(':scope > summary'))
      const bodyEl = det.querySelector(':scope > .answer')
      if (!q) continue
      items.push({
        id: det.querySelector(':scope > summary a[id]')?.id || `faq-${items.length}`,
        title: q,
        bodyHtml: cleanHtml(bodyEl) ?? '',
        text: (q + ' ' + txt(bodyEl)).toLowerCase(),
        meta: null,
        updated: false,
      })
    }
    if (items.length) {
      sections.push({ id: h3?.querySelector('a[id]')?.id ?? headingText(h3), title: headingText(h3), items })
    }
  }
  return sections
}
