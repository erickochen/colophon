// Theme preference and the page backgrounds. Kept free of imports so the
// boot guard can use it as the very first module in the bundle.

export type Theme = 'light' | 'dark' | 'auto'
export type LightScheme = 'default' | 'latte' | 'solarized'
export type DarkScheme = 'default' | 'dracula' | 'onedark'

export const THEME_KEY = 'colophon:theme'
export const SCHEME_LIGHT_KEY = 'colophon:scheme-light'
export const SCHEME_DARK_KEY = 'colophon:scheme-dark'

// One-time rename from the old prefix. This module loads first and stays
// import-free, so it migrates its own keys inline before the first read.
try {
  for (const [oldKey, newKey] of [
    ['mam-remaster:theme', THEME_KEY],
    ['mam-remaster:scheme-light', SCHEME_LIGHT_KEY],
    ['mam-remaster:scheme-dark', SCHEME_DARK_KEY],
  ]) {
    const value = localStorage.getItem(oldKey)
    if (value !== null) {
      if (localStorage.getItem(newKey) === null) localStorage.setItem(newKey, value)
      localStorage.removeItem(oldKey)
    }
  }
} catch {
  // private mode
}

export const LIGHT_SCHEMES: readonly LightScheme[] = ['default', 'latte', 'solarized']
export const DARK_SCHEMES: readonly DarkScheme[] = ['default', 'dracula', 'onedark']

/** Page background per scheme, mirroring --background in index.css. */
export const PAGE_BG = {
  light: 'oklch(0.985 0.003 80)',
  dark: 'oklch(0.172 0.005 56)',
  latte: 'oklch(0.933 0.009 265)',
  solarized: 'oklch(0.952 0.026 91)',
  dracula: 'oklch(0.288 0.022 278)',
  onedark: 'oklch(0.293 0.016 264)',
} as const

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Stored preference. Anything unrecognized counts as auto. */
export function getTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  return stored === 'light' || stored === 'dark' ? stored : 'auto'
}

/** Stored scheme per side. Anything unrecognized counts as default. */
export function getLightScheme(): LightScheme {
  const stored = localStorage.getItem(SCHEME_LIGHT_KEY) as LightScheme | null
  return stored && LIGHT_SCHEMES.includes(stored) ? stored : 'default'
}

export function getDarkScheme(): DarkScheme {
  const stored = localStorage.getItem(SCHEME_DARK_KEY) as DarkScheme | null
  return stored && DARK_SCHEMES.includes(stored) ? stored : 'default'
}

/** Which of the two sides a preference resolves to right now. */
export function isDark(theme: Theme = getTheme()): boolean {
  return theme === 'dark' || (theme === 'auto' && systemDark().matches)
}

/** Page background the current preferences resolve to. */
export function pageBg(): string {
  if (isDark()) {
    const scheme = getDarkScheme()
    return scheme === 'default' ? PAGE_BG.dark : PAGE_BG[scheme]
  }
  const scheme = getLightScheme()
  return scheme === 'default' ? PAGE_BG.light : PAGE_BG[scheme]
}

const SCHEME_CLASSES = ['scheme-latte', 'scheme-solarized', 'scheme-dracula', 'scheme-onedark']

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // private mode: the choice lives for this page only
  }
}

export function applyTheme(rootEl: HTMLElement, theme?: Theme) {
  if (theme) store(THEME_KEY, theme)
  const dark = isDark(theme ?? getTheme())
  rootEl.classList.toggle('dark', dark)
  const scheme = dark ? getDarkScheme() : getLightScheme()
  rootEl.classList.remove(...SCHEME_CLASSES)
  if (scheme !== 'default') rootEl.classList.add(`scheme-${scheme}`)
  // The canvas behind #mam-root: overscroll and anything reaching below the host
  // shows it, so it carries the page color instead of the default white.
  document.documentElement.style.setProperty('background-color', pageBg(), 'important')
}

export function setLightScheme(rootEl: HTMLElement, scheme: LightScheme) {
  store(SCHEME_LIGHT_KEY, scheme)
  applyTheme(rootEl)
}

export function setDarkScheme(rootEl: HTMLElement, scheme: DarkScheme) {
  store(SCHEME_DARK_KEY, scheme)
  applyTheme(rootEl)
}

/** On auto, a system switch repaints straight away instead of at the next load. */
export function watchSystemTheme(rootEl: HTMLElement): void {
  systemDark().addEventListener('change', () => {
    if (getTheme() === 'auto') applyTheme(rootEl)
  })
}
