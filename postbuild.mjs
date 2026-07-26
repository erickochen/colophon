// The bundled CSS injector appends a <style> to document.head. At run-at
// document-start head does not exist yet and dependency styles have to reach
// the shadow root, so rewrite its body to buffer instead. Matched on shape
// rather than name: minified builds rename the function.
import { readFileSync, writeFileSync } from 'node:fs'

const file = 'dist/colophon.user.js'
const src = readFileSync(file, 'utf8')

const INJECTOR = /function\s+(\w+)\s*\(\s*(\w+)\s*\)\s*\{\s*if\s*\(\s*(?:!\s*\2\s*\|\|\s*)?typeof document\s*[=!]==?\s*"u(?:ndefined)?"\s*\)\s*return;[\s\S]*?createTextNode\(\s*\2\s*\)\s*\)\s*;?\s*\}/
const match = src.match(INJECTOR)

if (!match) {
  console.error('[postbuild] CSS injector not found. Without the rewrite, dependency styles')
  console.error('[postbuild] land in document.head and never reach the shadow root. Aborting.')
  process.exit(1)
}

const patched = src.replace(
  INJECTOR,
  (_m, fn, arg) => `function ${fn}(${arg}){(globalThis.__mamCollectedCSS??=[]).push(${arg})}`
)

writeFileSync(file, patched)
console.log(`[postbuild] CSS injector ${match[1]} now buffers into the shadow root`)
