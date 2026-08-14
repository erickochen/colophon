// Single source for the userscript version. release.mjs rewrites this line.
export const VERSION = '3.17.0'

export const LOADER_FILE = 'colophon.user.js'
export const META_FILE = 'colophon.meta.js'

// The payload is named after a digest of its own bytes, so two builds can never
// disagree about what a given name holds. build.mjs owns the full name.
export const payloadName = (sha) => `colophon-${sha.slice(0, 16)}.payload.js`
export const PAYLOAD_GLOB = /^colophon-[0-9a-f]{16}\.payload\.js$/

// deploy.mjs exits with this when the upload landed but the purge did not. The
// files are live by then, so release.mjs keeps the new version and retries.
export const PURGE_FAILED_EXIT = 2

// Digest baked into this release as its one allowed fallback. It stays unchanged
// after publishing, which makes a tagged release build byte-for-byte reproducible.
export const FALLBACK_PAYLOAD_SHA256 = 'da2b07575a501a8cc75150ff7a22d34774656bba1913c1bc4fd6b88b6d0137dc'

// Digest this release published. The next release copies it to the fallback
// field before building, then records its own digest here after verification.
export const PUBLISHED_PAYLOAD_SHA256 = '73288169bbc8394e57a184f5ca83fcb973635a1f48ecb1a201d34ce58a40ed2d'
