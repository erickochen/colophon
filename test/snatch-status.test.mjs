import assert from 'node:assert/strict'
import test from 'node:test'

import { pileBadge, pileGroup, readPile } from '../src/lib/snatch-status.ts'

/** Every pile heading /snatch_summary.php serves, in the site's own order. */
const PILES = [
  'Leeching Torrents',
  'Unsatisfied (150 limit)',
  'Not Seeding - H&R - Not Yet Satisfied',
  'Not Seeding - Not Yet Satisfied',
  'Not Seeding - Uploads',
  'Not Seeding - Satisfied',
  'Seeding - Not Yet Satisfied',
  'Seeding - H&R - Not Yet Satisfied',
  'Seeding - Satisfied',
  'Seeding - Uploads',
]

test('every pile heading reads into flags', () => {
  for (const name of PILES) {
    const f = readPile(name)
    assert.equal(typeof f.seeding, 'boolean', name)
    assert.equal(typeof f.satisfied, 'boolean', name)
  }
})

test('seeding is read from the whole name', () => {
  assert.equal(readPile('Seeding - Satisfied').seeding, true)
  assert.equal(readPile('Not Seeding - Satisfied').seeding, false)
  assert.equal(readPile('Seeding with 5 or fewer seeders').seeding, true)
  assert.equal(readPile('Leeching Torrents').leeching, true)
  assert.equal(readPile('Leeching Torrents').seeding, false)
})

test('unsatisfied is not satisfied', () => {
  assert.equal(readPile('Seeding - Satisfied').satisfied, true)
  assert.equal(readPile('Seeding - Not Yet Satisfied').satisfied, false)
  assert.equal(readPile('Unsatisfied (150 limit)').satisfied, false)
})

test('the cap row is a number, not a scope', () => {
  const f = readPile('Unsatisfied (150 limit)')
  assert.equal(f.cap, true)
  assert.equal(f.scope, null)
})

test('the cap reads wherever the limit sits in the name', () => {
  // MAM writes it in brackets today. The word is what marks the row.
  assert.equal(readPile('Unsatisfied - 150 limit').cap, true)
  assert.equal(pileGroup(readPile('Unsatisfied - 150 limit'), 'Unsatisfied - 150 limit').group, 'quota')
})

test('an unsatisfied pile without a limit needs attention', () => {
  const seeding = 'Unsatisfied'
  assert.deepEqual(pileGroup(readPile(seeding), seeding), { group: 'attention', text: 'Not satisfied yet' })
  const stopped = 'Not Seeding - Unsatisfied'
  assert.deepEqual(pileGroup(readPile(stopped), stopped), { group: 'attention', text: 'Stopped, not satisfied' })
})

test('a scope rides along in both shapes MAM writes', () => {
  assert.equal(readPile('Seeding - Satisfied (active in the last 24 hours)').scope, 'active in the last 24 hours')
  assert.equal(readPile('Seeding with 5 or fewer seeders').scope, '5 or fewer seeders')
  assert.equal(readPile('Seeding - Satisfied').scope, null)
})

test('the badge says one of four things', () => {
  assert.deepEqual(pileBadge(readPile('Seeding - Satisfied')), { text: 'Seeding', tone: 'ok' })
  assert.deepEqual(pileBadge(readPile('Seeding - Not Yet Satisfied')), { text: 'Seed more', tone: 'warn' })
  assert.deepEqual(pileBadge(readPile('Not Seeding - Satisfied')), { text: 'Satisfied', tone: 'muted' })
  assert.deepEqual(pileBadge(readPile('Not Seeding - Not Yet Satisfied')), { text: 'Seed more', tone: 'warn' })
  assert.deepEqual(pileBadge(readPile('Leeching Torrents')), { text: 'Downloading', tone: 'muted' })
  assert.deepEqual(pileBadge(readPile('Not Seeding - Uploads')), { text: 'Your upload', tone: 'muted' })
})

test('a name that never mentions the rules claims nothing about them', () => {
  // The scoped family MAM writes on some piles, which says nothing about seed
  // time either way.
  assert.deepEqual(pileBadge(readPile('Seeding with 5 or fewer seeders')), { text: 'Seeding', tone: 'ok' })
  assert.deepEqual(pileBadge(readPile('Not Seeding')), { text: 'Have it', tone: 'muted' })
  assert.equal(readPile('Seeding with 5 or fewer seeders').rules, false)
  assert.equal(readPile('Seeding - Satisfied').rules, true)
})

test('groups sort the piles by what they ask of you', () => {
  const group = (name) => pileGroup(readPile(name), name).group
  assert.equal(group('Not Seeding - H&R - Not Yet Satisfied'), 'attention')
  assert.equal(group('Not Seeding - Not Yet Satisfied'), 'attention')
  assert.equal(group('Seeding - Not Yet Satisfied'), 'running')
  assert.equal(group('Leeching Torrents'), 'running')
  assert.equal(group('Seeding - Satisfied'), 'settled')
  assert.equal(group('Seeding - Uploads'), 'settled')
  assert.equal(group('Unsatisfied (150 limit)'), 'quota')
})

test('a scope shows up in the heading sentence', () => {
  const name = 'Seeding - Satisfied (active in the last 24 hours)'
  assert.equal(pileGroup(readPile(name), name).text, 'Seeding, rules met (active in the last 24 hours)')
})

test('an unknown heading keeps MAM own wording', () => {
  const name = 'Something Else Entirely'
  const read = pileGroup(readPile(name), name)
  assert.equal(read.group, 'other')
  assert.equal(read.text, name)
})
