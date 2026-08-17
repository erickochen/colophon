import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const SRC = path.join(import.meta.dirname, '..', 'src')

// A manager may run the script in a sandbox realm rather than in the page. That
// realm has no base URL, so fetch on a relative path throws before the request
// is made. mamFetch resolves against the page, which is why nothing else may
// call fetch directly.
const ALLOWED = new Set([path.join(SRC, 'lib', 'mam-fetch.ts')])

function* sources(dir) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry)
    if (statSync(full).isDirectory()) yield* sources(full)
    else if (/\.tsx?$/.test(entry)) yield full
  }
}

test('every request goes through mamFetch', () => {
  const offenders = []
  for (const file of sources(SRC)) {
    if (ALLOWED.has(file)) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // A dotted call carries the same problem, so window.fetch counts too.
      // mamFetch survives on its capital F rather than on the dot.
      if (/(?<![\w$])fetch\s*\(/.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `use mamFetch instead of fetch: ${offenders.join(', ')}`)
})

// MAM's editor replaces form.submit on the element itself and writes its own
// content into the body first, so a direct call posts an empty message.
test('no form posts through a patched submit', () => {
  const allowed = path.join(SRC, 'lib', 'form-submit.ts')
  const offenders = []
  for (const file of sources(SRC)) {
    if (file === allowed) continue
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      // Comment lines describe the rule rather than break it.
      const code = line.replace(/\/\*.*?\*\//g, '').replace(/\/\/.*$/, '').replace(/^\s*\/?\*+.*$/, '')
      if (/\.submit\s*\(\s*\)/.test(code)) offenders.push(`${path.relative(SRC, file)}:${i + 1}`)
    })
  }
  assert.deepEqual(offenders, [], `use submitNative instead of form.submit(): ${offenders.join(', ')}`)
})

test('mamFetch resolves a path against the page', async () => {
  const src = readFileSync(path.join(SRC, 'lib', 'mam-fetch.ts'), 'utf8')
  assert.match(src, /new URL\(path, location\.href\)/)
})

// Behind a Firefox X-ray view the manager's eval runs on our side of the glass.
// The page's own window sits at wrappedJSObject. That is where the app has to
// run for MAM's globals to be reachable. An accessor from this side on that
// window would make MAM's own assignment throw, so the trap stays off there.
test('the loader evaluates the app in the page realm', () => {
  const src = readFileSync(path.join(SRC, 'loader.ts'), 'utf8')
  assert.match(src, /\.wrappedJSObject \?\? managerWindow/)
  assert.match(src, /if \(managerWindow === pageWindow\) preventWysiwyg\(pageWindow\)/)
})
