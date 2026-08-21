import assert from 'node:assert/strict'
import test from 'node:test'

import { spliceBlock } from '../src/lib/insert-block.ts'

const QUOTE = '[quote=someone#p1]hello[/quote]'

test('an empty box takes the block on its own', () => {
  const r = spliceBlock('', 0, QUOTE)
  assert.equal(r.text, `${QUOTE}\n\n`)
  assert.equal(r.caret, r.text.length)
})

test('a caret inside a line breaks it open around the block', () => {
  const r = spliceBlock('one two', 3, QUOTE)
  assert.equal(r.text, `one\n\n${QUOTE}\n\n two`)
})

test('the caret lands on the empty line below the block', () => {
  const r = spliceBlock('one two', 3, QUOTE)
  assert.equal(r.text.slice(r.caret), ' two')
})

test('a caret at the end of the text appends', () => {
  const r = spliceBlock('done', 4, QUOTE)
  assert.equal(r.text, `done\n\n${QUOTE}\n\n`)
})

test('a caret already on a blank line adds no further blank lines', () => {
  const r = spliceBlock('done\n\n', 6, QUOTE)
  assert.equal(r.text, `done\n\n${QUOTE}\n\n`)
})

test('a caret at the start of a fresh line only needs one break', () => {
  const r = spliceBlock('done\n', 5, QUOTE)
  assert.equal(r.text, `done\n\n${QUOTE}\n\n`)
})

test('every character of the draft survives, wherever the block goes', () => {
  const draft = 'a whole draft that must survive'
  for (let at = 0; at <= draft.length; at++) {
    const r = spliceBlock(draft, at, QUOTE)
    assert.equal(r.text.replace(`\n\n${QUOTE}\n\n`, '').replace(`${QUOTE}\n\n`, ''), draft)
  }
})

test('breaks the text already carries are not doubled', () => {
  const r = spliceBlock('done\n\nmore', 4, QUOTE)
  assert.equal(r.text, `done\n\n${QUOTE}\n\nmore`)
  assert.equal(r.text.slice(r.caret), 'more')
})

test('a single break after the caret is topped up to one empty line', () => {
  const r = spliceBlock('done\nmore', 4, QUOTE)
  assert.equal(r.text, `done\n\n${QUOTE}\n\nmore`)
})

test('indentation before the caret counts as a blank line', () => {
  const r = spliceBlock('done\n  \n  ', 10, QUOTE)
  assert.equal(r.text, `done\n  \n  ${QUOTE}\n\n`)
})

test('nothing before the caret means no lead at all', () => {
  const r = spliceBlock('tail', 0, QUOTE)
  assert.equal(r.text, `${QUOTE}\n\ntail`)
})
