import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactRanges,
  assessGlobalpingChunk,
  getBunnyVerificationLocations,
  planRelease,
  prepareReleaseSource,
  readFallbackPayload,
  readPublishedPayload,
  recordPublishedPayload,
  replicaRegion,
  sha256,
  summarizeGlobalReport,
  verifyCdnArtifacts,
} from '../release-verify.mjs'

const OLD = '1'.repeat(64)
const CURRENT = '2'.repeat(64)
const NEXT = '3'.repeat(64)

test('release state keeps the baked fallback reproducible', () => {
  const source = [
    "export const VERSION = '3.13.0'",
    `export const FALLBACK_PAYLOAD_SHA256 = '${OLD}'`,
    `export const PUBLISHED_PAYLOAD_SHA256 = '${CURRENT}'`,
  ].join('\n')

  const prepared = prepareReleaseSource(source, '3.14.0')
  assert.match(prepared, /VERSION = '3\.14\.0'/)
  assert.match(prepared, new RegExp(`FALLBACK_PAYLOAD_SHA256 = '${CURRENT}'`))
  assert.match(prepared, new RegExp(`PUBLISHED_PAYLOAD_SHA256 = '${CURRENT}'`))

  const recorded = recordPublishedPayload(prepared, NEXT)
  assert.match(recorded, new RegExp(`FALLBACK_PAYLOAD_SHA256 = '${CURRENT}'`))
  assert.match(recorded, new RegExp(`PUBLISHED_PAYLOAD_SHA256 = '${NEXT}'`))

  // What "resume" leans on: the fallback still matches what the last commit
  // published, even after this run recorded a digest of its own.
  assert.equal(readFallbackPayload(recorded), CURRENT)
  assert.equal(readFallbackPayload(recorded), readPublishedPayload(source))
  assert.equal(readPublishedPayload(recorded), NEXT)
})

const versionSource = (version, fallback, published) => [
  `export const VERSION = '${version}'`,
  `export const FALLBACK_PAYLOAD_SHA256 = '${fallback}'`,
  `export const PUBLISHED_PAYLOAD_SHA256 = '${published}'`,
].join('\n')

test('a bump only happens on top of a committed release', () => {
  const committed = versionSource('3.13.0', OLD, CURRENT)

  const plan = planRelease({ source: committed, headSource: committed, mode: 'minor' })
  assert.equal(plan.current, '3.13.0')
  assert.equal(plan.next, '3.14.0')
  assert.equal(plan.resumed, false)
  assert.match(plan.prepared, new RegExp(`FALLBACK_PAYLOAD_SHA256 = '${CURRENT}'`))

  assert.equal(planRelease({ source: committed, headSource: committed, mode: 'patch' }).next, '3.13.1')
  assert.equal(planRelease({ source: committed, headSource: committed, mode: 'major' }).next, '4.0.0')
  assert.throws(
    () => planRelease({ source: committed, headSource: committed, mode: 'resume' }),
    /no unfinished release to resume/,
  )
})

test('a bump on top of an unfinished release is refused', () => {
  const committed = versionSource('3.13.0', OLD, CURRENT)
  const bumped = versionSource('3.14.0', CURRENT, CURRENT)

  assert.throws(
    () => planRelease({ source: bumped, headSource: committed, mode: 'minor' }),
    /Finish that release with "pnpm release resume" first/,
  )
})

test('resume works before and after the run recorded its own payload', () => {
  const committed = versionSource('3.13.0', OLD, CURRENT)

  // Died during verification, so the digest was never recorded.
  const beforeRecording = versionSource('3.14.0', CURRENT, CURRENT)
  const early = planRelease({ source: beforeRecording, headSource: committed, mode: 'resume' })
  assert.equal(early.next, '3.14.0')
  assert.equal(early.current, '3.13.0')
  assert.equal(early.resumed, true)
  // Rebuilding has to yield the same bytes, so nothing may be rewritten here.
  assert.equal(early.prepared, beforeRecording)

  // Died between recording the digest plus the commit, which is the same release.
  const afterRecording = versionSource('3.14.0', CURRENT, NEXT)
  const late = planRelease({ source: afterRecording, headSource: committed, mode: 'resume' })
  assert.equal(late.next, '3.14.0')
  assert.equal(late.prepared, afterRecording)
})

