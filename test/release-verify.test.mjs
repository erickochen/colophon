import assert from 'node:assert/strict'
import test from 'node:test'
import {
  artifactRanges,
  assessGlobalpingChunk,
  getBunnyVerificationLocations,
  prepareReleaseSource,
  recordPublishedPayload,
  sha256,
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
  const locations = [{ region: 'SYD', magic: 'Sydney', aliases: ['Sydney'] }]
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
  const faults = assessGlobalpingChunk({
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
    detail: `chunk SHA-256 ${sha256('old meta')}, expected ${sha256(current)}`,
    probe: 'Sydney, AU',
    edge: 'BunnyCDN-SYD1',
    storage: 'SYD-690',
    lastModified: 'old timestamp',
    cache: 'MISS',
    measurement: 'measurement-id',
  })
})

test('worldwide chunk assessment accepts exact bytes and range metadata', () => {
  const current = Buffer.from('current loader')
  const artifact = { name: 'colophon.user.js', body: current }
  const locations = [{ region: 'DE', magic: 'Frankfurt', aliases: ['Frankfurt', 'Falkenstein'] }]
  const faults = assessGlobalpingChunk({
    artifact,
    expected: current,
    start: 0,
    end: current.length - 1,
    locations,
    measurement: {
      id: 'measurement-id',
      results: [{
        probe: { city: 'Falkenstein', country: 'DE' },
        result: {
          statusCode: 206,
          rawBody: current.toString('utf8'),
          truncated: false,
          headers: { 'content-range': `bytes 0-${current.length - 1}/${current.length}` },
        },
      }],
    },
  })

  assert.deepEqual(faults, [])
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
      return Response.json({ Id: 20, Region: 'DE', ReplicationRegions: ['SYD', 'JP'] })
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
  assert.deepEqual(found.locations.map((location) => location.region), ['DE', 'SYD', 'JP'])
  assert.deepEqual(found.locations.map((location) => location.magic), ['Frankfurt', 'Sydney', 'Tokyo'])
})
