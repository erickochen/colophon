import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  artifactRanges,
  assessEncodingVariant,
  assessGlobalpingChunk,
  getBunnyVerificationLocations,
  readArtifactStamp,
  planRelease,
  prepareReleaseSource,
  readFallbackPayload,
  readPublishedPayload,
  cacheVerdict,
  parseCachedAt,
  recordPublishedPayload,
  replicaRegion,
  replicationGaps,
  sha256,
  summarizeGlobalReport,
  verifyCdnArtifacts,
  verifyGlobalEncodings,
} from '../release-verify.mjs'

const OLD = '1'.repeat(64)
const CURRENT = '2'.repeat(64)
const NEXT = '3'.repeat(64)

// The release scripts run top to bottom against a live zone, so a name used
// without its import only shows up halfway through a real release. Reading the
// source keeps that within reach of the suite.
const scriptSource = (name) => readFileSync(new URL(`../${name}`, import.meta.url), 'utf8')
const importedFrom = (source, module) => {
  const block = source.match(new RegExp(`import\\s*{([^}]*)}\\s*from\\s*'${module}'`, 's'))
  return new Set((block?.[1] ?? '').split(',').map((part) => part.trim()).filter(Boolean))
}

for (const script of ['release.mjs', 'deploy.mjs']) {
  test(`${script} imports every helper it calls`, () => {
    const source = scriptSource(script)
    // Imports, block comments and line comments go first: a name explained in
    // prose is not a name being called. The lookbehind keeps a URL intact.
    const body = source
      .replace(/import\s*{[^}]*}\s*from\s*'[^']*'/gs, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(?<!:)\/\/.*$/gm, '')
    const held = new Set([
      ...importedFrom(source, './release-verify.mjs'),
      ...importedFrom(source, './version.mjs'),
      ...importedFrom(source, './env.mjs'),
      ...importedFrom(source, 'node:fs'),
      ...importedFrom(source, 'node:path'),
      ...importedFrom(source, 'node:url'),
      ...importedFrom(source, 'node:child_process'),
    ])
    const exported = [...scriptSource('release-verify.mjs').matchAll(/export (?:async function|function|const) (\w+)/g)].map((m) => m[1])
    const versionExports = [...scriptSource('version.mjs').matchAll(/export const (\w+)/g)].map((m) => m[1])
    for (const name of [...exported, ...versionExports]) {
      if (!new RegExp(`\\b${name}\\s*\\(|\\b${name}\\b`).test(body)) continue
      if (!body.match(new RegExp(`(?<![.\\w])${name}\\s*[(),.\\]}\\s]`))) continue
      assert.ok(held.has(name), `${script} uses ${name} without importing it`)
    }
  })
}

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
          'cdn-cachedat': '08/13/2026 07:45:33',
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
    cachedAt: '08/13/2026 07:45:33',
    served: null,
    measurement: 'measurement-id',
  })
  // The replica that answered, which is not always the one in the probe's region.
  assert.deepEqual(observations, [{ region: 'SYD', replica: 'SYD', lastModified: 'old timestamp', cachedAt: '08/13/2026 07:45:33' }])
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
  assert.deepEqual(observations, [{ region: 'DE', replica: 'UK', lastModified: null, cachedAt: null }])
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

test('the cache stamp Bunny sends is read as UTC', () => {
  assert.equal(parseCachedAt('08/13/2026 07:45:33').toISOString(), '2026-08-13T07:45:33.000Z')
  assert.equal(parseCachedAt('13/08/2026 07:45:33'), null)
  assert.equal(parseCachedAt('not a stamp'), null)
  assert.equal(parseCachedAt(null), null)
})

