// An explicit `behavior` argument beats the CSS `scroll-behavior` property, so
// a reader who asks for less motion still gets smooth scrolling unless the call
// site checks. These wrappers do that check in one place.

/** True while the reader asks for reduced motion. */
export function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Smooth unless the reader asked for less motion. */
export function scrollBehavior(): ScrollBehavior {
  return reducedMotion() ? 'auto' : 'smooth'
}

export function scrollIntoView(el: Element | null | undefined, options: ScrollIntoViewOptions = {}): void {
  el?.scrollIntoView({ ...options, behavior: scrollBehavior() })
}

export function scrollTo(el: Element | null | undefined, options: ScrollToOptions = {}): void {
  el?.scrollTo({ ...options, behavior: scrollBehavior() })
}
