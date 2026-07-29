// Theme preference and the two page backgrounds. Kept free of imports so the
// boot guard can use it as the very first module in the bundle.

export type Theme = 'light' | 'dark' | 'auto'

export const THEME_KEY = 'mam-remaster:theme'

/** Page background per scheme, mirroring --background in index.css. */
export const PAGE_BG = {
  light: 'oklch(0.985 0.003 80)',
  dark: 'oklch(0.172 0.005 56)',
} as const

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Stored preference. Anything unrecognised counts as auto. */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

/** Which of the two schemes a preference resolves to right now. */
export function isDark(theme: Theme = getTheme()): boolean {
  return theme === 'dark' || (theme === 'auto' && systemDark().matches)
}

export function applyTheme(rootEl: HTMLElement, theme?: Theme) {
  if (theme) localStorage.setItem(THEME_KEY, theme)
  const dark = isDark(theme ?? getTheme())
  rootEl.classList.toggle('dark', dark)
  // Light-DOM marker: the slotted legacy dialog body cannot see the shadow class.
  document.documentElement.classList.toggle('mam-dark', dark)
}

/** On auto, a system switch repaints straight away instead of at the next load. */
export function watchSystemTheme(rootEl: HTMLElement): void {
  systemDark().addEventListener('change', () => {
    if (getTheme() === 'auto') applyTheme(rootEl)
  })
}
