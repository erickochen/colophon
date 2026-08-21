import assert from 'node:assert/strict'
import test from 'node:test'

import { placed, weeksOf } from '../src/lib/top10-period.ts'

/** The shape top10TorAvailable.php answers with: year, month, week, range. */
const INDEX = {
  2026: {
    all: true,
    8: { all: true, 32: [1786000000, 1786600000, 10], 33: [1786600000, 1787200000, 10] },
    9: { all: true, 34: [1787200000, 1787800000, 10] },
  },
  2025: {
    all: true,
    1: { all: true, 2: [1735000000, 1735600000, 10] },
  },
}

const query = (over = {}) => ({ year: 'all', week: 'all', metric: 'snatchedDesc', mainCat: [], cat: [], ...over })

test('weeks come from every month of the year, numerically ordered', () => {
  assert.deepEqual(weeksOf(INDEX, '2026'), ['32', '33', '34'])
})

test('the all marker is not a week', () => {
  assert.equal(weeksOf(INDEX, '2026').includes('all'), false)
})

test('without an index there are no weeks to offer', () => {
  assert.deepEqual(weeksOf(null, '2026'), [])
})

test('all time has no weeks of its own', () => {
  assert.deepEqual(weeksOf(INDEX, 'all'), [])
})

test('a year the index does not hold has no weeks', () => {
  assert.deepEqual(weeksOf(INDEX, '1999'), [])
})

test('all time is left alone', () => {
  const q = query()
  assert.equal(placed(q, INDEX), q)
})

test('a whole year is left alone', () => {
  const q = query({ year: '2026' })
  assert.equal(placed(q, INDEX), q)
})

test('a week the index holds is left alone', () => {
  const q = query({ year: '2026', week: '33' })
  assert.equal(placed(q, INDEX), q)
})

test('a week the index does not hold reads as the whole year', () => {
  const out = placed(query({ year: '2026', week: '53' }), INDEX)
  assert.equal(out.week, 'all')
  assert.equal(out.year, '2026')
})

test('a week belonging to another year does not carry over', () => {
  assert.equal(placed(query({ year: '2026', week: '2' }), INDEX).week, 'all')
})

// A year outside the index still searches: its range comes from the number, so
// only the week is dropped.
test('a year outside the index keeps its year', () => {
  const out = placed(query({ year: '2024', week: '5' }), INDEX)
  assert.equal(out.year, '2024')
  assert.equal(out.week, 'all')
})

test('the rest of the query rides along untouched', () => {
  const out = placed(query({ year: '2026', week: '53', metric: 'seedersDesc', mainCat: [1], cat: [42] }), INDEX)
  assert.equal(out.metric, 'seedersDesc')
  assert.deepEqual(out.mainCat, [1])
  assert.deepEqual(out.cat, [42])
})
