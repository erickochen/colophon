// MAM marks a peer's reachability with a thumb icon that its own stylesheet
// sizes and tints. Neither reaches our shadow root, so the icon is swapped for
// the status dot the rest of the app uses. The dot is styled in index.css,
// since it lands inside injected HTML rather than in JSX.

const DOT_STATE: Record<string, string> = { connectable: 'ok', unconnectable: 'no', offline: 'off' }

/** Swaps every reachability icon under a root for a dot. Mutates in place, so
 * pass a parsed document or a clone. */
export function swapStatusIcons(root: ParentNode): void {
  for (const img of root.querySelectorAll('img')) {
    const state = [...img.classList].map((c) => DOT_STATE[c]).find(Boolean)
    if (!state) continue
    const dot = img.ownerDocument.createElement('span')
    dot.dataset.conn = state
    const name = img.title || img.alt
    if (name) {
      dot.title = name
      dot.setAttribute('role', 'img')
      dot.setAttribute('aria-label', name)
    }
    img.replaceWith(dot)
  }
}
