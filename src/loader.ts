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

/** What the manager hands us as the page window. In a Firefox content sandbox
 * this is an X-ray view: reads pass, writes stay on our side and its eval runs
 * here rather than in the page. */
const managerWindow: Window = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window

/** MAM's own realm, where the app has to run to reach their globals. Behind an
 * X-ray view the page's real window sits at wrappedJSObject; elsewhere the
 * manager window already is that realm. */
const pageWindow: Window = (managerWindow as Window & { wrappedJSObject?: Window }).wrappedJSObject ?? managerWindow

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

// The message differs per engine: Chrome names the policy, Firefox says CSP.
const blockedByPolicy = (err: unknown) =>
  err instanceof EvalError || /content security policy|unsafe-eval|blocked by CSP/i.test(String(err))

/** Runs in page context, where MAM's globals plus our own hooks live. MAM serves
 * 'unsafe-eval' on every page measured while 'unsafe-inline' is missing on some,
 * so the page's own eval goes first. Returns the version this call announced.
 * A marker left by another install does not count, so it has to change. */
function run(code: string): string | null {
  const announced = () => (pageWindow as { __colophon?: string }).__colophon
  const before = announced()
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
  const after = announced()
  return after && after !== before ? after : null
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

/** One release back is as far as a failure may reach, because that digest is
 * baked in here. Checking an entry against the hash stored beside it would prove
 * nothing: both halves come from a key anything on this origin can write.
 * Returns the version that started. */
async function runPrevious(cached: CacheEntry | null): Promise<string | null> {
  // A build whose predecessor shipped the same payload has nothing to fall back
  // to. Running it again here would apply the copy that just failed twice.
  if (__COLOPHON_PREVIOUS_SHA256__ === __COLOPHON_PAYLOAD_SHA256__) return null
  if (!__COLOPHON_PREVIOUS_SHA256__ || cached?.hash !== __COLOPHON_PREVIOUS_SHA256__) return null
  try {
    if ((await sha256Hex(cached.code)) !== __COLOPHON_PREVIOUS_SHA256__) return null
    return run(cached.code)
  } catch {
    // Part of it may have applied already, so hand the page back rather than
    // try anything else on top.
    return null
  }
}

/** Last resort when the payload this build expects cannot be had. */
async function fallBack(reason: string, cached: CacheEntry | null): Promise<void> {
  const ran = await runPrevious(cached)
  if (ran) {
    // The copy that just started takes the veil down once it paints, if the
    // reveal failsafe has not beaten it to it on a slow line.
    console.warn(`[Colophon] ${reason}, running cached ${ran} instead of ${__COLOPHON_VERSION__}`)
    return
  }
  console.warn(`[Colophon] ${reason}, leaving the original page`)
  revealPage()
}

async function boot(): Promise<void> {
  // Only where no X-ray sits between us and the page: an accessor from this
  // side on the page's own window makes MAM's assignment to it throw. Behind
  // an X-ray the app installs the trap itself once it runs in the page.
  if (managerWindow === pageWindow) preventWysiwyg(pageWindow)

  const cached = readCache()
  // Once an eval has started, part of the app may already be applied, so a
  // second copy on top of it is worse than handing the page back.
  let evaluated = false
  try {
    if (cached && cached.hash === __COLOPHON_PAYLOAD_SHA256__) {
      // The stored bytes get hashed too: any script on this origin can write that
      // key, so taking it on trust would turn one injection into a lasting one.
      if ((await sha256Hex(cached.code)) === __COLOPHON_PAYLOAD_SHA256__) {
        evaluated = true
        if (run(cached.code) === __COLOPHON_VERSION__) return
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
    evaluated = true
    if (run(code) !== __COLOPHON_VERSION__) throw new Error('the page did not run the app')
    writeCache(code)
  } catch (err) {
    await fallBack(err instanceof Error ? err.message : 'load failed', evaluated ? null : cached)
  }
}

whenDocumentElement(() => {
  void boot()
})
