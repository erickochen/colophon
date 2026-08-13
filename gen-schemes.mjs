// Generates the color scheme CSS and registration code from schemes/palettes.mjs.
// Outputs: src/schemes.gen.css, src/lib/schemes.gen.ts and the marked region in
// src/lib/theme.ts. Run via `pnpm gen`; verify-schemes.mjs checks the result.
import { readFileSync, writeFileSync } from 'node:fs'
import { converter, wcagContrast } from 'culori'
import { families } from './schemes/palettes.mjs'

const CSS_OUT = new URL('./src/schemes.gen.css', import.meta.url)
const TS_OUT = new URL('./src/lib/schemes.gen.ts', import.meta.url)
const THEME_TS = new URL('./src/lib/theme.ts', import.meta.url)

const GEN_START = '// @gen-schemes:start'
const GEN_END = '// @gen-schemes:end'

const toOklch = converter('oklch')

// WCAG AA for small text; every token that carries copy must reach this
// against both the page and the card surface.
export const TEXT_MIN_CONTRAST = 4.5

// WCAG 2.1 non-text contrast: the bar a focus ring has to clear against the
// surfaces it is drawn on.
const FOCUS_MIN_CONTRAST = 3.0

// Extra headroom on top of the minimum, so the rounding in the emitted CSS
// cannot drop a value back under the bar.
const TEXT_CONTRAST_MARGIN = 0.1

// Lightness step for the text-safety walk. Hue and chroma never change.
const TEXT_L_STEP = 0.005
const TEXT_L_MAX_STEPS = 160

// Surface ladder factors, mirroring the relative distances of the Reading
// Room sets in index.css. All mixes run in oklch.
const MIX = {
  cardDark: 0.052,       // background toward foreground when the palette has no second surface
  cardLight: 0.4,        // background toward white, same fallback on the light side
  secondary: 0.07,       // card toward foreground
  mutedDark: 0.1,        // background toward foreground
  mutedLight: 0.05,
  borderDark: 0.14,
  borderLight: 0.09,
  sidebarBorderDark: 0.155,
  sidebarBorderLight: 0.1,
  inputDark: 0.2,
  inputLight: 0.14,
  accent: 0.18,          // card toward brand
  brandSoftDark: 0.22,   // background toward brand
  brandSoftLight: 0.12,
  hoverToHighlight: 0.55, // card toward the canonical selected surface
  mutedFgFallback: 0.28, // foreground toward background when the palette has no muted color
}

// Two surfaces closer than this read as one; used to keep an active item
// visible against the panel it sits on. verify-schemes.mjs gates on the same
// number with the same metric.
const MIN_SURFACE_GAP = 0.025

// How far the accent may travel from its canonical lightness before it stops
// reading as that color and the plain text tone takes over.
const MAX_BRAND_TEXT_SHIFT = 0.06

// A hover tint below this distance from the card does not register as hover.
const MIN_HOVER_GAP = 0.015

/** Straight-line distance in oklch, used to tell two surfaces apart. */
function oklchDistance(a, b) {
  const ha = (a.h * Math.PI) / 180
  const hb = (b.h * Math.PI) / 180
  const dx = a.c * Math.cos(ha) - b.c * Math.cos(hb)
  const dy = a.c * Math.sin(ha) - b.c * Math.sin(hb)
  return Math.sqrt((a.l - b.l) ** 2 + dx ** 2 + dy ** 2)
}

// Sidebar sits one step off the page, matching the existing schemes.
const SIDEBAR_L_SHIFT = { dark: 0.01, light: 0.03 }

// Per-side hashed username lightness/chroma, same values as index.css.
const USER_HASH = { dark: { l: 0.72, c: 0.09 }, light: { l: 0.49, c: 0.09 } }

// Shadow alpha ladders shared by every scheme; light shadows tint with the
// scheme foreground, dark schemes use the flat dark set.
const DARK_SHADOWS = {
  card: '0 0 #0000',
  book: '0 1px 2px oklch(0 0 0 / 0.5), 0 10px 22px -8px oklch(0 0 0 / 0.55)',
  lift: '0 2px 4px oklch(0 0 0 / 0.5), 0 18px 34px -10px oklch(0 0 0 / 0.6)',
}
const LIGHT_SHADOW_CARD_ALPHA = 0.06
const LIGHT_SHADOW_BOOK = [
  ['0 1px 1.5px', 0.16], ['0 3px 4px', 0.11], ['0 6px 8px', 0.09], ['0 12px 16px', 0.07], ['0 33px 45px', 0.05],
]
const LIGHT_SHADOW_LIFT = [
  ['0 2px 3px', 0.17], ['0 5px 7px', 0.12], ['0 10px 14px', 0.1], ['0 20px 26px', 0.08], ['0 44px 60px', 0.06],
]

