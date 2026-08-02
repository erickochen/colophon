// MAM ships no viewport meta, so phones render a 980px desktop layout zoomed
// out. Pages listed here are laid out for small screens and get a real
// device-width viewport; everywhere else the zoomed-out view stays the better
// experience because those layouts are not responsive yet.
const MOBILE_READY = [/^\/shoutbox\//]

const META_ID = 'mam-remaster-viewport'

export function applyMobileViewport(): void {
  if (!MOBILE_READY.some((re) => re.test(location.pathname))) return
  if (document.getElementById(META_ID)) return
  const meta = document.createElement('meta')
  meta.id = META_ID
  meta.name = 'viewport'
  meta.content = 'width=device-width, initial-scale=1'
  document.head.appendChild(meta)
}

export function removeMobileViewport(): void {
  document.getElementById(META_ID)?.remove()
}
