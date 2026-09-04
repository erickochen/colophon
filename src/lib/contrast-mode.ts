// High contrast is derived from whichever scheme is on, so every scheme plus
// every later one is covered by the same pass.
import { HASH_HUE_STEPS } from '@/lib/colors'
import { contrast, parseColor, readable, type Rgb } from '@/lib/contrast'

// WCAG AAA for small text (SC 1.4.6).
export const TEXT_MIN = 7
// WCAG AA for a border that tells a control apart (SC 1.4.11).
export const SHAPE_MIN = 3
// Halving steps for the lightness search behind the hashed names. Eight lands
// within 0.004, which is finer than the token is ever written.
const LIGHTNESS_STEPS = 8
// Halfway between the two sides, which is where a scheme stops being light.
const MID_LIGHTNESS = 0.5
// Decimals the lightness is written with, matching the scheme blocks.
const LIGHTNESS_DECIMALS = 3

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

/** Lines that carry no words but do carry meaning: the edge of a field, the
 * ring around what has focus. */
export const SHAPE_TOKENS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['border', ['card', 'background']],
  ['input', ['card', 'background']],
  ['sidebar-border', ['sidebar']],
  ['ring', ['background', 'card']],
]

const HASH_LIGHTNESS = 'user-hash-l'

const WRITTEN = [...TEXT_TOKENS, ...SHAPE_TOKENS].map(([token]) => `--${token}`)

const toCss = (c: Rgb) => `rgb(${c.r} ${c.g} ${c.b})`

/** Walks one token onto every surface it appears on, keeping the shade the
 * heaviest surface asks for. */
function lifted(start: Rgb, grounds: Rgb[], min: number): Rgb {
  let out = start
  for (const bg of grounds) out = readable(out, bg, min) ?? out
  return out
}

/** The lightness at which every hashed hue reads on both surfaces. A name is
 * hashed to a hue we do not know in advance, so the worst one sets the value. */
function hashLightness(chroma: number, grounds: Rgb[], darkSide: boolean): number | null {
  const hues = Array.from({ length: HASH_HUE_STEPS }, (_, i) => (i * 360) / HASH_HUE_STEPS)
  const reads = (l: number) =>
    hues.every((hue) => {
      const sample = parseColor(`oklch(${l} ${chroma} ${hue})`)
      return sample != null && grounds.every((bg) => contrast(sample, bg) >= TEXT_MIN)
    })
  // Light schemes darken their names, dark schemes lighten them.
  let lo = darkSide ? MID_LIGHTNESS : 0
  let hi = darkSide ? 1 : MID_LIGHTNESS
  if (!reads(darkSide ? hi : lo)) return null
  for (let i = 0; i < LIGHTNESS_STEPS; i += 1) {
    const mid = (lo + hi) / 2
    const ok = reads(mid)
    // A light scheme walks its ceiling down to the last shade that still reads,
    // a dark one walks its floor down to the first.
    if (darkSide ? ok : !ok) hi = mid
    else lo = mid
  }
  return Number((darkSide ? hi : lo).toFixed(LIGHTNESS_DECIMALS))
}

/** Rewrites the tokens of the scheme in force onto the root as inline values.
 * Switching off removes them again, so the scheme comes back untouched. */
export function applyContrast(rootEl: HTMLElement, on: boolean): void {
  // Clearing first matters: reading a computed value while our own answer still
  // sits on the element would measure the previous pass.
  for (const token of WRITTEN) rootEl.style.removeProperty(token)
  rootEl.style.removeProperty(`--${HASH_LIGHTNESS}`)
  if (!on) return

  const style = getComputedStyle(rootEl)
  const raw = (name: string) => style.getPropertyValue(`--${name}`).trim()
  // A value the canvas cannot read paints nothing, which comes back as
  // transparent black. Taking that for a surface would walk every word to white.
  const read = (name: string): Rgb | null => {
    const color = parseColor(raw(name))
    return color && color.a >= 1 ? color : null
  }

  for (const [pairs, min] of [
    [TEXT_TOKENS, TEXT_MIN],
    [SHAPE_TOKENS, SHAPE_MIN],
  ] as const) {
    for (const [token, surfaces] of pairs) {
      const start = read(token)
      if (!start) continue
      const grounds = surfaces.map(read).filter((c): c is Rgb => c != null)
      if (grounds.length === 0) continue
      const next = lifted(start, grounds, min)
      if (next !== start) rootEl.style.setProperty(`--${token}`, toCss(next))
    }
  }

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
