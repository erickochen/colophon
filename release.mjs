// One-command release: bump, build, deploy, verify, record.
// Usage: pnpm release [patch|minor|major]   (default: minor)
// The published .meta.js is checked afterwards: managers compare @version.
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { PAYLOAD_GLOB, PURGE_FAILED_EXIT } from './version.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const CONFIG = new URL('./version.mjs', import.meta.url)
const META = 'colophon.meta.js'
const LOADER = 'colophon.user.js'
// Storage replication can trail an upload by minutes (14 measured on a bad
// day). A purge makes an edge re-pull whatever its replica has right then, so
// every retry purges first plus the window outlasts a slow replica.
const ATTEMPTS = 40
const WAIT_MS = 30_000
// Bunny holds one cache object per Accept-Encoding, so a single variant says
// nothing about the bytes a browser gets. Node decodes all of these itself.
const ENCODINGS = ['identity', 'gzip', 'br', 'zstd']

const say = (msg) => console.log(`[release] ${msg}`)
const die = (msg) => { console.error(`[release] ${msg}`); process.exit(1) }
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

loadDeployEnv()
const { SITE_URL, BASE_PATH } = process.env
if (!SITE_URL || !BASE_PATH) die('SITE_URL and BASE_PATH must be set in .env.deploy')
const publicUrl = (name) => [SITE_URL.replace(/\/$/, ''), BASE_PATH.replace(/^\/|\/$/g, ''), name].filter(Boolean).join('/')
const metaUrl = publicUrl(META)
const loaderUrl = publicUrl(LOADER)

// Best effort: without a key the wait alone still covers cache expiry. Said once,
// because a key that is refused stays refused for every remaining attempt.
let purgeWarned = false
const purgeTrouble = (detail) => {
  if (purgeWarned) return
  purgeWarned = true
  say(`purge is not landing (${detail}), so the checks below can only wait for the cache to expire`)
}

async function purge(url) {
  const key = process.env.BUNNY_API_KEY
  if (!key) return
  try {
    const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
      method: 'POST',
      headers: { AccessKey: key },
    })
    if (!res.ok) purgeTrouble(`answered ${res.status}`)
  } catch (err) {
    purgeTrouble(String(err))
  }
}

// Commits must carry the repo-local identity. The address in a commit object is
// permanent, so the global config is not a fallback here.
let identity
try {
  identity = `${git('config', '--local', 'user.name')} <${git('config', '--local', 'user.email')}>`
} catch {
  die('no repo-local git identity. Set user.name and user.email with git config --local first.')
}

const bump = process.argv[2] ?? 'minor'
if (!['patch', 'minor', 'major'].includes(bump)) die(`unknown bump "${bump}", use patch, minor or major`)

const source = readFileSync(CONFIG, 'utf8')
const found = source.match(/VERSION = '(\d+)\.(\d+)\.(\d+)'/)
if (!found) die('no version found in version.mjs')

const [major, minor, patch] = found.slice(1).map(Number)
const next = bump === 'major' ? `${major + 1}.0.0` : bump === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
const current = `${major}.${minor}.${patch}`

say(`${current} -> ${next}`)
writeFileSync(CONFIG, source.replace(found[0], `VERSION = '${next}'`))

const revert = () => {
  writeFileSync(CONFIG, source)
  say(`version reverted to ${current}`)
}

const run = (cmd, args, failure) => {
  try {
    execFileSync(cmd, args, { stdio: 'inherit', cwd: HERE, env: { ...process.env } })
  } catch {
    revert()
    die(failure)
  }
}

// Build first: deploy.mjs only uploads whatever is already in dist/, so without
// this it would ship the previous bundle under the new version number.
run('pnpm', ['build'], 'build failed, nothing was released')

// The loader is useless without the payload it points at, so both have to exist
// before anything is uploaded.
const dist = fileURLToPath(new URL('./dist/', import.meta.url))
const payload = readdirSync(dist).find((f) => PAYLOAD_GLOB.test(f))
if (!payload) {
  revert()
  die('build produced no payload file, nothing was released')
}
const local = readFileSync(new URL(`./dist/${payload}`, import.meta.url), 'utf8')
const wanted = createHash('sha256').update(local, 'utf8').digest('hex')
say(`build ok, loader ${(statSync(new URL(`./dist/${LOADER}`, import.meta.url)).size / 1024).toFixed(1)} kB, ${payload} ${(Buffer.byteLength(local) / 1048576).toFixed(2)} MB`)
// Not through run(): a failed purge leaves the upload in place, so reverting the
// version here would claim the old number while the origin serves the new one.
try {
  execFileSync('node', ['deploy.mjs'], { stdio: 'inherit', cwd: HERE, env: { ...process.env } })
} catch (err) {
  if (err.status !== PURGE_FAILED_EXIT) {
    revert()
    die('deploy failed, check the zone before retrying')
  }
  say('purge failed, but the upload is live so the checks below keep purging')
}

