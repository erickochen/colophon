// High contrast is derived from whichever scheme is on, so every scheme plus
// every later one is covered by the same pass.
// A relative path with its extension, so a test can import this module straight
// from node the way it imports the modules beside it.
import { BLACK, HASH_HUE_STEPS, WHITE, contrast, parseColor, readable, type Rgb } from './contrast.ts'

// WCAG AAA for small text (SC 1.4.6).
export const TEXT_MIN = 7
// WCAG AA for a border that tells a control apart (SC 1.4.11).
export const SHAPE_MIN = 3
// Halving steps for the lightness search behind the hashed names. Eight lands
// within 0.004, which is finer than the token is ever written.
const LIGHTNESS_STEPS = 8
// Halfway between the two sides, which is where a scheme stops being light.
const MID_LIGHTNESS = 0.5
// Steps per unit of lightness, which puts the value on three decimals like the
// scheme blocks write it.
const LIGHTNESS_SCALE = 1000

/** Every fill a control can land on. A field sits in a card, on the page, in a
 * muted block, in the sidebar, on a highlighted row plus in a secondary panel,
 * so its outline has to hold against all of them. */
export const SURFACES = ['card', 'background', 'muted', 'sidebar', 'accent', 'secondary', 'popover'] as const

/** Every text token the pass rewrites, with the surfaces it has to read on.
 * The heaviest requirement wins, so a color that lands on both a card and the
 * page satisfies both. */
export const TEXT_TOKENS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['foreground', ['card', 'background', 'muted']],
  ['foreground-soft', ['card', 'background', 'muted']],
  ['muted-foreground', ['card', 'background', 'muted']],
  ['card-foreground', ['card']],
  ['popover-foreground', ['popover']],
  ['sidebar-foreground', ['sidebar']],
  ['secondary-foreground', ['secondary']],
  ['accent-foreground', ['accent', 'brand-soft']],
  ['sidebar-accent-foreground', ['sidebar-accent']],
  ['primary-foreground', ['primary']],
  ['sidebar-primary-foreground', ['sidebar-primary']],
  ['destructive-foreground', ['destructive']],
  ['brand', ['card', 'background']],
  ['ok', ['card', 'background']],
  ['warn', ['card', 'background']],
  ['gifted', ['card', 'background']],
  ['user-1', ['card', 'background']],
  ['user-2', ['card', 'background']],
  ['user-3', ['card', 'background']],
  ['user-4', ['card', 'background']],
]

/** Lines that carry no words but do carry meaning: the hairline between blocks,
 * the ring around what has focus. --input stays out of it, since every use of
 * that token is a fill now that the outline has one of its own. */
export const SHAPE_TOKENS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['border', ['card', 'background']],
  ['sidebar-border', ['sidebar']],
  ['ring', ['background', 'card']],
]

/** The outline of a control, which is the only thing telling an empty field
 * from the card behind it. SC 1.4.11 is AA, so this one is lifted in both
 * modes rather than only in high contrast.
 *
 * It starts from --input rather than from itself: a custom property holding
 * var(--input) is substituted where it is declared, so it would freeze at the
 * light value on every dark scheme. */
export const OUTLINE_TOKENS: ReadonlyArray<readonly [string, readonly string[], string]> = [
  ['input-line', SURFACES, 'input'],
]

const HASH_LIGHTNESS = 'user-hash-l'

const WRITTEN = [...TEXT_TOKENS, ...SHAPE_TOKENS, ...OUTLINE_TOKENS].map(([token]) => `--${token}`)

/** Set on the root while the pass is on, so anything that has to redraw when
 * the paper changes can watch one attribute instead of every token. */
export const HIGH_CLASS = 'contrast-high'

const toCss = (c: Rgb) => `rgb(${c.r} ${c.g} ${c.b})`

/** Whether a surface leaves room for the threshold at all. Paper that neither
 * black nor white reads on asks the impossible, so it does not get a vote. */
const canReach = (bg: Rgb, min: number) => Math.max(contrast(BLACK, bg), contrast(WHITE, bg)) >= min

/** Walks one token onto every surface it appears on, keeping the shade the
 * heaviest surface asks for. Two surfaces on opposite sides of mid lightness
 * pull in opposite directions, so the walk repeats until nothing moves. A walk
 * that ends up satisfying none of them hands back the scheme's own value: a
 * half-corrected color changes the look without buying anything. */
function lifted(start: Rgb, grounds: Rgb[], min: number): Rgb {
  let out = start
  for (let round = 0; round < grounds.length; round += 1) {
    let moved = false
    for (const bg of grounds) {
      const next = readable(out, bg, min)
      if (!next) continue
      out = next
      moved = true
    }
    if (!moved) break
  }
  const holds = grounds.every((bg) => !canReach(bg, min) || contrast(out, bg) >= min)
  return holds ? out : start
}

/** Answers already found, keyed by what the search depends on. Browsing the
 * scheme picker repaints on every arrow key while a search costs two hundred
 * canvas readbacks. One entry per scheme, so it stays small. */
const searched = new Map<string, number | null>()

