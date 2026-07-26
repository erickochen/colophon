// Radix portals default to document.body, which lives outside our shadow root
// and therefore outside our styles. Every portal must target this container.
let container: HTMLElement | null = null

export function setPortalContainer(el: HTMLElement) {
  container = el
}

export function getPortalContainer(): HTMLElement {
  return container ?? document.body
}
