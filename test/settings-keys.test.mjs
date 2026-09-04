import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SRC = path.join(import.meta.dirname, '..', 'src')
const LIB = path.join(SRC, 'lib')
const settings = readFileSync(path.join(LIB, 'settings.ts'), 'utf8')

// Everything under our own prefix that is not a preference, with the reason it
// stays out of export, import plus Reset. A new key belongs in one of the two
// lists on purpose rather than by accident.
const NOT_A_PREFERENCE = new Map([
  ['colophon:payload', 'the bundle itself, fetched again on any machine'],
  ['colophon:categories2:v2', "a cache of MAM's own genre list"],
  ['colophon:snatch-index', 'a cache of what this account holds'],
  ['colophon:pm-snapshot', 'the unread count carried between two page loads'],
  ['colophon:bonus-delta', 'the last seen points total, for the delta'],
  ['colophon:bonus-seen', 'the same, for the topbar'],
  ['colophon:wysiwyg', "a cache of MAM's own editor preference"],
  ['colophon:quickie', "whether another script's column showed up here"],
  ['colophon:vip-until:', 'a cache per torrent, keyed by id'],
  ['colophon:ticket-draft', 'what someone typed and has not sent'],
  ['colophon:new-request', 'the same, for a request'],
  ['colophon:upload-quiz', 'the same, for the upload questions'],
  ['colophon:pm-thread', 'which thread was open last'],
  ['colophon:collapsed:', 'which groups are folded, keyed by page'],
])

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.tsx?$/.test(entry)) yield full
  }
}

/** Every key the app stores under our prefix, wherever it is written. */
function storageKeys(files = [...sources(SRC)]) {
  const found = new Map()
  for (const file of files) {
    if (file.endsWith(path.join('lib', 'settings.ts'))) continue
    for (const [, value] of readFileSync(file, 'utf8').matchAll(/'(colophon:[^']*)'/g)) {
      if (NOT_A_PREFERENCE.has(value)) continue
      if (!found.has(value)) found.set(value, path.relative(SRC, file))
    }
  }
  return [...found].map(([value, file]) => ({ value, file }))
}

/** The block that lists what export and import cover. */
function valueKeysBlock() {
  const start = settings.indexOf('const VALUE_KEYS')
  const end = settings.indexOf('\n}', start)
  assert.ok(start > 0 && end > start, 'VALUE_KEYS block not found')
  return settings.slice(start, end)
}

/** The constant a module gives a key, which is how VALUE_KEYS names it. */
function constantFor(value, file) {
  const source = readFileSync(path.join(SRC, file), 'utf8')
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return source.match(new RegExp(`const (\\w+) = '${escaped}'`))?.[1] ?? null
}

const HOW_TO_FIX = 'add these to VALUE_KEYS. A key that is no preference goes in NOT_A_PREFERENCE with its reason'

// A preference outside this list is quietly dropped by export, skipped by
// import and left standing by Reset, none of which says anything out loud.
test('every stored preference is covered by export and import', () => {
  const keys = storageKeys()
  assert.ok(keys.length > 8, `expected the preferences of every module, found ${keys.length}`)
  const block = valueKeysBlock()
  const missing = keys.filter((k) => {
    const name = constantFor(k.value, k.file)
    return !name || !block.includes(`[${name}]`)
  })
  assert.deepEqual(missing.map((k) => `${k.file}: ${k.value}`), [], HOW_TO_FIX)
})

// Appearance keys need a repaint on import, since nothing re-reads them on its
// own once the page is up.
test('every appearance preference repaints on import', () => {
  const line = settings.split('\n').find((l) => l.includes('const THEME_KEYS'))
  assert.ok(line, 'THEME_KEYS not found')
  const theme = storageKeys([path.join(LIB, 'theme.ts')])
  assert.ok(theme.length >= 4, `expected the appearance keys, found ${theme.length}`)
  const missing = theme.filter((k) => {
    const name = constantFor(k.value, k.file)
    return !name || !line.includes(name)
  })
  assert.deepEqual(missing.map((k) => k.value), [], 'add these to THEME_KEYS')
})