test('a stale edge is separated into a slow replica plus a missed purge', () => {
  const uploadedAt = new Date('2026-08-13T07:45:32Z')
  const purgedAt = new Date('2026-08-13T07:48:00Z')
  // Taken after the purge: this edge did pull, so its replica had nothing newer.
  assert.equal(cacheVerdict({ cachedAt: '08/13/2026 07:48:01', uploadedAt, purgedAt }), 'pulled-stale')
  // A copy from the day before cannot have seen these bytes at all.
  assert.equal(cacheVerdict({ cachedAt: '08/12/2026 17:14:32', uploadedAt, purgedAt }), 'not-purged')
  // Between the upload plus the purge there is nothing to conclude. The wait for
  // replication makes that window minutes wide.
  assert.equal(cacheVerdict({ cachedAt: '08/13/2026 07:46:00', uploadedAt, purgedAt }), 'unknown')
  // Without a purge time of our own, a recent copy stays unexplained.
  assert.equal(cacheVerdict({ cachedAt: '08/13/2026 07:46:00', uploadedAt, purgedAt: null }), 'unknown')
  assert.equal(cacheVerdict({ cachedAt: null, uploadedAt, purgedAt }), 'unknown')
})

test('the report says why a region trails when the edge stamp allows it', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE', 'SE'],
    probed: 2,
    observations: [{ region: 'DE', replica: 'DE' }, { region: 'SE', replica: 'SE' }],
    faults: [{
      region: 'SE',
      kind: 'stale',
      served: '3.13.0',
      lastModified: 'Wed, 12 Aug 2026 11:49:31 GMT',
      cachedAt: '08/13/2026 07:45:33',
      storage: 'SE-582',
      detail: 'chunk mismatch',
      measurement: 'm1',
    }],
    uploadedAt: new Date('2026-08-13T07:45:00Z'),
    purgedAt: new Date('2026-08-13T07:45:32Z'),
  })

  const trailing = lines.find((line) => line.startsWith('SE trails'))
  assert.match(trailing, /because its replica had nothing newer/)
  assert.match(trailing, /edge copy taken 08\/13\/2026 07:45:33/)
})

const variantMeasurement = (headers, statusCode = 200) => ({
  id: 'variant-measurement',
  results: [{ probe: { city: 'Amsterdam', country: 'NL' }, result: { statusCode, headers } }],
})
const AMSTERDAM = [{ region: 'DE', city: 'Amsterdam', country: 'NL' }]
const VARIANT_ARTIFACT = { name: 'colophon.meta.js', body: Buffer.from('current meta') }
const THIS_RELEASE = 'Fri, 14 Aug 2026 14:40:04 GMT'

test('a compressed copy from an earlier release is reported per region', () => {
  const { faults, checked } = assessEncodingVariant({
    artifact: VARIANT_ARTIFACT,
    encoding: 'zstd',
    locations: AMSTERDAM,
    stampedAt: THIS_RELEASE,
    measurement: variantMeasurement({
      'content-encoding': 'zstd',
      'last-modified': 'Fri, 14 Aug 2026 07:29:33 GMT',
      'cdn-storageserver': 'UK-317',
      'cdn-cachedat': '08/14/2026 07:39:56',
      server: 'BunnyCDN-AMS1-1444',
    }),
  })

  assert.equal(checked, 1)
  assert.equal(faults.length, 1)
  assert.equal(faults[0].kind, 'variant')
  assert.equal(faults[0].encoding, 'zstd')
  assert.equal(faults[0].region, 'DE')
  assert.match(faults[0].detail, /dated Fri, 14 Aug 2026 07:29:33 GMT/)
})

test('a compressed copy of this release passes, seconds of replica spread included', () => {
  // Replicas stamp one upload a few seconds apart, which is not an older copy.
  const { faults, checked } = assessEncodingVariant({
    artifact: VARIANT_ARTIFACT,
    encoding: 'zstd',
    locations: AMSTERDAM,
    stampedAt: THIS_RELEASE,
    measurement: variantMeasurement({ 'content-encoding': 'zstd', 'last-modified': 'Fri, 14 Aug 2026 14:40:01 GMT' }),
  })

  assert.deepEqual(faults, [])
  assert.equal(checked, 1)
})

