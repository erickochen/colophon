import { defineConfig } from 'vite'
import monkey from 'vite-plugin-monkey'
import path from 'node:path'
import { loadDeployEnv } from './env.mjs'
import { VERSION, LOADER_FILE, META_FILE } from './version.mjs'

// Update plus download URLs come from .env.deploy (SITE_URL + BASE_PATH). The
// payload URL and its hash are computed by build.mjs, which is the only place
// that knows the payload's content addressed name.
loadDeployEnv()
const SITE = process.env.SITE_URL?.replace(/\/$/, '') ?? ''
const BASE = process.env.BASE_PATH?.replace(/^\/?|\/$/g, '') ?? ''
// Release notes and feedback live in one forum topic.
const TOPIC_URL = 'https://www.myanonamouse.net/f/t/92105'
const hosted = (name: string) => (SITE ? [SITE, BASE, name].filter(Boolean).join('/') : '')
const connectHost = SITE ? new URL(SITE).hostname : ''

const payloadUrl = process.env.COLOPHON_PAYLOAD_URL
const payloadSha = process.env.COLOPHON_PAYLOAD_SHA256
if (!payloadUrl || !payloadSha) {
  throw new Error('COLOPHON_PAYLOAD_URL and COLOPHON_PAYLOAD_SHA256 are set by build.mjs. Run `pnpm build` rather than vite directly.')
}

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/loader.ts',
      userscript: {
        name: 'Colophon',
        namespace: 'https://www.myanonamouse.net/',
        description: 'Colophon: MyAnonaMouse reimagined as a calm, modern reading tracker',
        version: VERSION,
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
        // The app is fetched from the host below, which MAM's CSP does not allow
        // a page-context fetch to reach.
        grant: ['GM_xmlhttpRequest'],
        connect: connectHost ? [connectHost] : [],
        // Managers poll the light .meta.js and fetch this file only when @version
        // bumps. The payload carries its version in the name, so it never needs
        // a cache purge of its own.
        ...(hosted(META_FILE) && hosted(LOADER_FILE)
          ? { updateURL: hosted(META_FILE), downloadURL: hosted(LOADER_FILE) }
          : {})
      },
      build: {
        fileName: LOADER_FILE,
        // Emit colophon.meta.js alongside for cheap update polling.
        metaFileName: true
      }
    })
  ],
  define: {
    __COLOPHON_VERSION__: JSON.stringify(VERSION),
    __COLOPHON_PAYLOAD_URL__: JSON.stringify(payloadUrl),
    __COLOPHON_PAYLOAD_SHA256__: JSON.stringify(payloadSha)
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') }
  },
  build: {
    target: 'es2022',
    // Leaves the payload build's output in place.
    emptyOutDir: false,
    minify: 'esbuild'
  }
})
