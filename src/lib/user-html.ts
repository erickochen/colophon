// Posts, messages and requests carry hand-written HTML aimed at MAM's own page:
// a full-width layout and a dark default theme. Both assumptions break in our
// column, so a fragment gets measured against where it actually lands.
import { getPortalContainer } from '@/lib/portals'

// WCAG AA for body text. Color in a post is decoration; the words are not.
const MIN_CONTRAST = 4.5
// Halving steps for the search toward a readable shade. Twelve puts the answer
// within a thousandth of the blend, far below what an eye can tell apart.
const CORRECTION_STEPS = 12
// Below this a background is see-through, so the color behind it still shows.
const OPAQUE_ALPHA = 0.9

interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

let swatch: CanvasRenderingContext2D | null | undefined

/** Our own tokens compute to lab() while a post writes hex, so the canvas does
 * the reading: every color space the browser knows comes back as sRGB bytes.
 * A value it cannot read paints nothing, which reads as fully transparent. */
function viaCanvas(value: string): Rgb | null {
  swatch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!swatch) return null
  swatch.clearRect(0, 0, 1, 1)
  swatch.fillStyle = 'rgba(0, 0, 0, 0)'
  swatch.fillStyle = value
  swatch.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: a / 255 }
}

function parseColor(value: string): Rgb | null {
  const inner = /^rgba?\(([^)]+)\)/.exec(value)?.[1]
  if (!inner) return value ? viaCanvas(value) : null
  const parts = inner.split(/[\s,/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.slice(0, 3).some((n) => !Number.isFinite(n))) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 && Number.isFinite(parts[3]) ? parts[3] : 1 }
}

const toLinear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

const luminance = (c: Rgb) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b)

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
  return (hi + 0.05) / (lo + 0.05)
}

const blend = (from: Rgb, to: Rgb, t: number): Rgb => ({
  r: Math.round(from.r + (to.r - from.r) * t),
  g: Math.round(from.g + (to.g - from.g) * t),
  b: Math.round(from.b + (to.b - from.b) * t),
  a: 1,
})

const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }
const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }

/** Walks a color toward black or white until it reads on the background it
 * really sits on. Only lightness moves, so the hue the author picked survives.
 * Paper that neither end can meet keeps the color exactly as written: a
 * washed-out word beats a word repainted for a target it still misses. */
function readable(fg: Rgb, bg: Rgb): Rgb | null {
  if (contrast(fg, bg) >= MIN_CONTRAST) return null
  const target = contrast(BLACK, bg) >= contrast(WHITE, bg) ? BLACK : WHITE
  if (contrast(target, bg) < MIN_CONTRAST) return null
  let lo = 0
  let hi = 1
  for (let i = 0; i < CORRECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    if (contrast(blend(fg, target, mid), bg) >= MIN_CONTRAST) hi = mid
    else lo = mid
  }
  return blend(fg, target, hi)
}

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
function fixColors(body: HTMLElement, paper: Rgb): void {
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
    const fixed = readable(current, paper)
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
  if (paper) fixColors(body, paper)
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
