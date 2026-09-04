// Color math for text that has to stay readable on the surface it lands on.
// Import-free on purpose, so a module that loads early can reach for it.

// Halving steps for the search toward a readable shade. Twelve puts the answer
// within a thousandth of the blend, far below what an eye can tell apart.
const CORRECTION_STEPS = 12

/** Hues a hashed name can land on, spread far enough apart that neighboring
 * uids stay tellable. Lives here because the name colors plus the pass that
 * keeps them readable both have to walk the same set. */
export const HASH_HUE_STEPS = 24

export interface Rgb {
  r: number
  g: number
  b: number
  a: number
}

export const BLACK: Rgb = { r: 0, g: 0, b: 0, a: 1 }
export const WHITE: Rgb = { r: 255, g: 255, b: 255, a: 1 }

let swatch: CanvasRenderingContext2D | null | undefined

/** Our own tokens compute to lab() while a post writes hex, so the canvas does
 * the reading: every color space the browser knows comes back as sRGB bytes.
 * A value it cannot read paints nothing, which reads as fully transparent. */
function viaCanvas(value: string): Rgb | null {
  // Outside a document there is nothing to paint on.
  if (typeof document === 'undefined') return null
  swatch ??= document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!swatch) return null
  swatch.clearRect(0, 0, 1, 1)
  swatch.fillStyle = 'rgba(0, 0, 0, 0)'
  swatch.fillStyle = value
  swatch.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = swatch.getImageData(0, 0, 1, 1).data
  return { r, g, b, a: a / 255 }
}

/** Plain numeric channels, which is the shape the CSSOM hands back for a color
 * an author wrote. Percentages plus a percentage alpha are valid rgb() that
 * this cannot read, so those say so instead of guessing. */
function fromChannels(inner: string): Rgb | null {
  const parts = inner.split(/[\s,/]+/).filter(Boolean).map(Number)
  if (parts.length < 3 || parts.length > 4) return null
  if (parts.some((n) => !Number.isFinite(n))) return null
  return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 }
}

export function parseColor(value: string): Rgb | null {
  if (!value) return null
  const inner = /^rgba?\(([^)]+)\)/.exec(value)?.[1]
  return (inner ? fromChannels(inner) : null) ?? viaCanvas(value)
}

const toLinear = (v: number) => {
  const s = v / 255
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

export const luminance = (c: Rgb) => 0.2126 * toLinear(c.r) + 0.7152 * toLinear(c.g) + 0.0722 * toLinear(c.b)

export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = luminance(a) > luminance(b) ? [luminance(a), luminance(b)] : [luminance(b), luminance(a)]
  return (hi + 0.05) / (lo + 0.05)
}

export const blend = (from: Rgb, to: Rgb, t: number): Rgb => ({
  r: Math.round(from.r + (to.r - from.r) * t),
  g: Math.round(from.g + (to.g - from.g) * t),
  b: Math.round(from.b + (to.b - from.b) * t),
  a: 1,
})

/** Walks a color toward black or white until it reaches min against the
 * background it really sits on. Only lightness moves, so the hue survives.
 * Paper that neither end can meet keeps the color exactly as written: a
 * washed-out word beats a word repainted for a target it still misses. */
export function readable(fg: Rgb, bg: Rgb, min: number): Rgb | null {
  if (contrast(fg, bg) >= min) return null
  const target = contrast(BLACK, bg) >= contrast(WHITE, bg) ? BLACK : WHITE
  if (contrast(target, bg) < min) return null
  let lo = 0
  let hi = 1
  for (let i = 0; i < CORRECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    if (contrast(blend(fg, target, mid), bg) >= min) hi = mid
    else lo = mid
  }
  return blend(fg, target, hi)
}
