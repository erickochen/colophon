import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SRC = path.join(import.meta.dirname, '..', 'src')
// The rem base every token name is written against, which is what the page
// starts from before the Text size setting moves it.
const ROOT_PX = 16
// The scale as it stands. A stray token would pass the arithmetic check on its
// own, so the count says the whole set is still there.
const SCALE_STEPS = 24

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.tsx?$/.test(entry)) yield full
  }
}

// A half step is written with a hyphen rather than a dot: Tailwind escapes an
// escaped dot a second time, which leaves a selector no class can match.
const asPx = (name) => Number(name.replace('-', '.'))

test('a text size token is worth what its name says', () => {
  const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
  const found = [...css.matchAll(/--text-([\d-]+): ([\d.]+)rem;/g)]
  assert.ok(found.length >= SCALE_STEPS, `expected the whole scale, found ${found.length}`)
  for (const [, name, rem] of found) {
    assert.equal(Number(rem) * ROOT_PX, asPx(name), `--text-${name} lands on ${Number(rem) * ROOT_PX}px`)
  }
})

// A hard pixel size ignores both the Text size setting and the reader's own
// browser setting, so the scale is the only way in.
test('no hard pixel text size in a class', () => {
  const offenders = []
  for (const file of sources(SRC)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/text-\[\d+(\.\d+)?px\]/.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `use the text scale instead: ${offenders.join(', ')}`)
})

// A size with no token behind it leaves the utility inheriting whatever sits
// above it, without saying so anywhere.
test('every size a class uses is on the scale', () => {
  const css = readFileSync(path.join(SRC, 'index.css'), 'utf8')
  const scale = new Set([...css.matchAll(/--text-([\d-]+):/g)].map(([, name]) => name))
  const missing = new Set()
  for (const file of sources(SRC)) {
    for (const [, size] of readFileSync(file, 'utf8').matchAll(/\btext-(\d+(?:-\d+)?)\b/g)) {
      if (!scale.has(size)) missing.add(`${size} (${path.relative(SRC, file)})`)
    }
  }
  assert.deepEqual([...missing], [], 'add these to the scale in index.css')
})

// A dot in the class name is the trap this scale was renamed to avoid: the
// selector comes out with a double backslash, so nothing matches it.
test('no half step is written with a dot', () => {
  const offenders = []
  for (const file of sources(SRC)) {
    readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
      if (/\btext-\d+\.\d/.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `write these with a hyphen: ${offenders.join(', ')}`)
})
