/// <reference types="vite/client" />

// Filled in at build time by vite's define, so the loader knows which payload
// belongs to it plus what that payload has to hash to.
declare const __COLOPHON_VERSION__: string
declare const __COLOPHON_PAYLOAD_URL__: string
declare const __COLOPHON_PAYLOAD_SHA256__: string
// Digest of the release before this one. Empty on a build with no predecessor
// recorded. The only cache entry the loader may start on a failure.
declare const __COLOPHON_PREVIOUS_SHA256__: string
