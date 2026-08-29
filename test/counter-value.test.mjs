import assert from 'node:assert/strict'
import test from 'node:test'

import { counterValue } from '../src/lib/counters.ts'

test('a header counter reads as its figure', () => {
  assert.equal(counterValue('Bonus: 18544'), 18544)
  assert.equal(counterValue('Bonus: 18,544'), 18544)
  assert.equal(counterValue('FL Wedges: 25'), 25)
  assert.equal(counterValue('B/hr: 47.223'), 47.223)
  assert.equal(counterValue('0'), 0)
})

test('a bare figure needs no label', () => {
  assert.equal(counterValue('2,188,500'), 2188500)
  assert.equal(counterValue('2,188,500 points'), 2188500)
})

test('a note another userscript appended stays out of the figure', () => {
  // MAM-Plus hangs its gain marker inside the same node.
  assert.equal(counterValue('Bonus: 18544 (+120)'), 18544)
  assert.equal(counterValue('Bonus: 18,544 (-40)'), 18544)
})

test('a figure carrying a unit reads as unknown, not as its stem', () => {
  assert.equal(counterValue('Bonus: 18.5k'), null)
  assert.equal(counterValue('2.2M'), null)
})

test('text with no figure reads as unknown', () => {
  assert.equal(counterValue('Max Affordable'), null)
  assert.equal(counterValue('Bonus: '), null)
  assert.equal(counterValue(''), null)
  assert.equal(counterValue(null), null)
  assert.equal(counterValue(undefined), null)
})

test('the label MAM writes with a non-breaking space still reads', () => {
  assert.equal(counterValue('FL\u00a0Wedges:\u00a025'), 25)
  assert.equal(counterValue('Bonus:\u00a018,544\u00a0(+120)'), 18544)
})

test('a counter with no label of its own reads from the front', () => {
  assert.equal(counterValue('25'), 25)
  assert.equal(counterValue('  1,281  '), 1281)
})