// A blip during a poll this long should cost one attempt rather than the run, so
// a failure comes back as a missing body plus the status that explains it.
async function fetchBody(url, headers) {
  try {
    const res = await fetch(url, { cache: 'no-store', headers })
    return { text: res.ok ? await res.text() : null, status: String(res.status) }
  } catch (err) {
    return { text: null, status: String(err) }
  }
}

// The loader is what a manager installs, so every encoding of it has to be this
// build. Names the first variant that is not. Null means they all match.
async function staleLoaderVariant() {
  for (const encoding of ENCODINGS) {
    const { text, status } = await fetchBody(loaderUrl, { 'Accept-Encoding': encoding })
    if (text === null) return `${encoding} did not come back (${status})`
    const served = text.match(/@version\s+(\S+)/)?.[1]
    if (served !== next) return `${encoding} serves ${served ?? 'no version'}`
    if (!text.includes(payload)) return `${encoding} points at another payload`
    if (!text.includes(wanted)) return `${encoding} carries another hash`
  }
  return null
}

// Three things have to be true before this counts as released: update checks see
// the new version, the loader behind it is this build in every encoding plus the
// bytes it will fetch hash to what it expects.
const payloadUrl = publicUrl(payload)
say(`checking ${metaUrl}`)
let live = null
let servedHash = null
let loaderFault = null
for (let i = 1; i <= ATTEMPTS; i++) {
  if (i > 1) {
    await new Promise((r) => setTimeout(r, WAIT_MS))
    for (const url of [metaUrl, loaderUrl, payloadUrl]) await purge(url)
  }
  live = (await fetchBody(metaUrl)).text?.match(/@version\s+(\S+)/)?.[1] ?? null
  const { text: body } = await fetchBody(payloadUrl)
  servedHash = body === null ? null : createHash('sha256').update(body, 'utf8').digest('hex')
  loaderFault = await staleLoaderVariant()
  if (live === next && servedHash === wanted && !loaderFault) { say(`attempt ${i}: ${live} live, loader and payload match`); break }
  say(`attempt ${i}: version ${live ?? 'missing'}, payload ${servedHash === wanted ? 'ok' : 'mismatched'}, loader ${loaderFault ?? 'ok'}, waiting`)
}

if (live !== next) {
  // Nothing coming back at all is a URL or a connection, never a stale cache.
  const cause = live === null
    ? `nothing came back from it, so check the address plus the connection`
    : `it still serves ${live}, so retry the purge or wait for the cache to expire`
  die(`${metaUrl} does not announce ${next} after ${ATTEMPTS} attempts: ${cause}. Version stays at ${next}.`)
}
if (servedHash !== wanted) {
  die(`${payloadUrl} does not serve the bytes this build produced, so every install would refuse it. Version stays at ${next}.`)
}
if (loaderFault) {
  die(`${loaderUrl} is not this build: ${loaderFault}. Managers installing it would fetch the wrong payload. Version stays at ${next}.`)
}

// Record what this release published. The next loader bakes this digest in, so a
// failed fetch can start exactly this copy plus nothing older.
const bumped = readFileSync(CONFIG, 'utf8')
const previousLine = bumped.match(/PREVIOUS_PAYLOAD_SHA256 = '([0-9a-f]*)'/)
if (!previousLine) die(`no PREVIOUS_PAYLOAD_SHA256 line in version.mjs, so the next build would have no fallback. Version stays at ${next}.`)
writeFileSync(CONFIG, bumped.replace(previousLine[0], `PREVIOUS_PAYLOAD_SHA256 = '${wanted}'`))
say(`recorded ${payload} as the fallback the next release may start`)

git('add', '-A')
git('commit', '-m', `Release ${next}`)
// Annotated: tag.gpgsign is on here and a signed tag carries a message.
git('tag', '-m', `Release ${next}`, `v${next}`)
say(`committed and tagged v${next} as ${identity}`)
say(`done. Push when you want to: git push --follow-tags`)