const round = (x, digits) => Number(x.toFixed(digits))

function fromHex(hex) {
  const { l, c, h } = toOklch(hex)
  return { l, c, h: h ?? 0 }
}

// Four decimals on lightness and chroma keep a canonical hex byte-exact
// through the round trip; three lose the last digit on saturated colors.
const L_DIGITS = 4
const C_DIGITS = 4
const H_DIGITS = 2

export function oklchCss(hexOrColor) {
  const { l, c, h } = typeof hexOrColor === 'string' ? fromHex(hexOrColor) : hexOrColor
  return `oklch(${round(l, L_DIGITS)} ${round(c, C_DIGITS)} ${round(h ?? 0, H_DIGITS)})`
}

function asCulori({ l, c, h }) {
  return { mode: 'oklch', l, c, h }
}

// Below this chroma a color carries no real hue; its stored hue is an
// artifact of the hex conversion and must not steer a mix.
const ACHROMATIC_C = 0.005

/** Shortest-path hue interpolation keeps mixes stable across the 0/360 seam.
 * A near-gray endpoint adopts the other side's hue instead of pulling it. */
function mixOklch(a, b, t) {
  const aGray = a.c < ACHROMATIC_C
  const bGray = b.c < ACHROMATIC_C
  const ah = aGray && !bGray ? b.h : a.h
  const bh = bGray && !aGray ? a.h : b.h
  let dh = bh - ah
  if (dh > 180) dh -= 360
  if (dh < -180) dh += 360
  let h = ah + dh * t
  if (h < 0) h += 360
  if (h >= 360) h -= 360
  return { l: a.l + (b.l - a.l) * t, c: a.c + (b.c - a.c) * t, h }
}

/**
 * Walk lightness away from the surfaces until the color clears `target`. Hue
 * and chroma stay canonical; failing to converge keeps the closest value.
 */
function contrastSafe(color, surfaces, side, target) {
  const dir = side === 'dark' ? 1 : -1
  const out = { ...color }
  for (let i = 0; i < TEXT_L_MAX_STEPS; i++) {
    const worst = Math.min(...surfaces.map((s) => wcagContrast(asCulori(out), asCulori(s))))
    if (worst >= target + TEXT_CONTRAST_MARGIN) break
    const next = out.l + dir * TEXT_L_STEP
    if (next <= 0 || next >= 1) break
    out.l = next
  }
  return out
}

const textSafe = (color, surfaces, side) => contrastSafe(color, surfaces, side, TEXT_MIN_CONTRAST)

function pickReadable(candidates, on) {
  return candidates.reduce((best, c) =>
    wcagContrast(asCulori(c), asCulori(on)) > wcagContrast(asCulori(best), asCulori(on)) ? c : best
  )
}

const WHITE = { l: 1, c: 0, h: 0 }

