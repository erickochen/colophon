import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SRC = path.join(import.meta.dirname, '..', 'src')
const settings = readFileSync(path.join(SRC, 'lib', 'settings.ts'), 'utf8')

/** The keys a module hands out for storing a preference. */
function storageKeys(file) {
  const source = readFileSync(path.join(SRC, 'lib', file), 'utf8')
  return [...source.matchAll(/export const (\w+_KEY) = '([^']+)'/g)].map(([, name, value]) => ({ name, value }))
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
  const block = valueKeysBlock()
  const missing = storageKeys('theme.ts').filter((k) => !block.includes(`[${k.name}]`))
  assert.deepEqual(missing.map((k) => k.value), [], 'add these to VALUE_KEYS')
})

// Appearance keys need a repaint on import, since nothing re-reads them on its
// own once the page is up.
test('every appearance preference repaints on import', () => {
  const line = settings.split('\n').find((l) => l.includes('const THEME_KEYS'))
  assert.ok(line, 'THEME_KEYS not found')
  const missing = storageKeys('theme.ts').filter((k) => !line.includes(k.name))
  assert.deepEqual(missing.map((k) => k.value), [], 'add these to THEME_KEYS')
})
