import assert from 'node:assert/strict'
import test from 'node:test'

import { planRuns } from '../src/lib/series-runs.ts'

/** What a row carries for grouping: {series id: [name, part, weight]}, with
 * weight -1 where the row names no part. */
const dune = (part, weight) => ({ 7: ['Dune', part, weight] })
const ids = (plans) => plans.map((p) => p.id)
const rows = (plans) => plans.map((p) => p.rows)

test('a series with two rows becomes one run at its first member', () => {
  const plans = planRuns([dune('1', 1), {}, dune('2', 2)])
  assert.deepEqual(ids(plans), ['7', null])
  assert.deepEqual(rows(plans), [[0, 2], [1]])
})

test('a series holding one row here stays a plain title', () => {
  const plans = planRuns([dune('1', 1), { 9: ['Elsewhere', '1', 1] }])
  assert.deepEqual(ids(plans), [null])
  assert.deepEqual(rows(plans), [[0, 1]])
})

test('singles that follow each other share one stretch', () => {
  const plans = planRuns([{}, {}, {}])
  assert.deepEqual(ids(plans), [null])
  assert.deepEqual(rows(plans), [[0, 1, 2]])
})

test('parts inside a run read in number order', () => {
  const plans = planRuns([dune('3', 3), dune('1', 1), dune('1-3', 1), dune('', -1), dune('2', 2)])
  assert.deepEqual(rows(plans), [[1, 4, 0, 2, 3]])
})

test('a boxset follows the numbered parts', () => {
  const plans = planRuns([dune('1-3', 1), dune('2', 2)])
  assert.deepEqual(rows(plans), [[1, 0]])
})

test('a row naming several series joins one of them only', () => {
  const plans = planRuns([
    { 7: ['Dune', '1', 1], 8: ['Omnibus', '1', 1] },
    dune('2', 2),
    { 8: ['Omnibus', '2', 2] },
  ])
  assert.deepEqual(ids(plans), ['7', null])
  assert.deepEqual(rows(plans), [[0, 1], [2]])
})

test('a row in two series joins the one this list holds the most of', () => {
  const plans = planRuns([
    { 7: ['Small', '1', 1], 8: ['Big', '5', 5] },
    { 8: ['Big', '1', 1] },
    { 8: ['Big', '2', 2] },
    { 7: ['Small', '2', 2] },
  ])
  // Series 8 holds three rows against two for series 7, so row 0 lands in 8.
  // That leaves series 7 with a single row, which is no run at all.
  assert.deepEqual(ids(plans), ['8', null])
  assert.deepEqual(rows(plans), [[1, 2, 0], [3]])
})

test('two editions of one part keep the order they came in', () => {
  const plans = planRuns([dune('1', 1), dune('1', 1), dune('2', 2)])
  assert.deepEqual(rows(plans), [[0, 1, 2]])
})

test('rows without any series name group into nothing', () => {
  const plans = planRuns([{}, {}])
  assert.deepEqual(ids(plans), [null])
})

test('an empty list gives no runs', () => {
  assert.deepEqual(planRuns([]), [])
})
