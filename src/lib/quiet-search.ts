// MAM's torSearch.js runs its own search on every /tor/search.php load. That
// page stays hidden here, so the call would only spend the member's search
// budget next to ours. A top-level function declaration redefines any accessor
// trap, so the overwrite waits for DOMContentLoaded instead: registered at
// document-start it runs before jQuery's ready callbacks, which is where the
// search fires. The popstate handler in the same file calls the same global
// and goes quiet with it.
const SEARCH_PAGE = '/tor/search.php'

const noop = () => {}

type SearchWindow = Window & { performTorAndRequestSearch?: () => void }

export function preventLegacyAutoSearch(target: Window = window): void {
  if (target.location.pathname !== SEARCH_PAGE) return
  const silence = () => {
    ;(target as SearchWindow).performTorAndRequestSearch = noop
  }
  if (target.document.readyState !== 'loading') {
    silence()
    return
  }
  target.document.addEventListener('DOMContentLoaded', silence, { once: true, capture: true })
}
