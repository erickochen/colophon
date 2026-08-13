// Upload dist/ to the storage zone and purge the CDN so auto-updates land at once.
// Credentials and hosting paths come from .env.deploy (git-ignored).
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { PAYLOAD_GLOB, PURGE_FAILED_EXIT } from './version.mjs'
import { replicationGaps, sha256 } from './release-verify.mjs'

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

// Bunny puts an overwrite in every region inside two minutes normally, under 30
// seconds often. Purging ahead of that makes every edge pull at once. An edge
// whose replica still trails then caches the previous release for a full TTL.
// The window is wide because a region can take far longer than the normal case:
// release.mjs purges again for whatever still trails after its regional check,
// so overshooting this costs a wait while undershooting costs three stale hours.
const REPLICATION_WAIT_MS = 600_000
const REPLICATION_POLL_MS = 5_000
// Silence for ten minutes reads as a hung release. Breaking off at that point
// would leave the zone on the new bytes with no purge landed, so the wait keeps
// saying what it is waiting on.
const REPLICATION_REPORT_MS = 30_000

const listing = async () => {
  // The trailing slash is what makes this a directory listing. Without it the
  // storage API reads the path as a file plus answers 404.
  const res = await fetch(`${[base, basePath].filter(Boolean).join('/')}/`, {
    headers: { AccessKey: BUNNY_STORAGE_PASSWORD, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  return res.json()
}

/** Regions this zone replicates to, which is what a file has to be listed for. */
const zoneRegions = async () => {
  const res = await fetch('https://api.bunny.net/storagezone', {
    headers: { AccessKey: BUNNY_API_KEY, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
  const zone = (await res.json()).find((entry) => entry.Name === BUNNY_STORAGE_ZONE)
  if (!zone) throw new Error(`no storage zone named ${BUNNY_STORAGE_ZONE}`)
  return zone.ReplicationRegions ?? []
}

/** Waits until the listing names every replication region for the files this
 * release overwrites. Bunny support states a region appears there only once its
 * replication is complete, so this is the signal to purge on. The deadline is
 * there for the case where a region takes far longer than it should. */
async function waitForReplication(wanted) {
  let regions
  try {
    regions = await zoneRegions()
  } catch (err) {
    console.warn(`[deploy] could not read the zone regions (${err}), purging without waiting`)
    return
  }
  if (!regions.length) return
  const started = Date.now()
  const deadline = started + REPLICATION_WAIT_MS
  const since = () => ((Date.now() - started) / 1000).toFixed(1)
  let gaps = []
  let spoke = started
  console.log(`[deploy] waiting for ${regions.length} replication regions to list this release`)
  while (Date.now() < deadline) {
    try {
      gaps = replicationGaps({ listing: await listing(), wanted, regions })
    } catch (err) {
      console.warn(`[deploy] could not read the file listing (${err}), purging without waiting`)
      return
    }
    if (!gaps.length) {
      // The elapsed time is worth printing: it is the only record of how long
      // this zone actually takes, which no API reports.
      console.log(`[deploy] all ${regions.length} replication regions list this release after ${since()}s`)
      return
    }
    if (Date.now() - spoke >= REPLICATION_REPORT_MS) {
      spoke = Date.now()
      console.log(`[deploy] ${since()}s in, still waiting on ${gaps.map((gap) => `${gap.name} ${gap.reason}`).join('; ')}`)
    }
    await new Promise((resolve) => setTimeout(resolve, REPLICATION_POLL_MS))
  }
  console.warn(`[deploy] still waiting after ${REPLICATION_WAIT_MS / 1000}s: ${gaps.map((gap) => `${gap.name} ${gap.reason}`).join('; ')}`)
  console.warn('[deploy] purging anyway, so a region that trails keeps serving the previous release until it catches up')
}

if (BUNNY_API_KEY) {
  const wanted = {}
  // The payload rides along: a region holding the new loader without the payload
  // it points at serves an install whose payload fetch answers 404, which is
  // worse than serving the previous release.
  const names = readdirSync(DIST).filter((name) => PAYLOAD_GLOB.test(name))
  names.push('colophon.user.js', 'colophon.meta.js')
  for (const name of names) {
    const abs = join(DIST, name)
    if (existsSync(abs)) wanted[name] = sha256(readFileSync(abs))
  }
  if (Object.keys(wanted).length < names.length) {
    console.warn(`[deploy] dist/ is missing ${names.filter((n) => !(n in wanted)).join(', ')}, so replication is not waited on`)
  } else {
    await waitForReplication(wanted)
  }
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
