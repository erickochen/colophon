import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import monkey from 'vite-plugin-monkey'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { loadDeployEnv } from './env.mjs'

// Update/download URLs come from .env.deploy (SITE_URL + BASE_PATH). Without
// them the metadata omits both and the manager simply never auto-updates.
// LOCAL_UPDATE=1 points them at the local build for a dev loop.
loadDeployEnv()
const LOCAL_UPDATE = process.env.LOCAL_UPDATE === '1'
const SITE = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
const BASE = process.env.BASE_PATH?.replace(/^\/?|\/$/g, '') ?? ''
const FILE = 'colophon.user.js'
const META = 'colophon.meta.js'
// Release notes and feedback live in one forum topic.
const TOPIC_URL = 'https://www.myanonamouse.net/f/t/92105'
const LOCAL_FILE = pathToFileURL(path.resolve(__dirname, 'dist', FILE)).href
const hosted = (name: string) => (SITE ? [SITE, BASE, name].filter(Boolean).join('/') : undefined)

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    monkey({
      entry: 'src/main.tsx',
      userscript: {
        name: 'Colophon',
        namespace: 'https://www.myanonamouse.net/',
        description: 'Colophon: MyAnonaMouse reimagined as a calm, modern reading tracker',
        version: '2.15.0',
        author: 'soundorom',
        homepageURL: TOPIC_URL,
        supportURL: TOPIC_URL,
        icon: 'https://sas.myanonamouse.net/favicon-32x32.png',
        match: [
          'https://www.myanonamouse.net/*',
          'https://myanonamouse.net/*'
        ],
        'run-at': 'document-start',
        noframes: true,
        grant: 'none',
        // Managers poll the light .meta.js and fetch the full script only when
        // @version bumps.
        ...(LOCAL_UPDATE
          ? { updateURL: LOCAL_FILE, downloadURL: LOCAL_FILE }
          : hosted(META) && hosted(FILE)
            ? { updateURL: hosted(META), downloadURL: hosted(FILE) }
            : {})
      },
      build: {
        fileName: FILE,
        // Emit colophon.meta.js alongside for cheap update polling.
        metaFileName: true,
        // Our own CSS is imported with ?inline and injected into the shadow root,
        // so monkey must not append a <style> to document.head. Dependency CSS
        // still routes through the bundled injector, which postbuild rewrites.
        cssSideEffects: () => () => {}
      }
    })
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    target: 'es2022',
    // Anyone installing this runs it against their own logged-in session, so the
    // published script stays readable.
    minify: false
  }
})
