// Single source for the userscript version. release.mjs rewrites this line.
export const VERSION = '4.0.0'

export const LOADER_FILE = 'colophon.user.js'
export const META_FILE = 'colophon.meta.js'

// The payload is named after a digest of its own bytes, so two builds can never
// disagree about what a given name holds. build.mjs owns the full name.
export const payloadName = (sha) => `colophon-${sha.slice(0, 16)}.payload.js`
export const PAYLOAD_GLOB = /^colophon-[0-9a-f]{16}\.payload\.js$/

// deploy.mjs exits with this when the upload landed but the purge did not. The
// files are live by then, so release.mjs keeps the new version and retries.
export const PURGE_FAILED_EXIT = 2

// What a run cut short with Ctrl-C leaves behind: the shell convention of 128
// plus the signal number. A child that handles the signal itself exits with this
// rather than dying from it, so the parent reads a status instead of a signal.
export const INTERRUPT_EXIT = 130

// Digest baked into this release as its one allowed fallback. It stays unchanged
// after publishing, which makes a tagged release build byte-for-byte reproducible.
export const FALLBACK_PAYLOAD_SHA256 = '38cc5a4485b204e0e0b775e538efc83522e2fc2a94023ac2a9f7a94cd91bb5ea'

// Digest this release published. The next release copies it to the fallback
// field before building, then records its own digest here after verification.
export const PUBLISHED_PAYLOAD_SHA256 = '65a5d9b8354a87e3414a461dea981f0b382c4cdaa0206991803a03644679ff61'
