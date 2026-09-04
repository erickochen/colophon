import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const LIB = path.join(import.meta.dirname, '..', 'src', 'lib')
const settings = readFileSync(path.join(LIB, 'settings.ts'), 'utf8')

// What someone typed and has not sent yet, which belongs to the moment rather
// than to the account. Carrying it into an export would restore half a message.
const NOT_A_PREFERENCE = new Set(['colophon:ticket-draft'])

/** Every key a module hands out for storing something under our own prefix.
 * settings.ts holds its own list, so it speaks for itself. */
function storageKeys(files = readdirSync(LIB).filter((f) => f.endsWith('.ts') && f !== 'settings.ts')) {
  return files.flatMap((file) =>
    [...readFileSync(path.join(LIB, file), 'utf8').matchAll(/export const (\w+_KEY) = '(colophon:[^']+)'/g)]
      .map(([, name, value]) => ({ name, value, file }))
      .filter((k) => !NOT_A_PREFERENCE.has(k.value))
  )
}

/** The block that lists what export and import cover. */
function valueKeysBlock() {
  const start = settings.indexOf('const VALUE_KEYS')
  const end = settings.indexOf('\n}', start)
  assert.ok(start > 0 && end > start, 'VALUE_KEYS block not found')
  return settings.slice(start, end)
}

// A preference outside this list is quietly dropped by export, skipped by
// import and left standing by Reset, none of which says anything out loud.
test('every stored preference is covered by export and import', () => {
  const keys = storageKeys()
  assert.ok(keys.length > 8, `expected the preferences of every module, found ${keys.length}`)
  const block = valueKeysBlock()
  const missing = keys.filter((k) => !block.includes(`[${k.name}]`))
  assert.deepEqual(missing.map((k) => `${k.file}: ${k.value}`), [], 'add these to VALUE_KEYS')
})

// Appearance keys need a repaint on import, since nothing re-reads them on its
// own once the page is up.
test('every appearance preference repaints on import', () => {
  const line = settings.split('\n').find((l) => l.includes('const THEME_KEYS'))
  assert.ok(line, 'THEME_KEYS not found')
  const missing = storageKeys(['theme.ts']).filter((k) => !line.includes(k.name))
  assert.deepEqual(missing.map((k) => k.value), [], 'add these to THEME_KEYS')
})
