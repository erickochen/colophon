// Upload dist/ to the storage zone and purge the CDN so auto-updates land at once.
// Credentials and hosting paths come from .env.deploy (git-ignored).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { PURGE_FAILED_EXIT } from './version.mjs'

loadDeployEnv()

const {
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_PASSWORD,
  BUNNY_STORAGE_HOST = 'storage.bunnycdn.com',
  BUNNY_API_KEY,
  SITE_URL,
  BASE_PATH,
} = process.env

// Must match BASE_PATH as vite.config.ts reads it or update checks 404.
const basePath = (BASE_PATH ?? '').replace(/^\/|\/$/g, '')
const publicUrl = (name) => [SITE_URL?.replace(/\/$/, ''), basePath, name].filter(Boolean).join('/')

const missing = ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_PASSWORD', 'SITE_URL', 'BASE_PATH'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(`[deploy] missing env: ${missing.join(', ')} (set them in userscript/.env.deploy)`)
  process.exit(1)
}

const DIST = fileURLToPath(new URL('./dist/', import.meta.url))
if (!existsSync(DIST)) {
  console.error('[deploy] dist/ not found, run `pnpm build` first')
  process.exit(1)
}

const MIME = {
  // The charset is explicit because the loader hashes the payload it downloads,
  // so the bytes it decodes have to match the bytes the build hashed.
  '.js': 'application/javascript; charset=utf-8', '.html': 'text/html', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

const base = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}`

// The meta file is what update checks read, so it goes last. Anything announcing
// a version before the files behind it are up would send managers to a 404.
const uploadOrder = (a, b) => {
  const rank = (p) => (p.endsWith('colophon.meta.js') ? 2 : p.endsWith('colophon.user.js') ? 1 : 0)
  return rank(a) - rank(b)
}

for (const abs of walk(DIST).sort(uploadOrder)) {
  const rel = relative(DIST, abs).split('\\').join('/')
  const body = readFileSync(abs)
  const res = await fetch([base, basePath, rel].filter(Boolean).join('/'), {
    method: 'PUT',
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD, 'Content-Type': MIME[extname(abs)] || 'application/octet-stream' },
    body,
  })
  if (!res.ok) {
    console.error(`[deploy] upload failed ${rel}: ${res.status} ${await res.text()}`)
    console.error('[deploy] earlier files in this run are already live, so check the zone before retrying')
    process.exit(1)
  }
  console.log(`[deploy] uploaded ${rel} (${body.length} B)`)
}

// Every way a purge can fail leaves the same situation behind, so they share one
// exit: uploaded, not purged. An unreachable API is as much that case as a 401.
const purgeFailed = (url, detail) => {
  console.error(`[deploy] purge failed ${url}: ${detail}`)
  console.error('[deploy] the files are uploaded, so edges keep serving the previous version until a purge lands')
  process.exit(PURGE_FAILED_EXIT)
}

// Purge the two files that must never serve stale, so the userscript manager sees updates.
if (BUNNY_API_KEY) {
  for (const name of ['colophon.user.js', 'colophon.meta.js']) {
    const url = publicUrl(name)
    let res
    try {
      res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
        method: 'POST',
        headers: { AccessKey: BUNNY_API_KEY },
      })
    } catch (err) {
      purgeFailed(url, err)
    }
    if (!res.ok) purgeFailed(url, `${res.status} ${await res.text()}`)
    console.log(`[deploy] purge ${url}: ${res.status}`)
  }
} else {
  console.warn('[deploy] BUNNY_API_KEY not set, skipped purge (updates lag until the CDN cache expires)')
}

console.log('[deploy] done')
