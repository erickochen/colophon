import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const ENCODINGS = ['identity', 'gzip', 'br', 'zstd']
export const GLOBALPING_CHUNK_BYTES = 10_000

// Bunny holds one cached copy per Accept-Encoding. The worldwide byte check reads
// the plain copy, because a range over a compressed one covers compressed bytes
// that need not match between edges. Browsers ask for zstd, so that copy is the
// one most people get. Its date is what this compares.
export const VARIANT_ENCODINGS = ['zstd']
// Replicas stamp one upload a few seconds apart, so a copy counts as earlier only
// when it sits well outside that spread.
export const VARIANT_SKEW_MS = 60_000
// Globalping turns a measurement down under load, which would otherwise read as
// trouble in every region at once.
export const VARIANT_RETRIES = 1
const VARIANT_RETRY_MS = 15_000

const HASH = '[0-9a-f]{64}'
const GLOBALPING_API = 'https://api.globalping.io/v1'
const GLOBALPING_POLL_ATTEMPTS = 30
const GLOBALPING_POLL_MS = 1_000

// City plus country rather than a single fuzzy term, because city names repeat
// across countries and four of these regions sit in the US. Globalping treats
// both as strict filters, so a result carries exactly the city that was asked for.
const REGION_PROBES = {
  DE: { city: 'Frankfurt', country: 'DE' },
  UK: { city: 'London', country: 'GB' },
  SE: { city: 'Stockholm', country: 'SE' },
  NY: { city: 'New York', country: 'US' },
  LA: { city: 'Los Angeles', country: 'US' },
  SG: { city: 'Singapore', country: 'SG' },
  SYD: { city: 'Sydney', country: 'AU' },
  BR: { city: 'Sao Paulo', country: 'BR' },
  JH: { city: 'Johannesburg', country: 'ZA' },
  CZ: { city: 'Prague', country: 'CZ' },
  ES: { city: 'Madrid', country: 'ES' },
  MI: { city: 'Miami', country: 'US' },
  WA: { city: 'Seattle', country: 'US' },
  HK: { city: 'Hong Kong', country: 'HK' },
  JP: { city: 'Tokyo', country: 'JP' },
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const normalize = (value) => String(value ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
const bytes = (value) => Buffer.isBuffer(value) ? value : Buffer.from(value)

export const sha256 = (value) => createHash('sha256').update(bytes(value)).digest('hex')

export function artifactRanges(value, maximum = GLOBALPING_CHUNK_BYTES) {
  const body = bytes(value)
  const ranges = []
  for (let start = 0; start < body.length;) {
    let endExclusive = Math.min(start + maximum, body.length)
    // Globalping returns text in JSON. Keep each HTTP byte range on a UTF-8
    // boundary so JSON decoding cannot replace half a code point.
    while (endExclusive < body.length && (body[endExclusive] & 0xc0) === 0x80) endExclusive--
    if (endExclusive === start) throw new Error('could not split the artifact on a UTF-8 boundary')
    ranges.push({ start, end: endExclusive - 1, body: body.subarray(start, endExclusive) })
    start = endExclusive
  }
  return ranges
}

function readHashExport(source, name) {
  const found = source.match(new RegExp(`export const ${name} = '(${HASH})'`))
  if (!found) throw new Error(`${name} is missing or is not a SHA-256 digest`)
  return found[1]
}

function replaceStringExport(source, name, value) {
  const pattern = new RegExp(`export const ${name} = '[^']*'`)
  if (!pattern.test(source)) throw new Error(`${name} export is missing`)
  return source.replace(pattern, `export const ${name} = '${value}'`)
}

export const readPublishedPayload = (source) => readHashExport(source, 'PUBLISHED_PAYLOAD_SHA256')
export const readFallbackPayload = (source) => readHashExport(source, 'FALLBACK_PAYLOAD_SHA256')

export function prepareReleaseSource(source, nextVersion) {
  const published = readPublishedPayload(source)
  let prepared = replaceStringExport(source, 'VERSION', nextVersion)
  prepared = replaceStringExport(prepared, 'FALLBACK_PAYLOAD_SHA256', published)
  return prepared
}

/** Works out what a run should do from the two versions in play: the one in the
 * working tree plus the one the last commit carries. Throws with the reason when
 * the pair cannot be acted on. */
export function planRelease({ source, headSource, mode }) {
  const found = source.match(/VERSION = '(\d+)\.(\d+)\.(\d+)'/)
  if (!found) throw new Error('no version found in version.mjs')
  const headVersion = headSource.match(/VERSION = '(\d+\.\d+\.\d+)'/)?.[1]
  if (!headVersion) throw new Error('no version found in version.mjs at HEAD')

  const [major, minor, patch] = found.slice(1).map(Number)
  const fileVersion = `${major}.${minor}.${patch}`
  // A bump that never reached a commit is an unfinished release.
  const unfinished = headVersion !== fileVersion

  if (mode === 'resume') {
    if (!unfinished) throw new Error('there is no unfinished release to resume')
    // The bump already happened, so this checks the state rather than rewriting
    // it. The fallback has to be the payload HEAD published, which holds whether
    // or not the earlier run got as far as recording a digest of its own.
    if (readFallbackPayload(source) !== readPublishedPayload(headSource)) {
      throw new Error(`version.mjs is not in a resumable release state: its fallback is not the payload ${headVersion} published`)
    }
    return { head: headVersion, current: headVersion, next: fileVersion, prepared: source, resumed: true }
  }

  // Bumping on top of an unfinished release would skip a version number plus
  // leave the first one unpublished.
  if (unfinished) throw new Error(`version.mjs says ${fileVersion} while HEAD says ${headVersion}. Finish that release with "pnpm release resume" first.`)
  const next = mode === 'major' ? `${major + 1}.0.0` : mode === 'minor' ? `${major}.${minor + 1}.0` : `${major}.${minor}.${patch + 1}`
  return { head: headVersion, current: fileVersion, next, prepared: prepareReleaseSource(source, next), resumed: false }
}

export function recordPublishedPayload(source, digest) {
  if (!new RegExp(`^${HASH}$`).test(digest)) throw new Error('published payload is not a SHA-256 digest')
  return replaceStringExport(source, 'PUBLISHED_PAYLOAD_SHA256', digest)
}

async function fetchBytes(fetchImpl, url, headers = {}) {
  try {
    const response = await fetchImpl(url, { cache: 'no-store', headers })
    if (!response.ok) return { body: null, status: String(response.status), headers: response.headers }
    return { body: Buffer.from(await response.arrayBuffer()), status: String(response.status), headers: response.headers }
  } catch (error) {
    return { body: null, status: String(error), headers: null }
  }
}

export async function verifyCdnArtifacts({ artifacts, fetchImpl = fetch, encodings = ENCODINGS }) {
  const faults = []
  for (const artifact of artifacts) {
    const expected = bytes(artifact.body)
    const expectedHash = sha256(expected)
    for (const encoding of encodings) {
      const received = await fetchBytes(fetchImpl, artifact.url, { 'Accept-Encoding': encoding })
      if (received.body === null) {
        faults.push(`${artifact.name} ${encoding} did not come back (${received.status})`)
      } else if (!received.body.equals(expected)) {
        faults.push(`${artifact.name} ${encoding} has SHA-256 ${sha256(received.body)}, expected ${expectedHash}`)
      }
    }
  }
  return faults
}

async function jsonRequest(fetchImpl, url, init, label) {
  let response
  try {
    response = await fetchImpl(url, init)
  } catch (error) {
    throw new Error(`${label} failed: ${error}`)
  }
  const text = await response.text()
  if (!response.ok) throw new Error(`${label} answered ${response.status}: ${text}`)
  try {
    return JSON.parse(text)
  } catch {
    throw new Error(`${label} returned invalid JSON`)
  }
}

export async function getBunnyVerificationLocations({ apiKey, siteUrl, fetchImpl = fetch }) {
  if (!apiKey) throw new Error('BUNNY_API_KEY is required for regional release verification')
  const host = new URL(siteUrl).hostname
  const headers = { AccessKey: apiKey }
  const pullZones = await jsonRequest(fetchImpl, 'https://api.bunny.net/pullzone', { headers }, 'Bunny Pull Zone lookup')
  const pullZone = pullZones.find((zone) =>
    zone.Enabled && !zone.Suspended && zone.Hostnames?.some((entry) => entry.Value === host))
  if (!pullZone?.StorageZoneId) throw new Error(`no active Bunny Storage-backed Pull Zone found for ${host}`)

  const storage = await jsonRequest(
    fetchImpl,
    `https://api.bunny.net/storagezone/${pullZone.StorageZoneId}`,
    { headers },
    'Bunny Storage Zone lookup',
  )
  // Bunny adds storage regions over time while REGION_PROBES is a hand-kept list,
  // so a region without a probe city is reported and then skipped.
  const regionCodes = [...new Set([storage.Region, ...(storage.ReplicationRegions ?? [])].filter(Boolean))]
  return {
    pullZoneId: pullZone.Id,
    storageZoneId: storage.Id,
    regionCodes,
    unmapped: regionCodes.filter((region) => !REGION_PROBES[region]),
    locations: regionCodes.filter((region) => REGION_PROBES[region]).map((region) => ({ region, ...REGION_PROBES[region] })),
  }
}

function globalpingHeaders(token) {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'Colophon release verification',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

async function globalpingMeasurement({ url, locations, token, fetchImpl, method = 'GET', headers = {} }) {
  const target = new URL(url)
  const request = {
    method,
    path: target.pathname,
    headers,
    ...(target.search ? { query: target.search.slice(1) } : {}),
  }
  const payload = {
    type: 'http',
    target: target.hostname,
    locations: locations.map(({ city, country }) => ({ city, country, limit: 1 })),
    measurementOptions: {
      protocol: target.protocol === 'https:' ? 'HTTPS' : 'HTTP',
      ...(target.port ? { port: Number(target.port) } : {}),
      request,
    },
  }
  const created = await jsonRequest(
    fetchImpl,
    `${GLOBALPING_API}/measurements`,
    { method: 'POST', headers: globalpingHeaders(token), body: JSON.stringify(payload) },
    'Globalping measurement creation',
  )
  if (!created.id) throw new Error('Globalping measurement creation returned no id')

  for (let attempt = 0; attempt < GLOBALPING_POLL_ATTEMPTS; attempt++) {
    await sleep(GLOBALPING_POLL_MS)
    const result = await jsonRequest(
      fetchImpl,
      `${GLOBALPING_API}/measurements/${created.id}`,
      { headers: globalpingHeaders(token) },
      `Globalping measurement ${created.id}`,
    )
    if (result.status !== 'in-progress') return { id: created.id, ...result }
  }
  throw new Error(`Globalping measurement ${created.id} did not finish`)
}

function header(result, name) {
  const value = result?.result?.headers?.[name]
  return Array.isArray(value) ? value[0] : value ?? null
}

function findProbeResult(results, location, used) {
  const city = normalize(location.city)
  const country = normalize(location.country)
  const found = results.findIndex((entry, index) =>
    !used.has(index) && normalize(entry.probe?.city) === city && normalize(entry.probe?.country) === country)
  if (found < 0) return null
  used.add(found)
  return results[found]
}

/** Bunny names a storage server after the region it sits in, so this header says
 * which replica actually answered. An edge picks a nearby replica rather than the
 * one in its own region, so that is not knowable up front. */
export const replicaRegion = (storageServer) => String(storageServer ?? '').split('-')[0] || null

/** Bunny stamps cdn-cachedat as MM/DD/YYYY HH:MM:SS in UTC. */
export function parseCachedAt(value) {
  const found = String(value ?? '').match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/)
  if (!found) return null
  const [, month, day, year, hour, minute, second] = found.map(Number)
  const at = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  // Date.UTC rolls a 13th month over into the next year without complaining, so
  // an unexpected order would parse into a plausible date. Read it back instead.
  const roundTrips = at.getUTCFullYear() === year && at.getUTCMonth() === month - 1 && at.getUTCDate() === day
    && at.getUTCHours() === hour && at.getUTCMinutes() === minute && at.getUTCSeconds() === second
  return roundTrips ? at : null
}

/** Splits the two reasons an edge hands out an older release. A copy taken after
 * the purge means it did pull plus its replica had nothing newer to give. A copy
 * older than the upload cannot have seen these bytes at all, so the purge never
 * reached it. In between the two there is nothing honest to say. */
export function cacheVerdict({ cachedAt, uploadedAt, purgedAt }) {
  const cached = parseCachedAt(cachedAt)
  if (!cached) return 'unknown'
  if (purgedAt instanceof Date && cached >= purgedAt) return 'pulled-stale'
  if (uploadedAt instanceof Date && cached < uploadedAt) return 'not-purged'
  return 'unknown'
}

/** What a storage listing still misses for one release. Bunny does not document
 * ReplicatedZones, though support states a region lands in it only once its
 * replication is complete, so an empty result means every region holds the bytes.
 * The caller still pairs it with a deadline, for a region that takes far too long
 * rather than out of doubt about the field. */
export function replicationGaps({ listing, wanted, regions }) {
  const gaps = []
  for (const [name, digest] of Object.entries(wanted)) {
    const file = (listing ?? []).find((entry) => entry.ObjectName === name)
    if (!file) {
      gaps.push({ name, reason: 'not in the listing yet' })
      continue
    }
    if (String(file.Checksum ?? '').toLowerCase() !== digest.toLowerCase()) {
      gaps.push({ name, reason: 'the main region holds other bytes' })
      continue
    }
    const held = new Set(String(file.ReplicatedZones ?? '').split(',').map((part) => part.trim()).filter(Boolean))
    const missing = regions.filter((region) => !held.has(region))
    if (missing.length) gaps.push({ name, reason: `not listed for ${missing.join(', ')}`, missing })
  }
  return gaps
}

export function assessGlobalpingChunk({ artifact, expected, start, end, locations, measurement }) {
  const faults = []
  const observations = []
  const used = new Set()
  const results = measurement.results ?? []
  const expectedRange = `bytes ${start}-${end}/${bytes(artifact.body).length}`
  for (const location of locations) {
    const result = findProbeResult(results, location, used)
    // A probe that never ran says nothing about Bunny, so it stays apart from a
    // region that did answer with the wrong bytes.
    if (!result) {
      faults.push({ artifact: artifact.name, region: location.region, kind: 'silent', detail: 'no matching probe result', measurement: measurement.id })
      continue
    }
    const body = typeof result.result?.rawBody === 'string' ? Buffer.from(result.result.rawBody, 'utf8') : null
    const evidence = {
      probe: [result.probe?.city, result.probe?.country].filter(Boolean).join(', '),
      edge: header(result, 'server'),
      storage: header(result, 'cdn-storageserver'),
      lastModified: header(result, 'last-modified'),
      cache: header(result, 'cdn-cache'),
      // When this edge took its copy. Paired with the upload time it separates a
      // stale replica from a purge that never landed here.
      cachedAt: header(result, 'cdn-cachedat'),
      // Only the first chunk of a file carries the metadata block.
      served: body?.toString('utf8').match(/@version\s+(\S+)/)?.[1] ?? null,
      measurement: measurement.id,
    }
    observations.push({
      region: location.region,
      replica: replicaRegion(evidence.storage),
      lastModified: evidence.lastModified,
      cachedAt: evidence.cachedAt,
    })
    // Wrong bytes or a different file length is an older release. Anything else
    // is the request itself going wrong, which is not the same news at all.
    let detail = null
    let kind = 'stale'
    if (result.result?.statusCode !== 206) { kind = 'unhappy'; detail = `status ${result.result?.statusCode ?? 'missing'}, expected 206` }
    else if (result.result?.truncated) { kind = 'unhappy'; detail = 'response body was truncated' }
    else if (header(result, 'content-range') !== expectedRange) detail = `range ${header(result, 'content-range') ?? 'missing'}, expected ${expectedRange}`
    else if (!body?.equals(expected)) detail = `chunk SHA-256 ${body ? sha256(body) : 'missing'}, expected ${sha256(expected)}`
    if (detail) faults.push({ artifact: artifact.name, region: location.region, kind, detail, ...evidence })
  }
  return { faults, observations }
}

/** Reads one compressed copy per region and calls it earlier when its date sits
 * before the date the verified bytes carry. A region whose edge answers without
 * compressing keeps a single copy, so the byte check already speaks for it. */
export function assessEncodingVariant({ artifact, encoding, locations, measurement, stampedAt, skewMs = VARIANT_SKEW_MS }) {
  const faults = []
  const used = new Set()
  const results = measurement.results ?? []
  const baseline = Date.parse(stampedAt ?? '')
  let checked = 0
  for (const location of locations) {
    const result = findProbeResult(results, location, used)
    // A probe that never ran leaves this region uncounted rather than reported:
    // the byte check has its own say about the same region.
    if (!result) continue
    const status = result.result?.statusCode
    // An edge that will not serve this copy at all is its own kind of trouble,
    // and the byte check covers the plain copy rather than this one.
    if (status !== 200) {
      faults.push({
        artifact: artifact.name,
        region: location.region,
        kind: 'unhappy',
        encoding,
        detail: `the ${encoding} copy answered ${status ?? 'nothing'}, expected 200`,
        probe: [result.probe?.city, result.probe?.country].filter(Boolean).join(', '),
        edge: header(result, 'server'),
        storage: header(result, 'cdn-storageserver'),
        served: null,
        measurement: measurement.id,
      })
      continue
    }
    if (header(result, 'content-encoding') !== encoding) continue
    const dated = header(result, 'last-modified')
    const served = Date.parse(dated ?? '')
    if (!Number.isFinite(baseline) || !Number.isFinite(served)) continue
    checked++
    if (baseline - served <= skewMs) continue
    faults.push({
      artifact: artifact.name,
      region: location.region,
      kind: 'variant',
      encoding,
      detail: `dated ${dated}, while this release is dated ${stampedAt}`,
      probe: [result.probe?.city, result.probe?.country].filter(Boolean).join(', '),
      edge: header(result, 'server'),
      storage: header(result, 'cdn-storageserver'),
      lastModified: dated,
      cache: header(result, 'cdn-cache'),
      cachedAt: header(result, 'cdn-cachedat'),
      served: null,
      measurement: measurement.id,
    })
  }
  return { faults, checked }
}

/** The date the nearby edge carries for bytes this run already compared exactly.
 * A regional copy of the same release should be dated the same, whether or not
 * this run had anything left to upload. */
export async function readArtifactStamp({ artifact, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(artifact.url, {
      method: 'HEAD',
      cache: 'no-store',
      headers: { 'Accept-Encoding': 'identity' },
    })
    return response.ok ? response.headers.get('last-modified') : null
  } catch {
    return null
  }
}

export async function verifyGlobalEncodings({ artifacts, locations, encodings = VARIANT_ENCODINGS, token, fetchImpl = fetch, retries = VARIANT_RETRIES, retryMs = VARIANT_RETRY_MS, stamps = null }) {
  const faults = []
  const skipped = []
  let checked = 0
  let asked = 0
  // The date the verified bytes carry. A run with nothing left to upload finds an
  // earlier one here than the moment it started, which is what tells a missed
  // purge apart from a replica that trails.
  let landedAt = null
  for (const artifact of artifacts) {
    // Counted before anything can go wrong, so the totals show a check that was
    // meant to happen rather than a clean score for work nobody did.
    asked += locations.length * encodings.length
    // A date handed in was read where the bytes were compared exactly, which is
    // the sound moment for it. Reading one here is the fallback.
    const stampedAt = stamps?.get(artifact.name) ?? await readArtifactStamp({ artifact, fetchImpl })
    // Without a date for these bytes there is nothing to hold a regional copy against.
    if (!stampedAt) {
      skipped.push(`${artifact.name} carries no date to compare against`)
      continue
    }
    const at = Date.parse(stampedAt)
    if (Number.isFinite(at) && (!landedAt || at < landedAt.getTime())) landedAt = new Date(at)
    for (const encoding of encodings) {
      let measurement
      let refused
      // One retry, because a single refusal from Globalping would otherwise read
      // as trouble across every region at once.
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          measurement = await globalpingMeasurement({
            url: artifact.url,
            locations,
            token,
            fetchImpl,
            method: 'HEAD',
            headers: { 'Accept-Encoding': encoding },
          })
          refused = null
          break
        } catch (error) {
          refused = error
          if (attempt < retries) await sleep(retryMs)
        }
      }
      if (refused) {
        // Reported per region rather than swallowed. A check that fell over has
        // no faults to show, which reads exactly like a clean result.
        for (const location of locations) {
          faults.push({ artifact: artifact.name, region: location.region, kind: 'silent', detail: `the ${encoding} copy went unmeasured: ${refused}` })
        }
        continue
      }
      const assessed = assessEncodingVariant({ artifact, encoding, locations, measurement, stampedAt })
      faults.push(...assessed.faults)
      checked += assessed.checked
    }
  }
  return { faults, checked, asked, skipped, landedAt }
}

