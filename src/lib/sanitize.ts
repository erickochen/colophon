// Shared sanitizer for MAM-served HTML fragments we re-render inside our UI.
// Drops active elements, inline handlers and javascript: URLs.
export function cleanHtml(el: Element | null | undefined): string | null {
  if (!el) return null
  const c = el.cloneNode(true) as HTMLElement
  c.querySelectorAll('script, style, iframe, object, embed, link, meta').forEach((x) => x.remove())
  for (const node of c.querySelectorAll<HTMLElement>('*')) {
    for (const attr of [...node.attributes]) {
      const n = attr.name.toLowerCase()
      const v = attr.value.trim().toLowerCase()
      if (n.startsWith('on')) node.removeAttribute(attr.name)
      else if ((n === 'href' || n === 'src' || n === 'action') && (v.startsWith('javascript:') || v.startsWith('data:text/html'))) {
        node.removeAttribute(attr.name)
      }
    }
  }
  return c.innerHTML.trim() || null
}
