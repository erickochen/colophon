// MAM hides part of a page behind a handle: an `<a data-klappe="name">` next to a
// body that starts out display:none. Its own listener sits on document, which
// never sees a click inside our shadow root, so each block is rebuilt here as a
// button with a panel that opens.

/** The shape of lucide's ChevronRight, written out because this markup is built
 * as a string rather than as React. */
const CARET =
  '<svg class="spoiler-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor"' +
  ' stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="m9 18 6-6-6-6"/></svg>'

/** Used when the handle carries no wording of its own. */
const FALLBACK_LABEL = 'Hidden text'

/** Panel ids have to stay unique across every block on the page, so the counter
 * lives beyond one call. */
let seq = 0

/** The body a handle opens. Forum posts repeat their ids, so inside a block the
 * sibling wins; elsewhere MAM names the body after the handle with a k in front. */
function bodyFor(doc: Document, handle: Element, key: string): HTMLElement | null {
  const block = handle.closest('.hide_block')
  if (block) {
    const sibling = [...block.children].find((c) => c !== handle && c instanceof HTMLElement)
    if (sibling) return sibling as HTMLElement
  }
  return key ? doc.getElementById('k' + key) : null
}

/** Rebuilds every hidden block in a fragment of MAM markup. The document is
 * parsed rather than pattern-matched, so a block nested in a table or a quote
 * comes out whole. */
export function rewriteHiddenBlocks(html: string): string {
  if (!html.includes('data-klappe')) return html
  const doc = new DOMParser().parseFromString(html, 'text/html')
  let changed = false

  for (const handle of [...doc.querySelectorAll('[data-klappe]')]) {
    const key = handle.getAttribute('data-klappe') ?? ''
    const body = bodyFor(doc, handle, key)
    if (!body || body === handle || body.contains(handle)) continue

    const open = body.style.display !== 'none'
    const id = `spoiler-${++seq}`

    const trigger = doc.createElement('button')
    trigger.type = 'button'
    trigger.className = 'spoiler-trigger'
    trigger.setAttribute('aria-expanded', String(open))
    trigger.setAttribute('aria-controls', id)
    trigger.innerHTML = `${CARET}<span></span>`
    // The author's own wording lands as text, never as markup. MAM ends it on a
    // colon to introduce the plus sign, which is gone here.
    trigger.lastElementChild!.textContent =
      handle.textContent?.replace(/\s+/g, ' ').replace(/\s*:\s*$/, '').trim() || FALLBACK_LABEL

    const inner = doc.createElement('div')
    inner.className = 'spoiler-inner'
    const panel = doc.createElement('div')
    panel.className = 'spoiler-panel'
    panel.id = id
    // Closed content stays out of the tab order plus out of the reading order.
    if (!open) panel.setAttribute('inert', '')
    panel.append(inner)

    const wrap = doc.createElement('div')
    wrap.className = 'spoiler'
    wrap.dataset.open = String(open)

    // With a block wrapper the whole thing is replaced, so no empty frame is
    // left behind; without one only the handle makes way.
    ;(handle.closest('.hide_block') ?? handle).replaceWith(wrap)
    wrap.append(trigger, panel)
    body.style.removeProperty('display')
    body.removeAttribute('id')
    body.classList.add('spoiler-body')
    inner.append(body)
    changed = true
  }

  return changed ? doc.body.innerHTML : html
}

/** Opens or closes the block a click landed in. Returns false when it landed
 * somewhere else. */
export function toggleSpoiler(target: EventTarget | null): boolean {
  const trigger = target instanceof Element ? target.closest('.spoiler-trigger') : null
  const wrap = trigger?.closest<HTMLElement>('.spoiler')
  const panel = wrap?.querySelector<HTMLElement>(':scope > .spoiler-panel')
  if (!trigger || !wrap || !panel) return false
  const open = wrap.dataset.open !== 'true'
  wrap.dataset.open = String(open)
  trigger.setAttribute('aria-expanded', String(open))
  if (open) panel.removeAttribute('inert')
  else panel.setAttribute('inert', '')
  return true
}