/** Keeps the worst chunk per region, preferring one that names a version, since
 * a region in trouble fails every chunk it was asked for. */
function worstPerRegion(faults, kind) {
  const byRegion = new Map()
  for (const fault of faults.filter((entry) => entry.kind === kind)) {
    const held = byRegion.get(fault.region)
    if (!held || (!held.served && fault.served)) byRegion.set(fault.region, fault)
  }
  return byRegion
}

const routeOf = (fault) => [fault.probe, fault.edge, fault.storage].filter(Boolean).join(' via ')

/** What to do about a compressed copy that trails, which turns on why it does.
 * Purging an edge whose replica is behind makes it pull those same bytes again
 * plus hold them for a full cache time, so that advice fits only where the purge
 * missed the edge itself. */
const variantAdvice = (fault, uploadedAt, purgedAt) => ({
  'not-purged': ' A purge of that file clears it.',
  'pulled-stale': ' Its replica had nothing newer, so a purge would settle those bytes rather than clear them.',
  unknown: '',
})[cacheVerdict({ cachedAt: fault.cachedAt, uploadedAt, purgedAt })]

/** Reads the two stale reasons off a fault, in the words the release prints. */
const staleBecause = (fault, uploadedAt, purgedAt) => ({
  'pulled-stale': 'its replica had nothing newer',
  'not-purged': 'the purge did not reach it',
  unknown: null,
})[cacheVerdict({ cachedAt: fault.cachedAt, uploadedAt, purgedAt })]

