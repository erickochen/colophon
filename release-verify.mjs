import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const ENCODINGS = ['identity', 'gzip', 'br', 'zstd']
export const GLOBALPING_CHUNK_BYTES = 10_000

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

async function globalpingMeasurement({ url, start, end, locations, token, fetchImpl }) {
  const target = new URL(url)
  const request = {
    method: 'GET',
    path: target.pathname,
    headers: {
      'Accept-Encoding': 'identity',
      Range: `bytes=${start}-${end}`,
    },
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
      // Only the first chunk of a file carries the metadata block.
      served: body?.toString('utf8').match(/@version\s+(\S+)/)?.[1] ?? null,
      measurement: measurement.id,
    }
    observations.push({ region: location.region, replica: replicaRegion(evidence.storage), lastModified: evidence.lastModified })
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

/** Turns a finished global check into the lines a release prints. */
export function summarizeGlobalReport({ regionCodes, probed, observations, faults }) {
  const lines = []
  // Which replica answers is Bunny's own choice, so this says which ones were
  // reached rather than implying the probe list covers the replica list.
  const seen = [...new Set(observations.map((entry) => entry.replica).filter(Boolean))].sort()
  const unseen = regionCodes.filter((region) => !seen.includes(region))
  lines.push(`replicas reached: ${seen.length} of ${regionCodes.length}${seen.length ? ` (${seen.join(', ')})` : ''}`)
  if (unseen.length) lines.push(`nothing came from ${unseen.join(', ')} this run, because an edge picks whichever replica sits near it`)

  const trailing = worstPerRegion(faults, 'stale')
  for (const [region, fault] of trailing) {
    lines.push(`${region} trails${fault.served ? `, serving ${fault.served}` : ''}${fault.lastModified ? `, dated ${fault.lastModified}` : ''}${routeOf(fault) ? ` (${routeOf(fault)})` : ''}`)
  }
  const unhappy = worstPerRegion(faults, 'unhappy')
  for (const [region, fault] of unhappy) {
    lines.push(`${region} answered badly: ${fault.detail}${routeOf(fault) ? ` (${routeOf(fault)})` : ''}`)
  }
  const silent = worstPerRegion(faults, 'silent')
  for (const [region, fault] of silent) lines.push(`${region} could not be measured: ${fault.detail}`)

  const troubled = [...new Set(faults.map((fault) => fault.measurement).filter(Boolean))]
  if (trailing.size) lines.push(`${trailing.size} of ${probed} probed regions serve an earlier release, which keeps working there until replication catches up`)
  if (!trailing.size && !unhappy.size && !silent.size) lines.push(`every one of the ${probed} probed regions serves this build exactly`)
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
          start,
          end,
          locations,
          token,
          fetchImpl,
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