test('an edge that does not compress leaves the byte check to speak for it', () => {
  const { faults, checked } = assessEncodingVariant({
    artifact: VARIANT_ARTIFACT,
    encoding: 'zstd',
    locations: AMSTERDAM,
    stampedAt: THIS_RELEASE,
    // No content-encoding means one copy rather than two, so there is nothing extra to judge.
    measurement: variantMeasurement({ 'last-modified': 'Fri, 14 Aug 2026 07:29:33 GMT' }),
  })

  assert.deepEqual(faults, [])
  assert.equal(checked, 0)
})

test('an edge refusing the compressed copy is reported rather than passed over', () => {
  const { faults, checked } = assessEncodingVariant({
    artifact: VARIANT_ARTIFACT,
    encoding: 'zstd',
    locations: AMSTERDAM,
    stampedAt: THIS_RELEASE,
    // A refusal carries no content-encoding, which would otherwise read as an
    // edge that simply does not compress.
    measurement: variantMeasurement({ server: 'BunnyCDN-AMS1-1444' }, 502),
  })

  assert.equal(checked, 0)
  assert.equal(faults.length, 1)
  assert.equal(faults[0].kind, 'unhappy')
  assert.match(faults[0].detail, /answered 502, expected 200/)
})

test('a handed in date is used instead of reading one from an edge', async () => {
  const artifact = { name: 'colophon.meta.js', url: 'https://cdn.test/colophon.meta.js', body: Buffer.from('meta') }
  let headRequests = 0
  const fetchImpl = async (url, init) => {
    if (init?.method === 'HEAD' && String(url).startsWith('https://cdn.test/')) {
      headRequests++
      // Stands in for an edge that was purged and pulled an earlier release back.
      return new Response(null, { status: 200, headers: { 'last-modified': 'Fri, 14 Aug 2026 07:29:33 GMT' } })
    }
    if (String(url).endsWith('/measurements')) return Response.json({ id: 'handed-in' })
    return Response.json({
      status: 'finished',
      results: [{ probe: { city: 'Amsterdam', country: 'NL' }, result: { statusCode: 200, headers: { 'content-encoding': 'zstd', 'last-modified': THIS_RELEASE } } }],
    })
  }
  const { faults, landedAt } = await verifyGlobalEncodings({
    artifacts: [artifact],
    locations: AMSTERDAM,
    token: null,
    fetchImpl,
    stamps: new Map([['colophon.meta.js', THIS_RELEASE]]),
  })

  assert.equal(headRequests, 0)
  assert.deepEqual(faults, [])
  assert.equal(landedAt.toUTCString(), THIS_RELEASE)
})

test('a region that never answered is counted as unchecked rather than failed', () => {
  const { faults, checked } = assessEncodingVariant({
    artifact: VARIANT_ARTIFACT,
    encoding: 'zstd',
    locations: AMSTERDAM,
    stampedAt: THIS_RELEASE,
    measurement: { id: 'variant-measurement', results: [] },
  })

  assert.deepEqual(faults, [])
  assert.equal(checked, 0)
})

const variantFault = (cachedAt) => ({
  artifact: 'colophon.meta.js',
  region: 'DE',
  kind: 'variant',
  encoding: 'zstd',
  detail: 'dated Fri, 14 Aug 2026 07:29:33 GMT, while this release is dated Fri, 14 Aug 2026 14:40:04 GMT',
  storage: 'UK-317',
  cachedAt,
  served: null,
  measurement: 'm1',
})