/** The lightness at which every hashed hue reads on both surfaces. A name is
 * hashed to a hue we do not know in advance, so the worst one sets the value. */
function hashLightness(chroma: number, grounds: Rgb[], darkSide: boolean): number | null {
  const key = `${chroma}|${darkSide}|${grounds.map((c) => `${c.r},${c.g},${c.b}`).join('|')}`
  const held = searched.get(key)
  if (held !== undefined) return held
  const answer = searchLightness(chroma, grounds, darkSide)
  searched.set(key, answer)
  return answer
}

function searchLightness(chroma: number, grounds: Rgb[], darkSide: boolean): number | null {
  const hues = Array.from({ length: HASH_HUE_STEPS }, (_, i) => (i * 360) / HASH_HUE_STEPS)
  const reads = (l: number) =>
    hues.every((hue) => {
      const sample = parseColor(`oklch(${l} ${chroma} ${hue})`)
      // A canvas that cannot read the color space paints nothing. Taking that
      // for a shade would let every lightness pass against black.
      if (!sample || sample.a < 1) return false
      return grounds.every((bg) => contrast(sample, bg) >= TEXT_MIN)
    })
  // Light schemes darken their names, dark schemes lighten them.
  let lo = darkSide ? MID_LIGHTNESS : 0
  let hi = darkSide ? 1 : MID_LIGHTNESS
  if (!reads(darkSide ? hi : lo)) return null
  for (let i = 0; i < LIGHTNESS_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    const ok = reads(mid)
    // Both sides narrow from above: a light scheme keeps the highest lightness
    // that still reads, a dark one the lowest. So hi comes down on a shade that
    // reads for dark plus on one that fails for light.
    if (darkSide ? ok : !ok) hi = mid
    else lo = mid
  }
  // Rounded away from the boundary the search just found: to nearest would move
  // the answer a step past the last shade that reads.
  const found = (darkSide ? hi : lo) * LIGHTNESS_SCALE
  return (darkSide ? Math.ceil(found) : Math.floor(found)) / LIGHTNESS_SCALE
}

/** Rewrites the tokens of the scheme in force onto the root as inline values.
 * Switching off removes them again, so the scheme comes back untouched. */
export function applyContrast(rootEl: HTMLElement, on: boolean): void {
  // Clearing first matters: reading a computed value while our own answer still
  // sits on the element would measure the previous pass.
  for (const token of WRITTEN) rootEl.style.removeProperty(token)
  rootEl.style.removeProperty(`--${HASH_LIGHTNESS}`)
  rootEl.classList.toggle(HIGH_CLASS, on)

  const style = getComputedStyle(rootEl)
  const raw = (name: string) => style.getPropertyValue(`--${name}`).trim()
  // Held per pass, since twenty tokens name the same handful of surfaces plus
  // every parse costs a canvas readback.
  const seen = new Map<string, Rgb | null>()
  // A value the canvas cannot read paints nothing, which comes back as
  // transparent black. Taking that for a surface would walk every word to white.
  const read = (name: string): Rgb | null => {
    if (!seen.has(name)) {
      const color = parseColor(raw(name))
      seen.set(name, color && color.a >= 1 ? color : null)
    }
    return seen.get(name) ?? null
  }

  // The outline of a control is an AA floor, so it runs whether or not high
  // contrast is on. Everything below it is the enhanced pass.
  const groups = on
    ? ([[OUTLINE_TOKENS, SHAPE_MIN], [TEXT_TOKENS, TEXT_MIN], [SHAPE_TOKENS, SHAPE_MIN]] as const)
    : ([[OUTLINE_TOKENS, SHAPE_MIN]] as const)

  for (const [pairs, min] of groups) {
    for (const [token, surfaces, from] of pairs) {
      const start = read(from ?? token)
      if (!start) continue
      const grounds = surfaces.map(read).filter((c): c is Rgb => c != null)
      if (grounds.length === 0) continue
      const next = lifted(start, grounds, min)
      if (next !== start) rootEl.style.setProperty(`--${token}`, toCss(next))
    }
  }

  // The hashed names carry words, so they belong to the enhanced pass.
  if (!on) return

  // An undefined custom property reads as the empty string, which Number turns
  // into a perfectly finite zero, so emptiness is checked before the value is.
  const chromaRaw = raw('user-hash-c')
  const heldRaw = raw(HASH_LIGHTNESS)
  if (!chromaRaw || !heldRaw) return
  const chroma = Number(chromaRaw)
  const held = Number(heldRaw)
  const grounds = [read('card'), read('background')].filter((c): c is Rgb => c != null)
  if (!Number.isFinite(chroma) || !Number.isFinite(held) || grounds.length === 0) return
  const darkSide = held > MID_LIGHTNESS
  const found = hashLightness(chroma, grounds, darkSide)
  if (found == null) return
  // Only ever toward more contrast: a scheme that already sits deeper than the
  // search allows keeps its own value.
  const next = darkSide ? Math.max(held, found) : Math.min(held, found)
  if (next !== held) rootEl.style.setProperty(`--${HASH_LIGHTNESS}`, String(next))
}
