// Every request to MAM goes out with an absolute URL. A manager that runs the
// script in its own sandbox gives that realm no base URL of its own, so a
// relative path throws "not a valid URL" before anything reaches the network.
// Firefox takes that route on pages whose CSP leaves out 'unsafe-inline'.

/** MAM path as an absolute URL. An absolute input is handed back unchanged. */
export const mamUrl = (path: string) => new URL(path, location.href).href

/** fetch with the URL resolved against the page, so it works from any realm. */
export const mamFetch = (path: string, init?: RequestInit) => fetch(mamUrl(path), init)

/** The signed session token MAM's cdn endpoints ask for. It sits
 * percent-encoded in document.cookie. Those endpoints answer "invalid cookie"
 * unless it arrives decoded. */
export function sessionToken(): string {
  const raw = document.cookie.split('; ').find((c) => c.startsWith('mbsc='))?.slice('mbsc='.length) ?? ''
  try {
    return decodeURIComponent(raw)
  } catch {
    return raw
  }
}