test('resume refuses a tree whose fallback is not what the last release published', () => {
  const committed = versionSource('3.13.0', OLD, CURRENT)
  const wrong = versionSource('3.14.0', OLD, CURRENT)

  assert.throws(
    () => planRelease({ source: wrong, headSource: committed, mode: 'resume' }),
    /not in a resumable release state/,
  )
})

test('artifact ranges stay within the body limit and on UTF-8 boundaries', () => {
  const original = Buffer.from(`${'a'.repeat(9_999)}€${'b'.repeat(12_000)}`)
  const ranges = artifactRanges(original)
  assert.ok(ranges.every((range) => range.body.length <= 10_000))
  assert.deepEqual(Buffer.concat(ranges.map((range) => range.body)), original)
  assert.equal(ranges[0].body.length, 9_999)
})

test('nearby CDN verification compares every decoded variant exactly', async () => {
  const expected = Buffer.from('current loader')
  const seen = []
  const fetchImpl = async (_url, init) => {
    const encoding = init.headers['Accept-Encoding']
    seen.push(encoding)
    return new Response(encoding === 'br' ? 'stale loader' : expected)
  }
  const faults = await verifyCdnArtifacts({
    artifacts: [{ name: 'colophon.user.js', url: 'https://cdn.test/colophon.user.js', body: expected }],
    fetchImpl,
  })

  assert.deepEqual(seen, ['identity', 'gzip', 'br', 'zstd'])
  assert.equal(faults.length, 1)
  assert.match(faults[0], /colophon\.user\.js br has SHA-256/)
  assert.match(faults[0], new RegExp(sha256(expected)))
})

test('worldwide chunk assessment reports the stale storage route', () => {
  const current = Buffer.from('current meta')
  const artifact = { name: 'colophon.meta.js', body: current }
  const locations = [{ region: 'SYD', city: 'Sydney', country: 'AU' }]
  const measurement = {
    id: 'measurement-id',
    results: [{
      probe: { city: 'Sydney', country: 'AU' },
      result: {
        statusCode: 206,
        rawBody: 'old meta',
        truncated: false,
        headers: {
          'content-range': `bytes 0-${current.length - 1}/${current.length}`,
          server: 'BunnyCDN-SYD1',
          'cdn-storageserver': 'SYD-690',
          'cdn-cache': 'MISS',
          'last-modified': 'old timestamp',
        },
      },
    }],
  }
  const { faults, observations } = assessGlobalpingChunk({
    artifact,
    expected: current,
    start: 0,
    end: current.length - 1,
    locations,
    measurement,
  })

  assert.equal(faults.length, 1)
  assert.deepEqual(faults[0], {
    artifact: 'colophon.meta.js',
    region: 'SYD',
    kind: 'stale',
    detail: `chunk SHA-256 ${sha256('old meta')}, expected ${sha256(current)}`,
    probe: 'Sydney, AU',
    edge: 'BunnyCDN-SYD1',
    storage: 'SYD-690',
    lastModified: 'old timestamp',
    cache: 'MISS',
    served: null,
    measurement: 'measurement-id',
  })
  // The replica that answered, which is not always the one in the probe's region.
  assert.deepEqual(observations, [{ region: 'SYD', replica: 'SYD', lastModified: 'old timestamp' }])
})

