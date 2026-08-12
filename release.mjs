// One-command release: bump, build, deploy, verify worldwide, record.
// Usage: pnpm release [patch|minor|major|resume]   (default: minor)
// Exact published bytes are checked before a commit or tag can be created.
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { PAYLOAD_GLOB, PURGE_FAILED_EXIT } from './version.mjs'
import {
  getBunnyVerificationLocations,
  prepareReleaseSource,
  recordPublishedPayload,
  sha256,
  verifyCdnArtifacts,
  verifyGlobalArtifacts,
} from './release-verify.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const CONFIG = new URL('./version.mjs', import.meta.url)
const META = 'colophon.meta.js'
const LOADER = 'colophon.user.js'
// Storage replication can trail an upload by minutes (14 measured on a bad
// day). A purge makes an edge re-pull whatever its replica has right then, so
// every retry purges first plus the window outlasts a slow replica.
const ATTEMPTS = 40
const WAIT_MS = 30_000
// An unauthenticated Globalping account allows 250 tests per hour. The first
// pass costs three chunks per Bunny region; retries only revisit failed regions.
const GLOBAL_ATTEMPTS = 5
const GLOBAL_WAIT_MS = 60_000

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

const mode = process.argv[2] ?? 'minor'
if (!['patch', 'minor', 'major', 'resume'].includes(mode)) die(`unknown mode "${mode}", use patch, minor, major or resume`)
const resume = mode === 'resume'
const source = readFileSync(CONFIG, 'utf8')
const found = source.match(/VERSION = '(\d+)\.(\d+)\.(\d+)'/)
if (!found) die('no version found in version.mjs')

const [major, minor, patch] = found.slice(1).map(Number)
let current = `${major}.${minor}.${patch}`
let next = mode === 'major' ? `${major + 1}.0.0` : mode === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
let prepared
if (resume) {
  let headSource
  try {
    headSource = git('show', 'HEAD:version.mjs')
  } catch {
    die('could not read version.mjs from HEAD')
  }
  const headVersion = headSource.match(/VERSION = '(\d+\.\d+\.\d+)'/)?.[1]
  if (!headVersion || headVersion === current) die('there is no unfinished release to resume')
  next = current
  current = headVersion
  try {
    prepared = prepareReleaseSource(source, next)
  } catch (err) {
    die(`could not validate the unfinished release state: ${err}`)
  }
  if (prepared !== source) die('version.mjs is not in a resumable release state')
  say(`resuming ${next}`)
} else {
  say(`${current} -> ${next}`)
  try {
    prepared = prepareReleaseSource(source, next)
  } catch (err) {
    die(`could not prepare the release state: ${err}`)
  }
}
writeFileSync(CONFIG, prepared)

const revert = () => {
  if (resume) {
    say(`unfinished version stays at ${next}`)
    return
  }
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
const localPayload = readFileSync(new URL(`./dist/${payload}`, import.meta.url))
const localLoader = readFileSync(new URL(`./dist/${LOADER}`, import.meta.url))
const localMeta = readFileSync(new URL(`./dist/${META}`, import.meta.url))
const wanted = sha256(localPayload)
const mutableArtifacts = [
  { name: META, url: metaUrl, body: localMeta },
  { name: LOADER, url: loaderUrl, body: localLoader },
]
const payloadArtifact = { name: payload, url: publicUrl(payload), body: localPayload }
say(`build ok, loader ${(statSync(new URL(`./dist/${LOADER}`, import.meta.url)).size / 1024).toFixed(1)} kB, ${payload} ${(localPayload.length / 1048576).toFixed(2)} MB`)
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

// Both mutable files vary by Accept-Encoding, so compare every decoded variant
// byte-for-byte. The content-addressed payload only needs one exact comparison.
say(`checking ${metaUrl}`)
let localFaults = []
for (let i = 1; i <= ATTEMPTS; i++) {
  if (i > 1) {
    await new Promise((r) => setTimeout(r, WAIT_MS))
    for (const url of [metaUrl, loaderUrl, payloadArtifact.url]) await purge(url)
  }
  localFaults = [
    ...await verifyCdnArtifacts({ artifacts: mutableArtifacts }),
    ...await verifyCdnArtifacts({ artifacts: [payloadArtifact], encodings: ['identity'] }),
  ]
  if (!localFaults.length) { say(`attempt ${i}: exact meta, loader and payload bytes are live`); break }
  say(`attempt ${i}: ${localFaults.join('; ')}, waiting`)
}

if (localFaults.length) die(`the nearby CDN edge is not this build after ${ATTEMPTS} attempts: ${localFaults.join('; ')}. Version stays at ${next}.`)

// A healthy nearby edge cannot vouch for Bunny's other Storage replicas. Ask one
// probe near every configured replica for exact byte ranges of both mutable files.
let bunny
try {
  bunny = await getBunnyVerificationLocations({
    apiKey: process.env.BUNNY_API_KEY,
    siteUrl: SITE_URL,
  })
} catch (err) {
  die(`could not discover Bunny's verification regions: ${err}. Version stays at ${next}.`)
}
say(`checking ${bunny.locations.length} Bunny regions through Globalping`)
let pendingLocations = bunny.locations
let globalFaults = []
let measurementLinks = []
for (let i = 1; i <= GLOBAL_ATTEMPTS; i++) {
  const report = await verifyGlobalArtifacts({
    artifacts: mutableArtifacts,
    locations: pendingLocations,
    token: process.env.GLOBALPING_TOKEN,
  })
  globalFaults = report.faults
  measurementLinks.push(...report.measurements.map((id) => `https://globalping.io?measurement=${id}`))
  if (!globalFaults.length) { say(`global attempt ${i}: exact meta and loader bytes are live in every region`); break }
  const failedRegions = new Set(globalFaults.map((fault) => fault.region))
  say(`global attempt ${i}: ${[...failedRegions].join(', ')} stale or unreachable`)
  pendingLocations = bunny.locations.filter((location) => failedRegions.has(location.region))
  if (i < GLOBAL_ATTEMPTS) {
    await new Promise((resolve) => setTimeout(resolve, GLOBAL_WAIT_MS))
    for (const url of [metaUrl, loaderUrl]) await purge(url)
  }
}
if (globalFaults.length) {
  for (const fault of globalFaults) {
    const route = [fault.probe, fault.edge, fault.storage].filter(Boolean).join(' via ')
    say(`${fault.region} ${fault.artifact}: ${fault.detail}${route ? ` (${route})` : ''}${fault.lastModified ? `, last modified ${fault.lastModified}` : ''}`)
  }
  die(`Bunny is not globally consistent after ${GLOBAL_ATTEMPTS} attempts. Measurements: ${measurementLinks.join(' ')}. Version stays at ${next}.`)
}

// Record what this release published without changing the fallback baked into
// it. The next release copies this digest to its own fallback before building.
const bumped = readFileSync(CONFIG, 'utf8')
try {
  writeFileSync(CONFIG, recordPublishedPayload(bumped, wanted))
} catch (err) {
  die(`could not record the published payload: ${err}. Version stays at ${next}.`)
}
say(`recorded ${payload} for the next release`)

git('add', '-A')
git('commit', '-m', `Release ${next}`)
// Annotated: tag.gpgsign is on here and a signed tag carries a message.
git('tag', '-m', `Release ${next}`, `v${next}`)
say(`committed and tagged v${next} as ${identity}`)
say(`done. Push when you want to: git push --follow-tags`)
