import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { converter, parse, wcagContrast } from 'culori'

import { readable } from '../src/lib/contrast.ts'
import { SHAPE_MIN, SHAPE_TOKENS, TEXT_MIN, TEXT_TOKENS } from '../src/lib/contrast-mode.ts'
import { readShoutAlerts } from '../src/lib/shout-alerts.ts'

const ROOT = path.join(import.meta.dirname, '..')
const SRC = path.join(ROOT, 'src')
const toOklch = converter('oklch')
const toRgb = converter('rgb')

// WCAG AA for small text.
const AA = 4.5

/**
 * The color as the browser paints it: converted to sRGB, clipped per channel
 * then rounded to 8 bit. An oklch color can sit outside sRGB, where the
 * unclipped value reads up to a full point higher than the pixels on screen.
 */
function painted(color) {
  const c = toRgb(typeof color === 'string' ? parse(color) : color)
  const q = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255) / 255
  return { mode: 'rgb', r: q(c.r), g: q(c.g), b: q(c.b) }
}

const contrast = (a, b) => wcagContrast(painted(a), painted(b))

// The panels the app draws body copy on. A token that carries copy has to read
// on all three, since a card, the page and a muted block all appear under it.
const SURFACES = ['card', 'background', 'muted']

/** Every scheme block, hand-tuned ones in index.css included. */
function schemeBlocks() {
  const out = []
  for (const file of ['src/index.css', 'src/schemes.gen.css']) {
    const css = readFileSync(path.join(ROOT, file), 'utf8')
    const re = /(^|\n)([^\n{]*?)\s*\{\n([\s\S]*?)\n\}/g
    let m
    while ((m = re.exec(css))) {
      const tokens = {}
      for (const line of m[3].split('\n')) {
        const t = line.match(/^\s*--([\w-]+):\s*(.+);$/)
        if (t) tokens[t[1]] = t[2].trim()
      }
      if (tokens.foreground && tokens.card) out.push({ file, sel: m[2].trim(), tokens })
    }
  }
  return out
}

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.tsx?$/.test(entry)) yield full
  }
}

test('every scheme carries a readable --foreground-soft', () => {
  const blocks = schemeBlocks()
  assert.ok(blocks.length > 40, `expected every scheme block, found ${blocks.length}`)
  const offenders = []
  for (const { sel, tokens } of blocks) {
    if (!tokens['foreground-soft']) {
      offenders.push(`${sel}: no --foreground-soft`)
      continue
    }
    for (const surface of SURFACES) {
      if (!tokens[surface]) continue
      const ratio = contrast(tokens['foreground-soft'], tokens[surface])
      if (ratio < AA) offenders.push(`${sel} on --${surface}: ${ratio.toFixed(2)}`)
    }
  }
  assert.deepEqual(offenders, [], `--foreground-soft under ${AA}: ${offenders.join(', ')}`)
})

// Marks with no contrast bar of their own: WCAG asks nothing of a glyph that
// carries no information. Each of these sits beside text saying the same thing.
// Anything not listed here has to reach the bar with a whole token.
const DECORATIVE = new Map([
  ['app/shell/app-sidebar.tsx', 'chevron beside a group label that names it'],
  ['app/pages/tickets.tsx', 'chevron beside a row that is itself a link'],
  ['app/pages/links-prefs.tsx', 'glyph above the empty-state line that says it'],
  ['app/pages/style-prefs.tsx', 'drag handle, aria-hidden'],
  ['app/pages/browse.tsx', 'separator glyphs between labeled numbers'],
  ['app/pages/torrent.tsx', 'separator between two labeled numbers'],
  ['components/tag-links.tsx', 'dot between tags, aria-hidden'],
])