test('a probe in the wrong country is not accepted for a region', () => {
  const current = Buffer.from('current meta')
  const { faults } = assessGlobalpingChunk({
    artifact: { name: 'colophon.meta.js', body: current },
    expected: current,
    start: 0,
    end: current.length - 1,
    locations: [{ region: 'UK', city: 'London', country: 'GB' }],
    measurement: {
      id: 'measurement-id',
      // City names repeat across countries, so London in Canada is not the UK check.
      results: [{
        probe: { city: 'London', country: 'CA' },
        result: { statusCode: 206, rawBody: 'current meta', truncated: false, headers: {} },
      }],
    },
  })

  assert.equal(faults.length, 1)
  assert.equal(faults[0].kind, 'silent')
})

test('a region that never answered is held apart from a region serving old bytes', () => {
  const current = Buffer.from('current meta')
  const { faults, observations } = assessGlobalpingChunk({
    artifact: { name: 'colophon.meta.js', body: current },
    expected: current,
    start: 0,
    end: current.length - 1,
    locations: [{ region: 'JH', city: 'Johannesburg', country: 'ZA' }],
    measurement: { id: 'measurement-id', results: [] },
  })

  assert.deepEqual(faults, [{
    artifact: 'colophon.meta.js',
    region: 'JH',
    kind: 'silent',
    detail: 'no matching probe result',
    measurement: 'measurement-id',
  }])
  assert.deepEqual(observations, [])
})

test('the report names a trailing region once, with the version it hands out', () => {
  // One region behind on both files, which is three failed chunks in total.
  const behind = {
    region: 'SYD',
    kind: 'stale',
    probe: 'Sydney, AU',
    edge: 'BunnyCDN-SYD1-1365',
    storage: 'SYD-788',
    lastModified: 'Wed, 12 Aug 2026 07:37:00 GMT',
    measurement: 'm1',
  }
  const lines = summarizeGlobalReport({
    regionCodes: ['DE', 'SYD'],
    probed: 2,
    observations: [{ region: 'DE', replica: 'DE' }, { region: 'SYD', replica: 'SYD' }],
    faults: [
      { ...behind, artifact: 'colophon.meta.js', served: '3.11.1', detail: 'chunk mismatch' },
      { ...behind, artifact: 'colophon.user.js', served: '3.11.1', detail: 'range mismatch' },
      { ...behind, artifact: 'colophon.user.js', served: null, detail: 'range mismatch' },
    ],
  })

  assert.equal(lines.filter((line) => line.startsWith('SYD trails')).length, 1)
  assert.match(lines.find((line) => line.startsWith('SYD trails')), /serving 3\.11\.1/)
  assert.match(lines.find((line) => line.startsWith('SYD trails')), /SYD-788/)
  assert.ok(lines.some((line) => line === 'replicas reached: 2 of 2 (DE, SYD)'))
  assert.ok(lines.some((line) => line.startsWith('1 of 2 probed regions serve an earlier release')))
  assert.ok(lines.some((line) => line.includes('globalping.io?measurement=m1')))
  assert.ok(!lines.some((line) => line.includes('serves this build exactly')))
})

test('a bad answer is not reported as replication lag', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE', 'SG'],
    probed: 2,
    observations: [{ region: 'DE', replica: 'DE' }, { region: 'SG', replica: 'SG' }],
    faults: [{
      region: 'SG',
      kind: 'unhappy',
      artifact: 'colophon.meta.js',
      detail: 'status 403, expected 206',
      probe: 'Singapore, SG',
      edge: 'BunnyCDN-SG1',
      storage: 'SG-101',
      served: null,
    }],
  })

  assert.ok(lines.some((line) => line.startsWith('SG answered badly: status 403')))
  // A region that will not serve at all is never called merely late.
  assert.ok(!lines.some((line) => line.includes('trails')))
  assert.ok(!lines.some((line) => line.includes('serve an earlier release')))
  assert.ok(!lines.some((line) => line.includes('serves this build exactly')))
})

