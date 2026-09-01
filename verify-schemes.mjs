// Checks src/schemes.gen.css and the generated region in src/lib/theme.ts
// against schemes/palettes.mjs. Deliberately shares no code with the
// generator: values are recomputed straight from the canonical hex.
import { readFileSync } from 'node:fs'
import { converter, wcagContrast } from 'culori'
import { families } from './schemes/palettes.mjs'

const CSS_FILE = new URL('./src/schemes.gen.css', import.meta.url)
const THEME_FILE = new URL('./src/lib/theme.ts', import.meta.url)

// WCAG AA for small text; the bar every text-bearing token must reach.
const TEXT_MIN_CONTRAST = 4.5
// WCAG AA for large text; the button label on a destructive fill, where the
// best of page and foreground color is all there is to pick from.
const FILL_TEXT_MIN_CONTRAST = 3.0
// Text tokens keep the canonical hue; allow only the CSS rounding.
const HUE_TOLERANCE = 0.5
// Chroma is emitted at four decimals and must survive the round trip.
const CHROMA_TOLERANCE = 0.0002
// A hover tone this close to the card cannot read as hover, so the generator
// is allowed to step away from the palette's named value there.
const HOVER_MIN_GAP = 0.015
// An active control has to stand out from the card plus the sidebar under it.
// gen-schemes.mjs uses the same number with the same metric.
const ACTIVE_MIN_GAP = 0.025
// Hover and active are two states, so they may not land on one tone.
const HOVER_VS_ACTIVE_GAP = 0.012

const toOklch = converter('oklch')
const toRgb = converter('rgb')
const round = (x, digits) => Number(x.toFixed(digits))

/** The color as a screen shows it: converted to sRGB, clipped per channel then
 * rounded to 8 bit. An oklch value can sit outside sRGB, where measuring it
 * unclipped reads higher than the pixels ever do. */
function painted(color) {
  const c = toRgb(color)
  const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255) / 255
  return { mode: 'rgb', r: q(c.r), g: q(c.g), b: q(c.b) }
}

const contrast = (a, b) => wcagContrast(painted(a), painted(b))

function oklchFromHex(hex) {
  const { l, c, h } = toOklch(hex)
  return { l, c, h: h ?? 0 }
}

function expectedCss(hex) {
  const { l, c, h } = oklchFromHex(hex)
  return `oklch(${round(l, 4)} ${round(c, 4)} ${round(h, 2)})`
}

function parseOklch(value) {
  const m = value?.match(/^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/)
  if (!m) return null
  return { mode: 'oklch', l: Number(m[1]), c: Number(m[2]), h: Number(m[3]) }
}

function hueDiff(a, b) {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

const css = readFileSync(CSS_FILE, 'utf8')
const themeTs = readFileSync(THEME_FILE, 'utf8')

function blockFor(scheme) {
  const selector = scheme.side === 'dark' ? `.dark.scheme-${scheme.id}` : `.scheme-${scheme.id}:not(.dark)`
  const start = css.indexOf(`${selector} {`)
  if (start === -1) return null
  const end = css.indexOf('}', start)
  const tokens = {}
  for (const line of css.slice(start, end).split('\n')) {
    const m = line.match(/^ {2}--([\w-]+): (.+);$/)
    if (m) tokens[m[1]] = m[2]
  }
  return tokens
}

const pageBg = {}
for (const m of themeTs.matchAll(/'([\w-]+)': '(oklch\([^)]+\))',/g)) pageBg[m[1]] = m[2]

const genLight = themeTs.match(/GEN_LIGHT_SCHEMES = \[([^\]]*)\]/)?.[1] ?? ''
const genDark = themeTs.match(/GEN_DARK_SCHEMES = \[([^\]]*)\]/)?.[1] ?? ''

let failures = 0
const fail = (id, msg) => {
  failures++
  console.error(`FAIL ${id}: ${msg}`)
}

