// Posts, messages and requests carry hand-written HTML aimed at MAM's own page:
// a full-width layout and a dark default theme. Both assumptions break in our
// column, so a fragment gets measured against where it actually lands.
import { parseColor, readable, type Rgb } from '@/lib/contrast'
import { TEXT_MIN } from '@/lib/contrast-mode'
import { getPortalContainer } from '@/lib/portals'
import { contrastOn } from '@/lib/theme'

// WCAG AA for body text. Color in a post is decoration; the words are not.
const MIN_CONTRAST = 4.5

/** What a post has to reach. A reader who asked for more contrast means the
 * words on the page, plus on a forum page most of those are in a post. */
const postMin = () => (contrastOn() ? TEXT_MIN : MIN_CONTRAST)
// Below this a background is see-through, so the color behind it still shows.
const OPAQUE_ALPHA = 0.9

/** The paper a fragment is printed on: the card fill of the scheme in force.
 * Read once per pass, since every card in the app carries the same fill. */
function paperColor(): Rgb | null {
  const root = getPortalContainer()
  const token = getComputedStyle(root).getPropertyValue('--card').trim()
  const paper = token ? parseColor(token) : null
  return paper && paper.a >= OPAQUE_ALPHA ? paper : null
}

/** MAM's default theme is dark, so posts written there pick colors that vanish
 * on a light page. Anything that cannot be read gets the smallest nudge that
 * makes it legible; whatever already reads is left exactly as written. */
function fixColors(body: HTMLElement, paper: Rgb, min: number): void {
  for (const el of body.querySelectorAll<HTMLElement>('[style*="color"], font[color]')) {
    // An author who set a background chose the pair together, so that block
    // carries its own contrast plus stays untouched.
    if (el.closest('[style*="background"]')) continue
    const written = el.style.color || el.getAttribute('color')
    if (!written) continue
    const current = parseColor(written)
    // A see-through color reads against whatever it covers, which this pass
    // cannot know, so it keeps whatever the author gave it.
    if (!current || current.a < 1) continue
    const fixed = readable(current, paper, min)
    if (!fixed) continue
    el.removeAttribute('color')
    el.style.color = `rgb(${fixed.r} ${fixed.g} ${fixed.b})`
  }
}

// Sizes in a post were measured against MAM's full-width layout. A percentage
// states a proportion, which still holds in a narrower column, so only the
// absolute ones go. Rows and cells carry them too, not just the table.
const SIZED = 'table, thead, tbody, tfoot, tr, td, th, col, colgroup'
const ABSOLUTE_LENGTH = /^\s*\d+(\.\d+)?(px|pt|pc|in|cm|mm|q)?\s*$/i

/** Fragment ready for our column: tables reflow instead of running off the
 * card. Anything still too wide gets a lane it can scroll inside. Colors that
 * cannot be read on the current paper are lifted onto it. */
export function tameHtml(html: string): string {
  const body = new DOMParser().parseFromString(html, 'text/html').body
  tameTables(body)
  const paper = paperColor()
  if (paper) fixColors(body, paper, postMin())
  return body.innerHTML
}

function tameTables(body: HTMLElement): void {
  for (const el of body.querySelectorAll<HTMLElement>(SIZED)) {
    for (const attr of ['width', 'height']) {
      if (ABSOLUTE_LENGTH.test(el.getAttribute(attr) ?? '')) el.removeAttribute(attr)
    }
    for (const prop of ['width', 'height', 'min-width', 'min-height']) {
      if (ABSOLUTE_LENGTH.test(el.style.getPropertyValue(prop))) el.style.removeProperty(prop)
    }
  }
  for (const table of body.querySelectorAll('table')) {
    // Only the outermost table gets a lane; a nested one rides along inside it.
    if (table.parentElement?.closest('table, .table-lane')) continue
    const lane = body.ownerDocument.createElement('div')
    lane.className = 'table-lane'
    table.replaceWith(lane)
    lane.appendChild(table)
  }
}

/** Whether a fragment opens on a letter. `::first-letter` takes any leading
 * punctuation with it, so a description starting on a quote would set that mark
 * three lines tall instead of the word behind it. Reads the first paragraph the
 * way the rule selects it, since a fragment can carry loose text or a quote
 * ahead of that. Parsed rather than read off the page, since a detached element
 * would fetch every image in the fragment. */
export function opensOnLetter(html: string): boolean {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const opening = doc.body.querySelector(':scope > p')?.textContent?.trim() ?? ''
  return /^\p{L}/u.test(opening)
}
