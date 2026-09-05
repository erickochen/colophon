// MAM marks a peer's reachability with a thumb icon that its own stylesheet
// sizes and tints. Neither reaches our shadow root, so the icon is swapped for
// the status dot the rest of the app uses. The dot is styled in index.css,
// since it lands inside injected HTML rather than in JSX.

/** The three states MAM marks on its thumb icon: reachable, present but
 * unreachable plus no client seen at all. */
export const CLIENT_STATES = ['connectable', 'unconnectable', 'offline'] as const
export type ClientState = (typeof CLIENT_STATES)[number]

const DOT_STATE: Record<ClientState, string> = { connectable: 'ok', unconnectable: 'no', offline: 'off' }

/** Swaps every reachability icon under a root for a dot. Mutates in place, so
 * pass a parsed document or a clone. */
export function swapStatusIcons(root: ParentNode): void {
  for (const img of root.querySelectorAll('img')) {
    const state = CLIENT_STATES.find((s) => img.classList.contains(s))
    if (!state) continue
    const dot = img.ownerDocument.createElement('span')
    dot.dataset.conn = DOT_STATE[state]
    const name = img.title || img.alt
    if (name) {
      dot.title = name
      dot.setAttribute('role', 'img')
      dot.setAttribute('aria-label', name)
    }
    img.replaceWith(dot)
  }
}