for (const family of families) {
  for (const scheme of family.schemes) {
    const { id, roles, side } = scheme
    const schemeFailuresBefore = failures
    const tokens = blockFor(scheme)
    if (!tokens) {
      fail(id, 'no CSS block found')
      continue
    }
    const color = (name) => family.colors[name]

    // Anchors carry the canonical value byte for byte.
    const anchors = {
      background: roles.background,
      'brand-fill': roles.brand,
      'ok-fill': roles.ok,
      'chart-1': roles.charts[0],
      'chart-2': roles.charts[1],
      'chart-3': roles.charts[2],
      'chart-4': roles.charts[3],
      'chart-5': roles.charts[4],
    }
    if (roles.card) anchors.card = roles.card
    if (roles.sidebar) anchors.sidebar = roles.sidebar
    if (roles.highlight) anchors['brand-soft'] = roles.highlight
    if (roles.border) anchors.border = roles.border
    let anchorCount = 0
    for (const [token, ref] of Object.entries(anchors)) {
      const want = expectedCss(color(ref))
      if (tokens[token] !== want) fail(id, `--${token} is ${tokens[token]}, canonical ${ref} converts to ${want}`)
      else anchorCount++
    }

    // Text tokens keep canonical hue plus chroma; only lightness may shift.
    // The result must read against both surfaces.
    const bg = parseOklch(tokens.background)
    const card = parseOklch(tokens.card)
    // A muted block carries body copy too, so it counts as a surface here.
    const muted = parseOklch(tokens.muted)
    const textRefs = {
      foreground: roles.foreground,
      brand: roles.brand,
      ok: roles.ok,
      warn: roles.warn,
      gifted: roles.gifted,
      destructive: roles.destructive,
      'user-1': roles.users[0],
      'user-2': roles.users[1],
      'user-3': roles.users[2],
      'user-4': roles.users[3],
    }
    if (roles.mutedForeground) textRefs['muted-foreground'] = roles.mutedForeground
    let textCount = 0
    for (const [token, ref] of Object.entries(textRefs)) {
      const got = parseOklch(tokens[token])
      const want = oklchFromHex(color(ref))
      if (!got) {
        fail(id, `--${token} is not a plain oklch value`)
        continue
      }
      // Colors close to gray carry no meaningful hue, so skip the hue check there.
      if (want.c > CHROMA_TOLERANCE * 4 && hueDiff(got.h, want.h) > HUE_TOLERANCE)
        fail(id, `--${token} hue ${got.h} strays from canonical ${round(want.h, 1)} (${ref})`)
      if (Math.abs(got.c - want.c) > CHROMA_TOLERANCE)
        fail(id, `--${token} chroma ${got.c} strays from canonical ${round(want.c, 3)} (${ref})`)
      const worst = Math.min(
        contrast(got, bg),
        card ? contrast(got, card) : Infinity,
        muted ? contrast(got, muted) : Infinity
      )
      if (worst < TEXT_MIN_CONTRAST) fail(id, `--${token} contrast ${worst.toFixed(2)} under ${TEXT_MIN_CONTRAST}`)
      else textCount++
    }

    // Foreground pairs on their own surfaces. The soft tone carries body copy
    // on all three panels the app draws it on, so it is checked on each.
    const pairs = [
      ['foreground-soft', 'background'],
      ['foreground-soft', 'card'],
      ['foreground-soft', 'muted'],
      ['muted-foreground', 'background'],
      ['muted-foreground', 'card'],
      ['muted-foreground', 'muted'],
      ['accent-foreground', 'accent'],
      // The active state in the UI: text-accent-foreground on bg-brand-soft.
      ['accent-foreground', 'brand-soft'],
      ['primary-foreground', 'primary'],
      ['sidebar-foreground', 'sidebar'],
      ['sidebar-accent-foreground', 'sidebar-accent'],
    ]
    for (const [fgTok, bgTok] of pairs) {
      const a = parseOklch(tokens[fgTok])
      const b = parseOklch(tokens[bgTok])
      if (!a || !b) {
        fail(id, `missing pair --${fgTok} / --${bgTok}`)
        continue
      }
      const ratio = contrast(a, b)
      if (ratio < TEXT_MIN_CONTRAST) fail(id, `--${fgTok} on --${bgTok} contrast ${ratio.toFixed(2)} under ${TEXT_MIN_CONTRAST}`)
    }
    if (!card) fail(id, '--card is not a plain oklch value')

    // The hover surface: the palette's own tone, unless that tone sits on the
    // card, in which case it has to land between the card and the active state.
    if (roles.hover && card) {
      const want = expectedCss(color(roles.hover))
      if (tokens.accent !== want) {
        const named = oklchFromHex(color(roles.hover))
        const gap = Math.hypot(named.l - card.l, named.c - card.c)
        const got = parseOklch(tokens.accent)
        const soft = parseOklch(tokens['brand-soft'])
        if (gap >= HOVER_MIN_GAP)
          fail(id, `--accent is ${tokens.accent}, canonical ${roles.hover} converts to ${want}`)
        else if (!got || !soft || (got.l - card.l) * (soft.l - card.l) <= 0 || Math.abs(got.l - card.l) > Math.abs(soft.l - card.l))
          fail(id, `--accent ${tokens.accent} does not sit between --card and --brand-soft`)
      }
    }

    // An active control has to be tellable from the panel it sits on plus from
    // the hover state drawn on that same panel.
    const soft = parseOklch(tokens['brand-soft'])
    const sidebar = parseOklch(tokens.sidebar)
    for (const [name, surface] of [['card', card], ['sidebar', sidebar]]) {
      if (!soft || !surface) continue
      const d = Math.hypot(soft.l - surface.l, soft.c - surface.c)
      if (d < ACTIVE_MIN_GAP) fail(id, `--brand-soft is ${d.toFixed(3)} from --${name}, under ${ACTIVE_MIN_GAP}`)
    }
    for (const hoverTok of ['accent', 'sidebar-accent']) {
      const hv = parseOklch(tokens[hoverTok])
      if (!soft || !hv) continue
      const d = Math.hypot(soft.l - hv.l, soft.c - hv.c)
      if (d < HOVER_VS_ACTIVE_GAP) fail(id, `--${hoverTok} is ${d.toFixed(3)} from --brand-soft, under ${HOVER_VS_ACTIVE_GAP}`)
    }

    const dfg = parseOklch(tokens['destructive-foreground'])
    const dbg = parseOklch(tokens.destructive)
    if (dfg && dbg && contrast(dfg, dbg) < FILL_TEXT_MIN_CONTRAST)
      fail(id, `--destructive-foreground contrast ${contrast(dfg, dbg).toFixed(2)} under ${FILL_TEXT_MIN_CONTRAST}`)

    // Boot veil and registration stay in step with the CSS.
    if (pageBg[id] !== tokens.background) fail(id, `PAGE_BG '${pageBg[id]}' differs from --background ${tokens.background}`)
    const list = side === 'dark' ? genDark : genLight
    if (!list.includes(`'${id}'`)) fail(id, `missing from GEN_${side.toUpperCase()}_SCHEMES`)

    if (failures === schemeFailuresBefore) console.log(`PASS ${id} (${anchorCount} anchors, ${textCount} text tokens)`)
  }
}

const total = families.reduce((n, f) => n + f.schemes.length, 0)
if (failures > 0) {
  console.error(`verify-schemes: ${failures} failure(s) across ${total} schemes`)
  process.exit(1)
}
console.log(`verify-schemes: all ${total} schemes match their canonical palettes`)
