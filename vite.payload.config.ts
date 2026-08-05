// Builds the app as a plain bundle without a metadata block. build.mjs strips the
// header monkey writes, hashes the result and hands both to the loader build.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import monkey from 'vite-plugin-monkey'
import path from 'node:path'
import { VERSION } from './version.mjs'

// Monkey needs a metadata block to build at all. This one gets stripped, so only
// the name matters for its own log lines.
const RAW_PAYLOAD = 'colophon.payload.raw.js'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'Colophon payload',
        namespace: 'https://www.myanonamouse.net/',
        version: VERSION,
        match: ['https://www.myanonamouse.net/*'],
        grant: 'none'
      },
      build: {
        fileName: RAW_PAYLOAD,
        metaFileName: false,
        // Our own CSS is imported with ?inline and injected into the shadow root,
        // so monkey must not append a <style> to document.head. Dependency CSS
        // still routes through the bundled injector, which postbuild rewrites.
        cssSideEffects: () => () => {}
      }
    })
  ],
  define: {
    __COLOPHON_VERSION__: JSON.stringify(VERSION)
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    target: 'es2022',
    minify: 'esbuild'
  }
})
