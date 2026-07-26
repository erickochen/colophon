// Upload asset files to the storage zone without rebuilding or redeploying the
// userscript. Reads the same .env.deploy as deploy.mjs.
//
// Usage: node upload-assets.mjs <file...> [--dest screens]

import { readFileSync, existsSync } from 'node:fs'
import { basename, extname } from 'node:path'
import { loadDeployEnv } from './env.mjs'

loadDeployEnv()

const {
  BUNNY_STORAGE_ZONE,
  BUNNY_STORAGE_PASSWORD,
  BUNNY_STORAGE_HOST = 'storage.bunnycdn.com',
  BUNNY_API_KEY,
  SITE_URL,
  BASE_PATH,
} = process.env

const basePath = (BASE_PATH ?? '').replace(/^\/|\/$/g, '')

const args = process.argv.slice(2)
let dest = 'screens'
const files = []
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--dest') { dest = args[++i]; continue }
  files.push(args[i])
}

const missing = ['BUNNY_STORAGE_ZONE', 'BUNNY_STORAGE_PASSWORD', 'SITE_URL', 'BASE_PATH'].filter((k) => !process.env[k])
if (missing.length) {
  console.error(`[upload] missing env: ${missing.join(', ')} (set them in userscript/.env.deploy)`)
  process.exit(1)
}
if (!files.length) {
  console.error('[upload] no files given. Usage: node upload-assets.mjs <file...> [--dest screens]')
  process.exit(1)
}

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}

const base = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}`
const uploaded = []
for (const f of files) {
  if (!existsSync(f)) { console.error(`[upload] not found: ${f}`); process.exit(1) }
  const name = basename(f)
  const body = readFileSync(f)
  const path = [basePath, dest, name].filter(Boolean).join('/')
  const res = await fetch(`${base}/${path}`, {
    method: 'PUT',
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD, 'Content-Type': MIME[extname(name).toLowerCase()] || 'application/octet-stream' },
    body,
  })
  if (!res.ok) { console.error(`[upload] failed ${name}: ${res.status} ${await res.text()}`); process.exit(1) }
  const url = `${SITE_URL.replace(/\/$/, '')}/${path}`
  uploaded.push(url)
  console.log(`[upload] ${name} (${body.length} B) -> ${url}`)
}

// Purge each uploaded URL so a re-upload of the same name serves fresh.
if (BUNNY_API_KEY) {
  for (const url of uploaded) {
    const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
      method: 'POST', headers: { AccessKey: BUNNY_API_KEY },
    })
    console.log(`[upload] purge ${url}: ${res.status}`)
  }
}
console.log('[upload] done')
