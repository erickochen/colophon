// Single source for the userscript version. release.mjs rewrites this line.
export const VERSION = '3.12.0'

export const LOADER_FILE = 'colophon.user.js'
export const META_FILE = 'colophon.meta.js'

// The payload is named after a digest of its own bytes, so two builds can never
// disagree about what a given name holds. build.mjs owns the full name.
export const payloadName = (sha) => `colophon-${sha.slice(0, 16)}.payload.js`
export const PAYLOAD_GLOB = /^colophon-[0-9a-f]{16}\.payload\.js$/

// deploy.mjs exits with this when the upload landed but the purge did not. The
// files are live by then, so release.mjs keeps the new version and retries.
export const PURGE_FAILED_EXIT = 2

// Digest of the payload the previous release published. The loader carries it so
// a failed fetch can start that one copy plus nothing else. Empty means no
// fallback at all. release.mjs rewrites this line once a release verifies.
export const PREVIOUS_PAYLOAD_SHA256 = '5b9a142eb63132f3c9705ad031c0498ebafa47c8afca0aa408340b068c35f48d'
