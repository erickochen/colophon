// Single source for the userscript version. release.mjs rewrites this line.
export const VERSION = '4.6.0'

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
export const FALLBACK_PAYLOAD_SHA256 = '54e23354a6c664291ca24f2ae9abd12491de8ac3e10eb80a9f06c172af0dea90'

// Digest this release published. The next release copies it to the fallback
// field before building, then records its own digest here after verification.
export const PUBLISHED_PAYLOAD_SHA256 = '272e0acffbb924f8e018c25a211b8e41aab49c49c9ae3ad99f962b912592b35d'
