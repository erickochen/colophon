// The installed userscript: it veils the page, then runs the app from the origin
// cache. A manager only has to move this file, which keeps the veil ahead of
// MAM's own first paint.

// Importing boot-guard puts the veil up as a side effect, so it stays first.
import { revealPage, whenDocumentElement } from '@/lib/boot-guard'
import { preventWysiwyg } from '@/lib/wysiwyg'

// One entry holds "<sha256>\n<code>". A second copy would not fit: the origin
// allows about 5M characters and the app alone is close to 1.5M.
const CACHE_KEY = 'colophon:payload'

// Long enough for a cold fetch of the whole app on a slow line. Longer than the
// veil's reveal failsafe, so a slow line gets the original page first plus
// Colophon once the payload lands.
const FETCH_TIMEOUT_MS = 15_000

interface GmResponse {
  status: number
  responseText: string
}

interface GmRequest {
  method: string
  url: string
  timeout?: number
  onload?: (res: GmResponse) => void
  onerror?: () => void
  ontimeout?: () => void
}

declare const GM_xmlhttpRequest: ((req: GmRequest) => void) | undefined
declare const unsafeWindow: Window | undefined

/** The window MAM's own scripts see. Under a grant a manager may hand us a
 * sandboxed one, where a trap would never be reached. */
const pageWindow: Window = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

interface CacheEntry {
  hash: string
  code: string
}

function readCache(): CacheEntry | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const split = raw.indexOf('\n')
    if (split < 0) return null
    return { hash: raw.slice(0, split), code: raw.slice(split + 1) }
  } catch {
    // Storage blocked: every navigation fetches instead. The veil still holds.
    return null
  }
}

function dropCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    /* storage blocked, so there is nothing cached to drop */
  }
}

function writeCache(code: string): void {
  try {
    localStorage.setItem(CACHE_KEY, `${__COLOPHON_PAYLOAD_SHA256__}\n${code}`)
  } catch (err) {
    // Over quota. The app runs anyway, it just gets fetched again next time.
    console.warn('[Colophon] could not cache the app, so every page fetches it:', err)
  }
}

const blockedByPolicy = (err: unknown) =>
  err instanceof EvalError || /content security policy|unsafe-eval/i.test(String(err))

/** Runs in page context, where MAM's globals plus our own hooks live. MAM serves
 * 'unsafe-eval' on every page measured while 'unsafe-inline' is missing on some,
 * so the page's own eval goes first. Returns whether the page ran it. */
function run(code: string): boolean {
  try {
    ;(pageWindow as Window & { eval: (src: string) => unknown }).eval(code)
  } catch (err) {
    // Rethrow anything the payload itself threw: a second attempt would apply
    // half of it twice.
    if (!blockedByPolicy(err)) throw err
    const el = document.createElement('script')
    el.textContent = code
    document.documentElement.appendChild(el)
    el.remove()
  }
  return (pageWindow as { __colophon?: string }).__colophon === __COLOPHON_VERSION__
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function fetchPayload(): Promise<string> {
  return new Promise((resolve, reject) => {
    if (typeof GM_xmlhttpRequest !== 'function') {
      reject(new Error('GM_xmlhttpRequest unavailable'))
      return
    }
    GM_xmlhttpRequest({
      method: 'GET',
      url: __COLOPHON_PAYLOAD_URL__,
      timeout: FETCH_TIMEOUT_MS,
      onload: (res) =>
        res.status >= 200 && res.status < 300
          ? resolve(res.responseText)
          : reject(new Error(`status ${res.status}`)),
      onerror: () => reject(new Error('network')),
      ontimeout: () => reject(new Error('timeout')),
    })
  })
}

/** Last resort when the payload this build expects cannot be had. An entry from
 * an older release is not pinned to a hash this build knows, so it only runs
 * here plus never on the normal path. */
function fallBack(reason: string, cached: CacheEntry | null): void {
  if (cached && cached.hash !== __COLOPHON_PAYLOAD_SHA256__ && run(cached.code)) {
    console.warn(`[Colophon] ${reason}, ran an older cached copy`)
    return
  }
  console.warn(`[Colophon] ${reason}, leaving the original page`)
  revealPage()
}

async function boot(): Promise<void> {
  preventWysiwyg(pageWindow)

  const cached = readCache()
  try {
    if (cached && cached.hash === __COLOPHON_PAYLOAD_SHA256__) {
      // The stored bytes get hashed too: any script on this origin can write that
      // key, so taking it on trust would turn one injection into a lasting one.
      if ((await sha256Hex(cached.code)) === __COLOPHON_PAYLOAD_SHA256__) {
        if (run(cached.code)) return
        // Nothing evaluated it. Running it again risks a half applied app, so
        // drop it plus let the next navigation fetch a fresh copy.
        dropCache()
        console.warn('[Colophon] the page did not run the cached app, leaving the original page')
        revealPage()
        return
      }
      dropCache()
    }

    const code = await fetchPayload()
    if ((await sha256Hex(code)) !== __COLOPHON_PAYLOAD_SHA256__) throw new Error('hash mismatch')
    if (!run(code)) throw new Error('the page did not run the app')
    writeCache(code)
  } catch (err) {
    fallBack(err instanceof Error ? err.message : 'load failed', cached)
  }
}

whenDocumentElement(() => {
  void boot()
})