/** Turns a finished global check into the lines a release prints. */
export function summarizeGlobalReport({ regionCodes, probed, observations, faults, uploadedAt, purgedAt }) {
  const lines = []
  // Which replica answers is Bunny's own choice, so this says which ones were
  // reached rather than implying the probe list covers the replica list.
  const seen = [...new Set(observations.map((entry) => entry.replica).filter(Boolean))].sort()
  const unseen = regionCodes.filter((region) => !seen.includes(region))
  lines.push(`replicas reached: ${seen.length} of ${regionCodes.length}${seen.length ? ` (${seen.join(', ')})` : ''}`)
  if (unseen.length) lines.push(`nothing came from ${unseen.join(', ')} this run, because an edge picks whichever replica sits near it`)

  const trailing = worstPerRegion(faults, 'stale')
  for (const [region, fault] of trailing) {
    const because = staleBecause(fault, uploadedAt, purgedAt)
    lines.push(
      `${region} trails${fault.served ? `, serving ${fault.served}` : ''}${fault.lastModified ? `, dated ${fault.lastModified}` : ''}` +
      `${because ? `, because ${because}` : ''}${fault.cachedAt ? `, edge copy taken ${fault.cachedAt}` : ''}` +
      `${routeOf(fault) ? ` (${routeOf(fault)})` : ''}`
    )
  }
  // Kept per file rather than per region: two files can sit stale in one region,
  // and each names the file to purge.
  const variants = new Map()
  for (const fault of faults.filter((entry) => entry.kind === 'variant')) {
    variants.set(`${fault.region} ${fault.artifact} ${fault.encoding}`, fault)
  }
  for (const fault of variants.values()) {
    lines.push(
      `${fault.region} hands ${fault.artifact} to anyone asking for ${fault.encoding} from an earlier release: ${fault.detail}` +
      `${routeOf(fault) ? ` (${routeOf(fault)})` : ''}.${variantAdvice(fault, uploadedAt, purgedAt)}`
    )
  }
  const unhappy = worstPerRegion(faults, 'unhappy')
  for (const [region, fault] of unhappy) {
    lines.push(`${region} answered badly: ${fault.detail}${routeOf(fault) ? ` (${routeOf(fault)})` : ''}`)
  }
  const silent = worstPerRegion(faults, 'silent')
  for (const [region, fault] of silent) lines.push(`${region} could not be measured: ${fault.detail}`)

  const troubled = [...new Set(faults.map((fault) => fault.measurement).filter(Boolean))]
  if (trailing.size) lines.push(`${trailing.size} of ${probed} probed regions serve an earlier release, which keeps working there until replication catches up`)
  if (!trailing.size && !unhappy.size && !silent.size && !variants.size) lines.push(`every one of the ${probed} probed regions serves this build exactly`)
  if (troubled.length) lines.push(`measurements: ${troubled.map((id) => `https://globalping.io?measurement=${id}`).join(' ')}`)
  return lines
}

export async function verifyGlobalArtifacts({ artifacts, locations, token, fetchImpl = fetch }) {
  const faults = []
  const observations = []
  for (const artifact of artifacts) {
    for (const { start, end, body: expected } of artifactRanges(artifact.body)) {
      let measurement
      try {
        measurement = await globalpingMeasurement({
          url: artifact.url,
          locations,
          token,
          fetchImpl,
          headers: { 'Accept-Encoding': 'identity', Range: `bytes=${start}-${end}` },
        })
      } catch (error) {
        for (const location of locations) {
          faults.push({ artifact: artifact.name, region: location.region, kind: 'silent', detail: String(error) })
        }
        continue
      }
      const assessed = assessGlobalpingChunk({ artifact, expected, start, end, locations, measurement })
      faults.push(...assessed.faults)
      observations.push(...assessed.observations)
    }
  }
  return { faults, observations }
}
