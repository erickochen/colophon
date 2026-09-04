import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SRC = path.join(import.meta.dirname, '..', 'src')

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.(tsx?|css)$/.test(entry)) yield full
  }
}

/** A ring or outline utility carrying a part strength, with the variants in
 * front of it so a focus state can be told from a validity one. Covers the
 * slash forms Tailwind takes, including an arbitrary alpha in brackets. */
const FADED_UTILITY =
  /((?:[\w-]+:)*)(?:ring|outline)-(?:[^\s"'`]*(?:ring|destructive)[^\s"'`/]*)\/(?:\d+|\[[^\]]+\])/g
/** An invalid field gets a border of its own, so its glow is not the only sign.
 * Focus has nothing beside it. */
const FOCUS_VARIANT = /(?:^|:)(?:focus|focus-visible|focus-within|has-focus|data-\[active=true\])(?::|$)/
/** The same in plain CSS, where a color-mix toward transparent does the fading. */
const FADED_MIX = /:focus(?:-visible|-within)?\b[^{}]*\{[^{}]*color-mix\([^)]*var\(--ring\)[^)]*transparent[^)]*\)/g

// The contrast pass raises --ring to 3:1 against the surface it lands on. Paint
// it at part strength and it settles back toward that surface, so a focus ring
// takes the token whole.
test('a focus ring is painted at full strength', () => {
  const offenders = []
  for (const file of sources(SRC)) {
    const text = readFileSync(file, 'utf8')
    const where = path.relative(SRC, file)
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(FADED_UTILITY)) {
        if (!FOCUS_VARIANT.test(m[1])) continue
        offenders.push(`${where}:${i + 1} ${m[0]}`)
      }
    })
    for (const m of text.matchAll(FADED_MIX)) {
      const at = text.slice(0, m.index).split('\n').length
      offenders.push(`${where}:${at} faded ring in a focus rule`)
    }
  }
  assert.deepEqual(offenders, [], `these focus rings read below 3:1: ${offenders.join(', ')}`)
})
