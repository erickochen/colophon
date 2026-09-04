import assert from 'node:assert/strict'
import test from 'node:test'

import { BLACK, WHITE, contrast, parseColor, readable } from '../src/lib/contrast.ts'

const rgb = (r, g, b) => ({ r, g, b, a: 1 })

test('numeric channels are read straight off the value', () => {
  assert.deepEqual(parseColor('rgb(12, 34, 56)'), { r: 12, g: 34, b: 56, a: 1 })
  assert.deepEqual(parseColor('rgb(12 34 56)'), { r: 12, g: 34, b: 56, a: 1 })
  assert.deepEqual(parseColor('rgba(12, 34, 56, 0.5)'), { r: 12, g: 34, b: 56, a: 0.5 })
  assert.deepEqual(parseColor('rgb(12 34 56 / 0.25)'), { r: 12, g: 34, b: 56, a: 0.25 })
})

// A shade the fast path cannot read goes to the canvas, which knows every color
// space. Handing back a made-up alpha would repaint a color an author meant to
// be see-through.
test('a channel form the fast path cannot read is never guessed at', () => {
  assert.notEqual(parseColor('rgb(0 0 0 / 50%)')?.a, 1)
  assert.notEqual(parseColor('rgb(100% 0% 0%)')?.r, 100)
  assert.equal(parseColor(''), null)
})

test('contrast matches the WCAG reference pairs', () => {
  assert.equal(contrast(BLACK, WHITE).toFixed(2), '21.00')
  assert.equal(contrast(WHITE, WHITE).toFixed(2), '1.00')
  // #767676 on white is the textbook AA boundary.
  assert.equal(contrast(rgb(118, 118, 118), WHITE).toFixed(2), '4.54')
})

test('a color that already reads is left alone', () => {
  assert.equal(readable(BLACK, WHITE, 7), null)
})

test('a color that falls short is walked to the threshold', () => {
  const fixed = readable(rgb(150, 150, 150), WHITE, 7)
  assert.ok(fixed, 'expected a corrected color')
  assert.ok(contrast(fixed, WHITE) >= 7, `got ${contrast(fixed, WHITE)}`)
  // Only lightness moves, so a gray stays gray.
  assert.equal(fixed.r, fixed.g)
  assert.equal(fixed.g, fixed.b)
})

test('a hue survives the correction', () => {
  const fixed = readable(rgb(120, 90, 200), WHITE, 7)
  assert.ok(fixed)
  assert.ok(fixed.b > fixed.r, 'the blue channel stays the strongest')
})

test('the correction stops at the threshold instead of running to the end', () => {
  const fixed = readable(rgb(150, 150, 150), WHITE, 7)
  assert.ok(fixed, 'expected a corrected color')
  // A hair above the target, never all the way to black.
  assert.ok(contrast(fixed, WHITE) < 7.2, `got ${contrast(fixed, WHITE)}`)
  assert.ok(fixed.r > 0)
})

test('paper that cannot carry the threshold keeps the color', () => {
  // Mid gray reaches 7:1 with neither black nor white.
  assert.equal(readable(rgb(200, 200, 200), rgb(128, 128, 128), 7), null)
})

test('a dark surface pushes its text toward white', () => {
  const fixed = readable(rgb(90, 90, 90), rgb(20, 20, 20), 7)
  assert.ok(fixed)
  assert.ok(fixed.r > 90, `expected a lighter shade, got ${fixed.r}`)
})
