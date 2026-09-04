import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NAME_MAX,
  SAVED_FILTERS_KEY,
  cleanName,
  matchingSet,
  pinnedSet,
  readSets,
  reloadSavedFilters,
  removeSet,
  renameSet,
  restoreSet,
  sameState,
  saveSet,
  setPinned,
  updateSet,
} from '../src/lib/saved-filters.ts'

/** A localStorage stand-in the module can read plus write through. */
function stub({ value = null, writeThrows = false, readThrows = false } = {}) {
  let held = value
  let refuse = writeThrows
  globalThis.localStorage = {
    getItem(key) {
      if (readThrows) throw new Error('blocked')
      return key === SAVED_FILTERS_KEY ? held : null
    },
    setItem(key, next) {
      if (refuse) throw new Error('full')
      if (key === SAVED_FILTERS_KEY) held = next
    },
    removeItem() {
      held = null
    },
  }
  reloadSavedFilters()
  return {
    raw: () => held,
    parsed: () => (held == null ? null : JSON.parse(held)),
    /** Storage that fills up partway through a session. */
    refuseWrites: () => {
      refuse = true
    },
  }
}

const stored = (pages) => JSON.stringify({ v: 1, pages })

test('an unreadable value reads as an empty list', () => {
  stub({ value: '{not json' })
  assert.deepEqual(readSets('browse'), [])
})

test('a value from another schema reads as empty', () => {
  stub({ value: JSON.stringify({ v: 99, pages: { browse: [{ id: 'a', name: 'x', state: {}, created: 1 }] } }) })
  assert.deepEqual(readSets('browse'), [])
})

test('storage that refuses to be read leaves the page empty', () => {
  stub({ readThrows: true })
  assert.deepEqual(readSets('browse'), [])
})

test('a set survives a save plus a read', () => {
  const store = stub()
  const { ok, set } = saveSet('browse', 'Fantasy audio', { mainCat: [1], categories: [39] })
  assert.equal(ok, true)
  assert.equal(readSets('browse').length, 1)
  assert.equal(readSets('browse')[0].name, 'Fantasy audio')
  assert.deepEqual(readSets('browse')[0].state, { mainCat: [1], categories: [39] })
  assert.equal(store.parsed().pages.browse[0].id, set.id)
})

test('reading twice hands back the same list', () => {
  stub()
  // The store feeds useSyncExternalStore, which loops when a read returns a
  // fresh object each time.
  assert.equal(readSets('browse'), readSets('browse'))
  saveSet('browse', 'A', { a: 1 })
  assert.equal(readSets('browse'), readSets('browse'))
  assert.equal(readSets('empty-page'), readSets('other-empty-page'))
})

test('a set on one page stays off another', () => {
  stub()
  saveSet('browse', 'One', { a: 1 })
  saveSet('freeleech', 'Two', { b: 2 })
  assert.deepEqual(readSets('browse').map((s) => s.name), ['One'])
  assert.deepEqual(readSets('freeleech').map((s) => s.name), ['Two'])
})

test('a write that throws reports failure', () => {
  stub({ writeThrows: true })
  assert.equal(saveSet('browse', 'Nope', {}).ok, false)
})

test('a refused write leaves nothing behind in the cache', () => {
  // A cache that moved ahead of storage would show a set that a reload has
  // never heard of.
  stub({ writeThrows: true })
  saveSet('browse', 'Nope', { a: 1 })
  assert.deepEqual(readSets('browse'), [])
})

test('a refused delete keeps the set in place', () => {
  const store = stub()
  const a = saveSet('browse', 'A', {}).set
  store.refuseWrites()
  const gone = removeSet('browse', a.id)
  assert.equal(gone.ok, false)
  assert.deepEqual(readSets('browse').map((s) => s.id), [a.id])
})

test('a page holds one pin at a time', () => {
  stub()
  const a = saveSet('browse', 'A', { a: 1 }).set
  const b = saveSet('browse', 'B', { b: 2 }).set
  setPinned('browse', a.id, true)
  assert.equal(pinnedSet('browse').id, a.id)
  setPinned('browse', b.id, true)
  assert.equal(pinnedSet('browse').id, b.id)
  assert.equal(readSets('browse').filter((s) => s.pinned).length, 1)
  setPinned('browse', b.id, false)
  assert.equal(pinnedSet('browse'), null)
})

