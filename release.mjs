// One-command release: bump, build, deploy, verify, record.
// Usage: pnpm release [patch|minor|major|resume]   (default: minor)
// The nearby edge has to serve this build exactly before a commit or tag is made.
// Every other region is measured too, then reported.
import { readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { loadDeployEnv } from './env.mjs'
import { PAYLOAD_GLOB, PURGE_FAILED_EXIT } from './version.mjs'
import {
  getBunnyVerificationLocations,
  planRelease,
  recordPublishedPayload,
  sha256,
  summarizeGlobalReport,
  verifyCdnArtifacts,
  verifyGlobalArtifacts,
} from './release-verify.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))

const CONFIG = new URL('./version.mjs', import.meta.url)
const META = 'colophon.meta.js'
const LOADER = 'colophon.user.js'
// The nearby edge re-pulls from its replica on every purge, so this window is
// wide enough for that replica to receive the upload.
const ATTEMPTS = 40
const WAIT_MS = 30_000
// Regions that answered are not asked twice: a replica that trails is hours
// behind, so another minute changes nothing. A probe that never ran is worth one
// more try. An unauthenticated Globalping account allows 250 tests per hour and
// the first pass costs three chunks per region.
const GLOBAL_ATTEMPTS = 2
const GLOBAL_WAIT_MS = 15_000
// A region that trails gets one purge plus one re-read. Purging does nothing for
// replication itself, so this only helps where the replica has since caught up
// while its edge sits on a copy it took too early.
const TRAILING_WAIT_MS = 20_000

const say = (msg) => console.log(`[release] ${msg}`)
const die = (msg) => { console.error(`[release] ${msg}`); process.exit(1) }
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim()

loadDeployEnv()
const { SITE_URL, BASE_PATH, BUNNY_API_KEY } = process.env
if (!SITE_URL || !BASE_PATH) die('SITE_URL and BASE_PATH must be set in .env.deploy')
// The key both purges and lists the regions to check. Without one a release
// would upload and then have no way to tell whether anybody can see it.
if (!BUNNY_API_KEY) die('BUNNY_API_KEY must be set in .env.deploy to purge and check a release')
const publicUrl = (name) => [SITE_URL.replace(/\/$/, ''), BASE_PATH.replace(/^\/|\/$/g, ''), name].filter(Boolean).join('/')
const metaUrl = publicUrl(META)
const loaderUrl = publicUrl(LOADER)

// Said once, because a key that is refused stays refused for every remaining
// attempt. The wait between attempts still covers cache expiry on its own.
let purgeWarned = false
const purgeTrouble = (detail) => {
  if (purgeWarned) return
  purgeWarned = true
  say(`purge is not landing (${detail}), so the checks below can only wait for the cache to expire`)
}

async function purge(url) {
  try {
    const res = await fetch(`https://api.bunny.net/purge?url=${encodeURIComponent(url)}&async=false`, {
      method: 'POST',
      headers: { AccessKey: BUNNY_API_KEY },
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
const source = readFileSync(CONFIG, 'utf8')

let headSource
try {
  headSource = git('show', 'HEAD:version.mjs')
} catch {
  die('could not read version.mjs from HEAD')
}

let plan
try {
  plan = planRelease({ source, headSource, mode })
} catch (err) {
  die(String(err.message ?? err))
}
const { current, next, prepared, resumed } = plan
say(resumed ? `resuming ${next}` : `${current} -> ${next}`)
// A run that died between the commit plus the tag leaves the released version
// untagged, which neither a bump nor a resume would notice on its own.
if (!git('tag', '--list', `v${plan.head}`)) {
  say(`v${plan.head} is committed without a tag. Add it with: git tag -m "Release ${plan.head}" v${plan.head}`)
}

// Everything knowable before a byte moves is settled here, so a failing test, a
// refused key or an unreachable API costs nothing but the run.
try {
  execFileSync('pnpm', ['test'], { stdio: 'inherit', cwd: HERE, env: { ...process.env } })
} catch {
  die('tests failed, nothing was released')
}

let bunny
try {
  bunny = await getBunnyVerificationLocations({ apiKey: BUNNY_API_KEY, siteUrl: SITE_URL })
} catch (err) {
  die(`could not discover Bunny's regions: ${err}`)
}
say(`storage zone ${bunny.storageZoneId} spans ${bunny.regionCodes.length} regions, ${bunny.locations.length} of them with a probe city`)
if (bunny.unmapped.length) say(`no probe city known for ${bunny.unmapped.join(', ')}, so those go unchecked`)
// An empty location list would come back clean while having measured nothing.
if (!bunny.locations.length) die('none of the zone regions has a probe city, so a release could not be checked anywhere')

writeFileSync(CONFIG, prepared)

const revert = () => {
  if (resumed) {
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
// Stamped before the upload starts, so every edge copy taken after this one was
// pulled from a replica that had the chance to hold these bytes.
const uploadedAt = new Date()
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
// byte-for-byte. The payload is named after a digest of itself, so one exact
// comparison settles it for good and later attempts leave it alone.
say(`checking ${metaUrl}`)
let localFaults = []
let payloadLive = false
// Set by every purge this script fires. deploy.mjs purges too, without telling us
// when, so this stays null until we purge ourselves. cacheVerdict then says
// nothing rather than guessing.
let purgedAt = null
for (let i = 1; i <= ATTEMPTS; i++) {
  if (i > 1) {
    await new Promise((r) => setTimeout(r, WAIT_MS))
    for (const url of [metaUrl, loaderUrl, ...(payloadLive ? [] : [payloadArtifact.url])]) await purge(url)
    purgedAt = new Date()
  }
  localFaults = await verifyCdnArtifacts({ artifacts: mutableArtifacts })
  if (!payloadLive) {
    const payloadFaults = await verifyCdnArtifacts({ artifacts: [payloadArtifact], encodings: ['identity'] })
    payloadLive = payloadFaults.length === 0
    localFaults.push(...payloadFaults)
  }
  if (!localFaults.length) { say(`attempt ${i}: exact meta, loader and payload bytes are live`); break }
  say(`attempt ${i}: ${localFaults.join('; ')}${i < ATTEMPTS ? ', waiting' : ''}`)
}

if (localFaults.length) die(`the nearby CDN edge is not this build after ${ATTEMPTS} attempts: ${localFaults.join('; ')}. Version stays at ${next}.`)

// A healthy nearby edge says nothing about Bunny's other replicas, so one probe
// near every region reads exact byte ranges of both mutable files. A trailing
// region is late rather than broken: the older loader it serves still finds the
// payload it was built with, so this reports instead of holding up the release.
say(`checking ${bunny.locations.length} regions through Globalping`)
let pendingLocations = bunny.locations
let silent = []
const faults = []
const observations = []
for (let i = 1; i <= GLOBAL_ATTEMPTS; i++) {
  const report = await verifyGlobalArtifacts({
    artifacts: mutableArtifacts,
    locations: pendingLocations,
    token: process.env.GLOBALPING_TOKEN,
  })
  observations.push(...report.observations)
  faults.push(...report.faults.filter((fault) => fault.kind !== 'silent'))
  silent = report.faults.filter((fault) => fault.kind === 'silent')
  if (!silent.length || i === GLOBAL_ATTEMPTS) break
  // Only a region nothing came back from is worth asking again. A replica that
  // trails needs hours, which no wait here is going to cover.
  const retry = new Set(silent.map((fault) => fault.region))
  say(`global attempt ${i}: no answer from ${[...retry].join(', ')}, asking those again`)
  pendingLocations = bunny.locations.filter((location) => retry.has(location.region))
  await new Promise((resolve) => setTimeout(resolve, GLOBAL_WAIT_MS))
}

// An edge that took its copy before the purge landed is worth one more try: the
// files are live by then, so a fresh purge plus a re-read settles whether that
// region was waiting on its replica or on the purge.
const trailingRegions = [...new Set(faults.filter((fault) => fault.kind === 'stale').map((fault) => fault.region))]
let recovered = []
if (trailingRegions.length) {
  say(`purging again for ${trailingRegions.join(', ')}, then re-reading those`)
  for (const url of [metaUrl, loaderUrl]) await purge(url)
  purgedAt = new Date()
  await new Promise((resolve) => setTimeout(resolve, TRAILING_WAIT_MS))
  const retryLocations = bunny.locations.filter((location) => trailingRegions.includes(location.region))
  const retry = await verifyGlobalArtifacts({
    artifacts: mutableArtifacts,
    locations: retryLocations,
    token: process.env.GLOBALPING_TOKEN,
  })
  observations.push(...retry.observations)
  // Only the regions that were read again get a new verdict. Every other region
  // keeps the one it already had, including one that answered badly, so a release
  // cannot lose a fault by retrying a different region.
  const retried = new Set(retryLocations.map((location) => location.region))
  const kept = faults.filter((fault) => !retried.has(fault.region))
  faults.length = 0
  faults.push(...kept, ...retry.faults.filter((fault) => fault.kind !== 'silent'))
  silent = [...silent.filter((fault) => !retried.has(fault.region)), ...retry.faults.filter((fault) => fault.kind === 'silent')]
  // Recovered means the re-read came back clean, rather than merely not stale: a
  // region that went silent on the retry has proven nothing.
  const answered = new Set(retry.observations.map((entry) => entry.region))
  const troubled = new Set(retry.faults.map((fault) => fault.region))
  recovered = trailingRegions.filter((region) => answered.has(region) && !troubled.has(region))
}

for (const line of summarizeGlobalReport({
  regionCodes: bunny.regionCodes,
  probed: bunny.locations.length,
  observations,
  faults: [...faults, ...silent],
  uploadedAt,
  purgedAt,
})) say(line)
if (recovered.length) say(`${recovered.join(', ')} came good after the second purge, so those edges were holding an early copy`)

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
