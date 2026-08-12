import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'

export const ENCODINGS = ['identity', 'gzip', 'br', 'zstd']
export const GLOBALPING_CHUNK_BYTES = 10_000

const HASH = '[0-9a-f]{64}'
const GLOBALPING_API = 'https://api.globalping.io/v1'
const GLOBALPING_POLL_ATTEMPTS = 30
const GLOBALPING_POLL_MS = 1_000

const REGION_PROBES = {
  DE: { magic: 'Frankfurt', aliases: ['Frankfurt', 'Falkenstein'] },
  UK: { magic: 'London', aliases: ['London'] },
  SE: { magic: 'Stockholm', aliases: ['Stockholm'] },
  NY: { magic: 'New York', aliases: ['New York'] },
  LA: { magic: 'Los Angeles', aliases: ['Los Angeles'] },
  SG: { magic: 'Singapore', aliases: ['Singapore'] },
  SYD: { magic: 'Sydney', aliases: ['Sydney'] },
  BR: { magic: 'Sao Paulo', aliases: ['Sao Paulo', 'São Paulo'] },
  JH: { magic: 'Johannesburg', aliases: ['Johannesburg'] },
  CZ: { magic: 'Prague', aliases: ['Prague'] },
  ES: { magic: 'Madrid', aliases: ['Madrid'] },
  MI: { magic: 'Miami', aliases: ['Miami'] },
  WA: { magic: 'Seattle', aliases: ['Seattle'] },
  HK: { magic: 'Hong Kong', aliases: ['Hong Kong'] },
  JP: { magic: 'Tokyo', aliases: ['Tokyo'] },
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

export function prepareReleaseSource(source, nextVersion) {
  const published = readHashExport(source, 'PUBLISHED_PAYLOAD_SHA256')
  let prepared = replaceStringExport(source, 'VERSION', nextVersion)
  prepared = replaceStringExport(prepared, 'FALLBACK_PAYLOAD_SHA256', published)
  return prepared
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
  const regionCodes = [...new Set([storage.Region, ...(storage.ReplicationRegions ?? [])].filter(Boolean))]
  const unknown = regionCodes.filter((region) => !REGION_PROBES[region])
  if (unknown.length) throw new Error(`no Globalping probe mapping for Bunny region(s): ${unknown.join(', ')}`)

  return {
    pullZoneId: pullZone.Id,
    storageZoneId: storage.Id,
    locations: regionCodes.map((region) => ({ region, ...REGION_PROBES[region] })),
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
    locations: locations.map(({ magic }) => ({ magic, limit: 1 })),
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
  const aliases = new Set(location.aliases.map(normalize))
  const index = results.findIndex((entry, candidate) =>
    !used.has(candidate) && aliases.has(normalize(entry.probe?.city)))
  if (index < 0) return null
  used.add(index)
  return results[index]
}

export function assessGlobalpingChunk({ artifact, expected, start, end, locations, measurement }) {
  const faults = []
  const used = new Set()
  const results = measurement.results ?? []
  const expectedRange = `bytes ${start}-${end}/${bytes(artifact.body).length}`
  for (const location of locations) {
    const result = findProbeResult(results, location, used)
    if (!result) {
      faults.push({ artifact: artifact.name, region: location.region, detail: 'no matching probe result' })
      continue
    }
    const evidence = {
      probe: [result.probe?.city, result.probe?.country].filter(Boolean).join(', '),
      edge: header(result, 'server'),
      storage: header(result, 'cdn-storageserver'),
      lastModified: header(result, 'last-modified'),
      cache: header(result, 'cdn-cache'),
      measurement: measurement.id,
    }
    const body = typeof result.result?.rawBody === 'string' ? Buffer.from(result.result.rawBody, 'utf8') : null
    let detail = null
    if (result.result?.statusCode !== 206) detail = `status ${result.result?.statusCode ?? 'missing'}, expected 206`
    else if (header(result, 'content-range') !== expectedRange) detail = `range ${header(result, 'content-range') ?? 'missing'}, expected ${expectedRange}`
    else if (result.result?.truncated) detail = 'response body was truncated'
    else if (!body?.equals(expected)) detail = `chunk SHA-256 ${body ? sha256(body) : 'missing'}, expected ${sha256(expected)}`
    if (detail) faults.push({ artifact: artifact.name, region: location.region, detail, ...evidence })
  }
  return faults
}

export async function verifyGlobalArtifacts({ artifacts, locations, token, fetchImpl = fetch }) {
  const faults = []
  const measurements = []
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
          faults.push({ artifact: artifact.name, region: location.region, detail: String(error) })
        }
        continue
      }
      measurements.push(measurement.id)
      faults.push(...assessGlobalpingChunk({ artifact, expected, start, end, locations, measurement }))
    }
  }
  return { faults, measurements }
}