function buildTokens(scheme, colors) {
  const { side, roles } = scheme
  const dark = side === 'dark'
  const ref = (name) => {
    if (!(name in colors)) throw new Error(`${scheme.id}: role points at unknown color "${name}"`)
    return fromHex(colors[name])
  }

  const bg = ref(roles.background)
  const fg0 = ref(roles.foreground)
  const card = roles.card ? ref(roles.card) : mixOklch(bg, dark ? fg0 : WHITE, dark ? MIX.cardDark : MIX.cardLight)
  const brand = ref(roles.brand)
  const ok = ref(roles.ok)
  const warn = ref(roles.warn)
  const destructive = ref(roles.destructive)
  const gifted = ref(roles.gifted)
  const users = roles.users.map(ref)
  const charts = roles.charts.map(ref)
  const sidebar = roles.sidebar
    ? ref(roles.sidebar)
    : { ...bg, l: Math.min(1, Math.max(0, bg.l - SIDEBAR_L_SHIFT[side])) }

  // Surfaces the palette names itself. Where a theme carries its own selected
  // and hovered surface, those beat any mix: they are what its users know.
  const highlight = roles.highlight
    ? ref(roles.highlight)
    : mixOklch(bg, brand, dark ? MIX.brandSoftDark : MIX.brandSoftLight)
  // Hover sits between the card and the selected surface, so a canonical
  // highlight keeps the whole ladder inside the palette's own tones. A named
  // hover that lands on the card itself is unusable, so it steps aside.
  const midway = roles.highlight
    ? mixOklch(card, highlight, MIX.hoverToHighlight)
    : mixOklch(card, brand, MIX.accent)
  const namedHover = roles.hover ? ref(roles.hover) : null
  const hover = namedHover && oklchDistance(namedHover, card) >= MIN_HOVER_GAP ? namedHover : midway
  // The rail's hover tone, kept between the rail and the selected row so the
  // two states never read as one.
  const sidebarHover = oklchDistance(highlight, sidebar) < MIN_SURFACE_GAP
    ? mixOklch(sidebar, fg0, dark ? MIX.borderDark : MIX.borderLight)
    : mixOklch(sidebar, highlight, MIX.hoverToHighlight)

  const surfaces = [bg, card]
  const fg = textSafe(fg0, surfaces, side)
  const mutedFgBase = roles.mutedForeground ? ref(roles.mutedForeground) : mixOklch(fg, bg, MIX.mutedFgFallback)
  const accent = hover
  const brandText = textSafe(brand, surfaces, side)
  const destructiveText = textSafe(destructive, surfaces, side)
  // The active-state pair the UI actually renders: accent-foreground always
  // sits on brand-soft, so it has to read there too. A neutral selected
  // surface rarely carries the accent at readable contrast. The themes put
  // plain text on it themselves, so the brand only stays where it reads close
  // to its canonical lightness.
  const accentSurfaces = [accent, card, highlight]
  const brandOnSurfaces = textSafe(brand, accentSurfaces, side)
  const focusRing = contrastSafe(brand, [bg, card, sidebar], side, FOCUS_MIN_CONTRAST)
  const accentFg = Math.abs(brandOnSurfaces.l - brand.l) > MAX_BRAND_TEXT_SHIFT
    ? textSafe(fg, accentSurfaces, side)
    : brandOnSurfaces

  return {
    background: bg,
    foreground: fg,
    card,
    'card-foreground': fg,
    popover: card,
    'popover-foreground': fg,
    primary: fg,
    'primary-foreground': bg,
    secondary: mixOklch(card, fg, MIX.secondary),
    'secondary-foreground': fg,
    muted: mixOklch(bg, fg, dark ? MIX.mutedDark : MIX.mutedLight),
    'muted-foreground': textSafe(mutedFgBase, surfaces, side),
    accent,
    'accent-foreground': accentFg,
    destructive: destructiveText,
    'destructive-foreground': pickReadable([bg, fg], destructiveText),
    border: roles.border ? ref(roles.border) : mixOklch(bg, fg, dark ? MIX.borderDark : MIX.borderLight),
    input: mixOklch(bg, fg, dark ? MIX.inputDark : MIX.inputLight),
    ring: focusRing,
    brand: brandText,
    'brand-fill': brand,
    'brand-soft': highlight,
    'ok-fill': ok,
    ok: textSafe(ok, surfaces, side),
    warn: textSafe(warn, surfaces, side),
    gifted: textSafe(gifted, surfaces, side),
    'user-1': textSafe(users[0], surfaces, side),
    'user-2': textSafe(users[1], surfaces, side),
    'user-3': textSafe(users[2], surfaces, side),
    'user-4': textSafe(users[3], surfaces, side),
    'chart-1': charts[0],
    'chart-2': charts[1],
    'chart-3': charts[2],
    'chart-4': charts[3],
    'chart-5': charts[4],
    sidebar,
    'sidebar-foreground': textSafe(fg, [sidebar], side),
    'sidebar-primary': fg,
    'sidebar-primary-foreground': bg,
    'sidebar-accent': sidebarHover,
    'sidebar-accent-foreground': textSafe(brand, [sidebarHover, sidebar, highlight], side),
    'sidebar-border': mixOklch(bg, fg, dark ? MIX.sidebarBorderDark : MIX.sidebarBorderLight),
    'sidebar-ring': focusRing,
  }
}