test('each silent region carries its own reason', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE', 'JH', 'SG'],
    probed: 3,
    observations: [{ region: 'DE', replica: 'DE' }],
    faults: [
      { region: 'JH', kind: 'silent', artifact: 'colophon.meta.js', detail: 'no matching probe result' },
      { region: 'SG', kind: 'silent', artifact: 'colophon.meta.js', detail: 'Globalping answered 429' },
    ],
  })

  assert.ok(lines.some((line) => line === 'JH could not be measured: no matching probe result'))
  assert.ok(lines.some((line) => line === 'SG could not be measured: Globalping answered 429'))
  assert.ok(lines.some((line) => line.startsWith('nothing came from JH, SG this run')))
  assert.ok(!lines.some((line) => line.includes('trails')))
  assert.ok(!lines.some((line) => line.includes('serves this build exactly')))
})

test('a clean run says so once, counting replicas rather than probes', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE', 'SYD', 'WA'],
    probed: 3,
    // A Seattle probe reaching the DE replica is normal, so WA goes unreported.
    observations: [{ region: 'DE', replica: 'DE' }, { region: 'SYD', replica: 'SYD' }, { region: 'WA', replica: 'DE' }],
    faults: [],
  })

  assert.deepEqual(lines, [
    'replicas reached: 2 of 3 (DE, SYD)',
    'nothing came from WA this run, because an edge picks whichever replica sits near it',
    'every one of the 3 probed regions serves this build exactly',
  ])
})

test('the replica region comes from the storage server name', () => {
  assert.equal(replicaRegion('SYD-690'), 'SYD')
  assert.equal(replicaRegion('DE-1142'), 'DE')
  assert.equal(replicaRegion(null), null)
  assert.equal(replicaRegion(undefined), null)
})

test('worldwide chunk assessment accepts exact bytes and range metadata', () => {
  const current = Buffer.from('current loader')
  const artifact = { name: 'colophon.user.js', body: current }
  const locations = [{ region: 'DE', city: 'Frankfurt', country: 'DE' }]
  const { faults, observations } = assessGlobalpingChunk({
    artifact,
    expected: current,
    start: 0,
    end: current.length - 1,
    locations,
    measurement: {
      id: 'measurement-id',
      results: [{
        probe: { city: 'Frankfurt', country: 'DE' },
        result: {
          statusCode: 206,
          rawBody: current.toString('utf8'),
          truncated: false,
          headers: { 'content-range': `bytes 0-${current.length - 1}/${current.length}`, 'cdn-storageserver': 'UK-689' },
        },
      }],
    },
  })

  assert.deepEqual(faults, [])
  // A probe near one region reaching another region's replica is normal.
  assert.deepEqual(observations, [{ region: 'DE', replica: 'UK', lastModified: null }])
})

test('Bunny region discovery follows the configured Storage Zone', async () => {
  const fetchImpl = async (url) => {
    if (url.endsWith('/pullzone')) {
      return Response.json([{
        Id: 10,
        Enabled: true,
        Suspended: false,
        StorageZoneId: 20,
        Hostnames: [{ Value: 'cdn.test' }],
      }])
    }
    if (url.endsWith('/storagezone/20')) {
      // MARS stands in for a region Bunny adds later, which has no probe city yet.
      return Response.json({ Id: 20, Region: 'DE', ReplicationRegions: ['SYD', 'JP', 'MARS'] })
    }
    return new Response('not found', { status: 404 })
  }
  const found = await getBunnyVerificationLocations({
    apiKey: 'test-key',
    siteUrl: 'https://cdn.test',
    fetchImpl,
  })

  assert.equal(found.pullZoneId, 10)
  assert.equal(found.storageZoneId, 20)
  assert.deepEqual(found.regionCodes, ['DE', 'SYD', 'JP', 'MARS'])
  // An unmapped region is reported plus skipped, never a reason to stop.
  assert.deepEqual(found.unmapped, ['MARS'])
  assert.deepEqual(found.locations.map((location) => location.region), ['DE', 'SYD', 'JP'])
  assert.deepEqual(found.locations.map((location) => location.city), ['Frankfurt', 'Sydney', 'Tokyo'])
  assert.deepEqual(found.locations.map((location) => location.country), ['DE', 'AU', 'JP'])
})