test('the report names the compressed copy plus what clears it', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE'],
    probed: 1,
    observations: [{ region: 'DE', replica: 'DE' }],
    // Taken before the upload, so this edge never saw these bytes at all.
    faults: [variantFault('08/14/2026 07:39:56')],
    uploadedAt: new Date('2026-08-14T14:40:01Z'),
    purgedAt: new Date('2026-08-14T14:47:00Z'),
  })

  const line = lines.find((entry) => entry.includes('zstd'))
  assert.match(line, /^DE hands colophon\.meta\.js to anyone asking for zstd from an earlier release/)
  assert.match(line, /A purge of that file clears it\./)
  // A copy this old is not replication lag, so it never reads as a trailing region.
  assert.ok(!lines.some((entry) => entry.includes('trails')))
  assert.ok(!lines.some((entry) => entry.includes('serves this build exactly')))
})

test('a copy taken after the purge is not sent off to be purged again', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE'],
    probed: 1,
    observations: [{ region: 'DE', replica: 'DE' }],
    // Taken after the purge, so this edge did pull and its replica trails.
    faults: [variantFault('08/14/2026 14:48:30')],
    uploadedAt: new Date('2026-08-14T14:40:01Z'),
    purgedAt: new Date('2026-08-14T14:47:00Z'),
  })

  const line = lines.find((entry) => entry.includes('zstd'))
  // Purging there pulls the same bytes back plus holds them for a full cache time.
  assert.ok(!line.includes('A purge of that file clears it'))
  assert.match(line, /replica had nothing newer/)
})

test('a compressed copy with no cache stamp gets no advice at all', () => {
  const lines = summarizeGlobalReport({
    regionCodes: ['DE'],
    probed: 1,
    observations: [{ region: 'DE', replica: 'DE' }],
    faults: [variantFault(null)],
    uploadedAt: new Date('2026-08-14T14:40:01Z'),
    purgedAt: new Date('2026-08-14T14:47:00Z'),
  })

  const line = lines.find((entry) => entry.includes('zstd'))
  assert.ok(!line.includes('purge'))
  assert.match(line, /from an earlier release/)
})

test('two files stale in one region are named one by one', () => {
  const stale = {
    region: 'DE',
    kind: 'variant',
    encoding: 'zstd',
    detail: 'dated earlier',
    served: null,
    measurement: 'm1',
  }
  const lines = summarizeGlobalReport({
    regionCodes: ['DE'],
    probed: 1,
    observations: [{ region: 'DE', replica: 'DE' }],
    faults: [
      { ...stale, artifact: 'colophon.meta.js' },
      { ...stale, artifact: 'colophon.user.js' },
    ],
  })

  // Purging the one file a single line named would leave the other one stale.
  assert.ok(lines.some((line) => line.includes('colophon.meta.js')))
  assert.ok(lines.some((line) => line.includes('colophon.user.js')))
})

test('a variant check that fell over is reported rather than counted as clean', async () => {
  const artifact = { name: 'colophon.meta.js', url: 'https://cdn.test/colophon.meta.js', body: Buffer.from('meta') }
  const fetchImpl = async (url, init) => {
    if (init?.method === 'HEAD' && String(url).startsWith('https://cdn.test/')) {
      return new Response(null, { status: 200, headers: { 'last-modified': THIS_RELEASE } })
    }
    // Stands in for Globalping turning the measurement down.
    return new Response('rate limited', { status: 429 })
  }
  const { faults, checked, asked } = await verifyGlobalEncodings({
    artifacts: [artifact],
    locations: AMSTERDAM,
    token: null,
    fetchImpl,
    retryMs: 0,
  })

  assert.equal(checked, 0)
  assert.equal(asked, 1)
  assert.equal(faults.length, 1)
  assert.equal(faults[0].kind, 'silent')
  assert.match(faults[0].detail, /went unmeasured/)
  // A silent region keeps the report from calling the run clean.
  const lines = summarizeGlobalReport({ regionCodes: ['DE'], probed: 1, observations: [], faults })
  assert.ok(!lines.some((line) => line.includes('serves this build exactly')))
})