function shadowLines(side, fg) {
  if (side === 'dark') {
    return [
      `  --shadow-card: ${DARK_SHADOWS.card};`,
      `  --shadow-book: ${DARK_SHADOWS.book};`,
      `  --shadow-book-lift: ${DARK_SHADOWS.lift};`,
    ]
  }
  const tint = `${round(fg.l, 2)} ${round(fg.c, 2)} ${round(fg.h, 0)}`
  const steps = (list) => list.map(([geom, a]) => `${geom} oklch(${tint} / ${a})`).join(', ')
  return [
    `  --shadow-card: 0 1px 2px oklch(${tint} / ${LIGHT_SHADOW_CARD_ALPHA});`,
    `  --shadow-book: ${steps(LIGHT_SHADOW_BOOK)};`,
    `  --shadow-book-lift: ${steps(LIGHT_SHADOW_LIFT)};`,
  ]
}

// Token order matches the hand-written blocks in index.css for easy diffing.
const TOKEN_ORDER = [
  'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
  'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground',
  'accent', 'accent-foreground', 'destructive', 'destructive-foreground', 'border', 'input', 'ring',
  'brand', 'brand-fill', 'brand-soft', 'ok-fill', 'ok', 'warn', 'gifted',
  'user-1', 'user-2', 'user-3', 'user-4', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5',
]
const SIDEBAR_ORDER = [
  'sidebar', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
  'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring',
]

function cssBlock(family, scheme) {
  const tokens = buildTokens(scheme, family.colors)
  const selector = scheme.side === 'dark' ? `.dark.scheme-${scheme.id}` : `.scheme-${scheme.id}:not(.dark)`
  const lines = [
    `/* ${scheme.label}, generated from the official palette (${family.source}). */`,
    `${selector} {`,
    ...TOKEN_ORDER.map((t) => `  --${t}: ${oklchCss(tokens[t])};`),
    ...shadowLines(scheme.side, tokens.foreground),
    ...SIDEBAR_ORDER.map((t) => `  --${t}: ${oklchCss(tokens[t])};`),
    '}',
  ]
  return { css: lines.join('\n'), background: oklchCss(tokens.background) }
}

function run() {
  const cssBlocks = []
  const items = []
  const pageBg = []
  const lightIds = []
  const darkIds = []

  for (const family of families) {
    for (const scheme of family.schemes) {
      const { css, background } = cssBlock(family, scheme)
      cssBlocks.push(css)
      pageBg.push(`  '${scheme.id}': '${background}',`)
      ;(scheme.side === 'dark' ? darkIds : lightIds).push(scheme.id)
      items.push(
        `  { value: '${scheme.id}', side: '${scheme.side}', label: '${scheme.label.replace(/'/g, "\\'")}', family: '${family.family.replace(/'/g, "\\'")}', scheme: '${scheme.side === 'dark' ? `dark scheme-${scheme.id}` : `scheme-${scheme.id}`}' },`
      )
    }
  }

  writeFileSync(CSS_OUT, [
    '/* Generated by gen-schemes.mjs from schemes/palettes.mjs. Do not edit. */',
    ...cssBlocks,
    '',
  ].join('\n\n'))

  writeFileSync(TS_OUT, [
    '// Generated by gen-schemes.mjs from schemes/palettes.mjs. Do not edit.',
    "export type GeneratedSchemeItem = { value: string; side: 'light' | 'dark'; label: string; family: string; scheme: string }",
    '',
    'export const GEN_SCHEME_ITEMS: GeneratedSchemeItem[] = [',
    ...items,
    ']',
    '',
  ].join('\n'))

  const themeSrc = readFileSync(THEME_TS, 'utf8')
  const start = themeSrc.indexOf(GEN_START)
  const end = themeSrc.indexOf(GEN_END)
  if (start === -1 || end === -1) throw new Error('theme.ts is missing the @gen-schemes markers')
  const region = [
    GEN_START + ' (generated by gen-schemes.mjs, do not edit)',
    `export const GEN_LIGHT_SCHEMES = [${lightIds.map((s) => `'${s}'`).join(', ')}] as const`,
    `export const GEN_DARK_SCHEMES = [${darkIds.map((s) => `'${s}'`).join(', ')}] as const`,
    'export const GEN_PAGE_BG = {',
    ...pageBg,
    '} as const',
  ].join('\n')
  writeFileSync(THEME_TS, themeSrc.slice(0, start) + region + '\n' + themeSrc.slice(end))

  const total = lightIds.length + darkIds.length
  console.log(`gen-schemes: wrote ${total} schemes (${darkIds.length} dark, ${lightIds.length} light)`)
}

run()