// A slash on a text color asks the browser to composite the token against
// whatever sits behind it, which drops the ratio the scheme checks guarantee.
// A whole token carries that shade instead, with the bar built in.
test('no alpha tint on a text color that carries meaning', () => {
  const offenders = []
  for (const file of sources(SRC)) {
    const rel = path.relative(SRC, file)
    if (DECORATIVE.has(rel)) continue
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      // Every token ending in -foreground carries text, so the sibling
      // surfaces (card, popover, sidebar, accent) count too.
      if (/text-(foreground|[\w-]+-foreground)\/\d/.test(line)) offenders.push(`${rel}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `use the whole token instead: ${offenders.join(', ')}`)
})

/** Resolves the fill shout-alerts.ts builds against one scheme's own tokens. */
function resolveFill(fill, tokens) {
  const m = fill.match(
    /^oklch\(from var\(--card\) calc\(l \+ \(l - 0\.5\) \* ([\d.]+)\) ([\d.]+) (var\(--brand-hue\)|[\d.]+)\)$/
  )
  assert.ok(m, `unexpected fill shape: ${fill}`)
  const card = toOklch(parse(tokens.card))
  const push = Number(m[1])
  const hue = m[3] === 'var(--brand-hue)' ? Number.parseFloat(tokens['brand-hue']) : Number(m[3])
  assert.ok(Number.isFinite(hue), `no hue to fall back on: ${tokens['brand-hue']}`)
  return { mode: 'oklch', l: Math.max(0, Math.min(1, card.l + (card.l - 0.5) * push)), c: Number(m[2]), h: hue }
}

/** Largest per-channel step between two painted colors, out of 255. */
function channelGap(a, b) {
  const p = painted(a)
  const q = painted(b)
  return Math.max(Math.abs(p.r - q.r), Math.abs(p.g - q.g), Math.abs(p.b - q.b)) * 255
}

// A fill equal to the card would pass a contrast check without marking
// anything, so the row has to differ from the card it sits on as well.
const FILL_MIN_GAP = 3

// Every color MAM offers for the mark. The last one is unknown to us and falls
// back to the brand.
const ALERT_COLORS = ['row1-red', 'row1-yellow', 'row1-darkg', 'row1-green', 'row1-purple', 'row1-blue', 'theme']

// A marked shout may not cost its row the contrast a plain row has. It also has
// to be a mark: a fill identical to the card would pass on contrast alone.
test('an alert fill keeps its row readable and still shows', () => {
  const unreadable = []
  const invisible = []
  for (const { sel, tokens } of schemeBlocks()) {
    for (const color of ALERT_COLORS) {
      const { mark } = readShoutAlerts({ shoutboxPingsPrefs: { uid: 1, color, matches: {} } })
      const fill = resolveFill(mark.fill, tokens)
      const ratio = contrast(tokens.foreground, fill)
      if (ratio < AA) unreadable.push(`${sel} ${color}: ${ratio.toFixed(2)}`)
      const gap = channelGap(fill, parse(tokens.card))
      if (gap < FILL_MIN_GAP) invisible.push(`${sel} ${color}: ${gap.toFixed(0)}`)
    }
  }
  assert.deepEqual(unreadable, [], `alert fill under ${AA}: ${unreadable.join(', ')}`)
  assert.deepEqual(invisible, [], `alert fill under ${FILL_MIN_GAP}/255 from the card: ${invisible.join(', ')}`)
})

// The high contrast pass derives its values from whichever scheme is on, so the
// promise it makes has to hold for every one of them. The pass itself does the
// walking; culori measures where it lands, which keeps the check independent of
// the color parser the browser hands the pass.
const bytes = (token) => {
  const c = painted(token)
  return { r: Math.round(c.r * 255), g: Math.round(c.g * 255), b: Math.round(c.b * 255), a: 1 }
}
const asToken = (c) => ({ mode: 'rgb', r: c.r / 255, g: c.g / 255, b: c.b / 255 })

/** Whether a surface leaves any room at all: paper that neither black nor white
 * reads on keeps its color, which the pass allows on purpose. */
function reachable(ground, min) {
  return Math.max(contrast('#000', ground), contrast('#fff', ground)) >= min
}

test('high contrast reaches its threshold on every scheme', () => {
  const blocks = schemeBlocks()
  assert.ok(blocks.length > 40, `expected every scheme block, found ${blocks.length}`)
  const offenders = []
  for (const { sel, tokens } of blocks) {
    for (const [pairs, min] of [
      [TEXT_TOKENS, TEXT_MIN],
      [SHAPE_TOKENS, SHAPE_MIN],
    ]) {
      for (const [token, surfaces] of pairs) {
        if (!tokens[token]) continue
        const grounds = surfaces.filter((s) => tokens[s]).map((s) => [s, bytes(tokens[s])])
        if (grounds.length === 0) continue
        let value = bytes(tokens[token])
        for (const [, bg] of grounds) value = readable(value, bg, min) ?? value
        for (const [name, bg] of grounds) {
          const ratio = contrast(asToken(value), asToken(bg))
          if (ratio < min && reachable(asToken(bg), min)) {
            offenders.push(`${sel} --${token} on --${name}: ${ratio.toFixed(2)}`)
          }
        }
      }
    }
  }
  assert.deepEqual(offenders, [], `high contrast under target: ${offenders.join(', ')}`)
})