test('a refused measurement is asked once more before it counts as trouble', async () => {
  const artifact = { name: 'colophon.meta.js', url: 'https://cdn.test/colophon.meta.js', body: Buffer.from('meta') }
  let measurements = 0
  const fetchImpl = async (url, init) => {
    if (init?.method === 'HEAD' && String(url).startsWith('https://cdn.test/')) {
      return new Response(null, { status: 200, headers: { 'last-modified': THIS_RELEASE } })
    }
    measurements++
    // Turned down once, then answered, which is what a busy Globalping looks like.
    if (measurements === 1) return new Response('rate limited', { status: 429 })
    if (String(url).endsWith('/measurements')) return Response.json({ id: 'retried' })
    return Response.json({
      status: 'finished',
      results: [{ probe: { city: 'Amsterdam', country: 'NL' }, result: { statusCode: 200, headers: { 'content-encoding': 'zstd', 'last-modified': THIS_RELEASE } } }],
    })
  }
  const { faults, checked } = await verifyGlobalEncodings({
    artifacts: [artifact],
    locations: AMSTERDAM,
    token: null,
    fetchImpl,
    retryMs: 0,
  })

  assert.deepEqual(faults, [])
  assert.equal(checked, 1)
})

test('an artifact without a date counts as asked and says so', async () => {
  const artifact = { name: 'colophon.user.js', url: 'https://cdn.test/colophon.user.js', body: Buffer.from('loader') }
  const { checked, asked, skipped, faults } = await verifyGlobalEncodings({
    artifacts: [artifact],
    locations: AMSTERDAM,
    token: null,
    fetchImpl: async () => new Response('nope', { status: 503 }),
  })

  // Counting only what succeeded would read as a perfect score for no work at all.
  assert.equal(checked, 0)
  assert.equal(asked, 1)
  assert.deepEqual(faults, [])
  assert.equal(skipped.length, 1)
  assert.match(skipped[0], /colophon\.user\.js carries no date/)
})

test('the stamp for a release comes from the copy that was compared exactly', async () => {
  const asked = []
  const fetchImpl = async (url, init) => {
    asked.push({ url, method: init.method, encoding: init.headers['Accept-Encoding'] })
    return new Response(null, { status: 200, headers: { 'last-modified': THIS_RELEASE } })
  }
  const stamp = await readArtifactStamp({ artifact: { url: 'https://cdn.test/colophon.meta.js' }, fetchImpl })

  assert.equal(stamp, THIS_RELEASE)
  assert.deepEqual(asked, [{ url: 'https://cdn.test/colophon.meta.js', method: 'HEAD', encoding: 'identity' }])

  const refused = await readArtifactStamp({
    artifact: { url: 'https://cdn.test/colophon.meta.js' },
    fetchImpl: async () => new Response('nope', { status: 403 }),
  })
  assert.equal(refused, null)
})

test('replication gaps name the regions a release is not listed for yet', () => {
  const digest = sha256('loader bytes')
  const regions = ['UK', 'SE', 'SYD']
  const listing = [{ ObjectName: 'colophon.user.js', Checksum: digest.toUpperCase(), ReplicatedZones: 'UK,SE' }]

  const gaps = replicationGaps({ listing, wanted: { 'colophon.user.js': digest }, regions })
  assert.equal(gaps.length, 1)
  assert.deepEqual(gaps[0].missing, ['SYD'])

  const done = replicationGaps({
    listing: [{ ...listing[0], ReplicatedZones: 'UK,SE,SYD' }],
    wanted: { 'colophon.user.js': digest },
    regions,
  })
  assert.deepEqual(done, [])
})

test('replication gaps hold back on bytes the main region does not have yet', () => {
  const regions = ['UK']
  const wanted = { 'colophon.meta.js': sha256('new meta') }
  const other = replicationGaps({
    listing: [{ ObjectName: 'colophon.meta.js', Checksum: sha256('old meta'), ReplicatedZones: 'UK' }],
    wanted,
    regions,
  })
  assert.match(other[0].reason, /other bytes/)

  const absent = replicationGaps({ listing: [], wanted, regions })
  assert.match(absent[0].reason, /not in the listing/)
})