test('a stored second pin is dropped on read', () => {
  stub({
    value: stored({
      browse: [
        { id: 'a', name: 'A', state: {}, pinned: true, created: 1 },
        { id: 'b', name: 'B', state: {}, pinned: true, created: 2 },
      ],
    }),
  })
  assert.equal(readSets('browse').filter((s) => s.pinned).length, 1)
  assert.equal(pinnedSet('browse').id, 'a')
})

test('a pin on one page leaves another page alone', () => {
  stub()
  const a = saveSet('browse', 'A', {}).set
  const b = saveSet('top10', 'B', {}).set
  setPinned('browse', a.id, true)
  setPinned('top10', b.id, true)
  assert.equal(pinnedSet('browse').id, a.id)
  assert.equal(pinnedSet('top10').id, b.id)
})

test('a name is flattened plus cut', () => {
  assert.equal(cleanName('  Fantasy   audio  '), 'Fantasy audio')
  assert.equal(cleanName('a\nb'), 'a b')
  const long = 'x'.repeat(NAME_MAX + 20)
  assert.equal(cleanName(long).length, NAME_MAX)
  stub()
  const { set } = saveSet('browse', long, {})
  assert.equal(set.name.length, NAME_MAX)
})

test('renaming keeps the state plus the pin', () => {
  stub()
  const a = saveSet('browse', 'Old', { a: 1 }).set
  setPinned('browse', a.id, true)
  renameSet('browse', a.id, '  New  name ')
  const now = readSets('browse')[0]
  assert.equal(now.name, 'New name')
  assert.deepEqual(now.state, { a: 1 })
  assert.equal(now.pinned, true)
})

test('updating swaps the state plus keeps the name', () => {
  stub()
  const a = saveSet('browse', 'A', { a: 1 }).set
  updateSet('browse', a.id, { a: 2 })
  assert.deepEqual(readSets('browse')[0].state, { a: 2 })
  assert.equal(readSets('browse')[0].name, 'A')
})

test('a removed set comes back where it stood', () => {
  stub()
  saveSet('browse', 'A', {})
  const b = saveSet('browse', 'B', {}).set
  saveSet('browse', 'C', {})
  const gone = removeSet('browse', b.id)
  assert.equal(gone.set.name, 'B')
  assert.equal(gone.at, 1)
  assert.deepEqual(readSets('browse').map((s) => s.name), ['A', 'C'])
  restoreSet('browse', gone.set, gone.at)
  assert.deepEqual(readSets('browse').map((s) => s.name), ['A', 'B', 'C'])
})

test('a returning set gives up its pin when another set holds one', () => {
  stub()
  const a = saveSet('browse', 'A', {}).set
  const b = saveSet('browse', 'B', {}).set
  setPinned('browse', a.id, true)
  const gone = removeSet('browse', a.id)
  setPinned('browse', b.id, true)
  restoreSet('browse', gone.set, gone.at)
  assert.equal(readSets('browse').filter((s) => s.pinned).length, 1)
  assert.equal(pinnedSet('browse').id, b.id)
})

test('deleting the pinned set leaves the page without one', () => {
  stub()
  const a = saveSet('browse', 'A', {}).set
  saveSet('browse', 'B', {})
  setPinned('browse', a.id, true)
  removeSet('browse', a.id)
  assert.equal(pinnedSet('browse'), null)
})

test('key order plus array order do not make a state look new', () => {
  assert.equal(sameState({ a: [1, 2], b: 'x' }, { b: 'x', a: [2, 1] }), true)
  assert.equal(sameState({ a: [1, 2] }, { a: [1, 3] }), false)
})

test('an empty pick reads the same as an absent one', () => {
  assert.equal(sameState({ a: [1], langs: [] }, { a: [1] }), true)
  assert.equal(sameState({ a: [1], text: '' }, { a: [1] }), true)
})

test('a matching state is found for an update', () => {
  stub()
  const a = saveSet('browse', 'A', { cats: [1, 2], text: 'dune' }).set
  assert.equal(matchingSet('browse', { text: 'dune', cats: [2, 1] }).id, a.id)
  assert.equal(matchingSet('browse', { text: 'dune', cats: [3] }), null)
})

test('a set saved before a field existed still matches', () => {
  // The set predates the snatched filter, so it carries no value for it while
  // the page always does.
  stub()
  const a = saveSet('browse', 'A', { text: 'sci-fi', mainCat: [1] }).set
  const opening = { text: '', mainCat: [], snatched: 'all' }
  const onScreen = { text: 'sci-fi', mainCat: [1], snatched: 'all' }
  assert.equal(matchingSet('browse', onScreen), null)
  assert.equal(matchingSet('browse', onScreen, opening).id, a.id)
})

test('a set stops matching once a filter it never carried is changed', () => {
  stub()
  saveSet('browse', 'A', { text: 'sci-fi', mainCat: [1] })
  const opening = { text: '', mainCat: [], snatched: 'all' }
  assert.equal(matchingSet('browse', { text: 'sci-fi', mainCat: [1], snatched: 'not' }, opening), null)
})

test('what a set does carry beats the opening value', () => {
  stub()
  const a = saveSet('browse', 'A', { text: 'sci-fi', snatched: 'not' }).set
  const opening = { text: '', snatched: 'all' }
  assert.equal(matchingSet('browse', { text: 'sci-fi', snatched: 'not' }, opening).id, a.id)
  assert.equal(matchingSet('browse', { text: 'sci-fi', snatched: 'all' }, opening), null)
})

test('the set just applied answers for a list two sets describe', () => {
  // One set leaves the field out, the other stores it at the opening value, so
  // both ask for the same list.
  stub()
  const first = saveSet('browse', 'First', { text: 'sci-fi' }).set
  const second = saveSet('browse', 'Second', { text: 'sci-fi', snatched: 'all' }).set
  const opening = { text: '', snatched: 'all' }
  const onScreen = { text: 'sci-fi', snatched: 'all' }
  assert.equal(matchingSet('browse', onScreen, opening, second.id).id, second.id)
  assert.equal(matchingSet('browse', onScreen, opening, first.id).id, first.id)
  // Nothing applied yet, so the stored order decides.
  assert.equal(matchingSet('browse', onScreen, opening).id, first.id)
})

test('a preferred set that does not match is ignored', () => {
  stub()
  const a = saveSet('browse', 'A', { text: 'sci-fi' }).set
  const b = saveSet('browse', 'B', { text: 'fantasy' }).set
  assert.equal(matchingSet('browse', { text: 'sci-fi' }, undefined, b.id).id, a.id)
})

test('a field outside the page state is kept', () => {
  stub({ value: stored({ browse: [{ id: 'a', name: 'A', state: { old: 7, cats: [1] }, created: 1 }] }) })
  assert.deepEqual(readSets('browse')[0].state, { old: 7, cats: [1] })
})

test('a set without the parts it needs is skipped', () => {
  stub({
    value: stored({
      browse: [
        { id: 'a', name: 'A', state: {}, created: 1 },
        { name: 'no id', state: {}, created: 2 },
        { id: 'c', name: 'bad state', state: [], created: 3 },
      ],
    }),
  })
  assert.deepEqual(readSets('browse').map((s) => s.id), ['a'])
})

test('a set that lands on the opening values never answers for the page', () => {
  // Saving cannot make one of these. An imported file can carry one that would
  // otherwise read as active on a page nobody has touched.
  stub({
    value: stored({
      browse: [
        { id: 'empty', name: 'Empty', state: {}, created: 1 },
        { id: 'blank', name: 'Blank', state: { text: '' }, created: 2 },
        { id: 'neutral', name: 'Neutral', state: { snatched: 'all' }, created: 3 },
        { id: 'zero', name: 'Zero', state: { flagsMode: 0 }, created: 4 },
        { id: 'real', name: 'Real', state: { text: 'dune' }, created: 5 },
      ],
    }),
  })
  const opening = { text: '', snatched: 'all', flagsMode: 0 }
  assert.equal(matchingSet('browse', opening, opening), null)
  assert.equal(matchingSet('browse', { ...opening, text: 'dune' }, opening).id, 'real')
})

test('a set that clears a field the page opens with still answers', () => {
  stub({ value: stored({ browse: [{ id: 'scope', name: 'Scope', state: { srchIn: [] }, created: 1 }] }) })
  const opening = { srchIn: ['title'], text: '' }
  assert.equal(matchingSet('browse', { srchIn: [], text: '' }, opening).id, 'scope')
})
