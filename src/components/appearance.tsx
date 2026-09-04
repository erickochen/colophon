// Shared appearance state for the topbar picker and the preferences card.
// Setters repaint the shadow root and bump the settings store revision, so
// every subscribed surface follows a change from any of them.
import { useSyncExternalStore } from 'react'
import {
  applyTheme, clearPreview, getContrast, getDarkScheme, getLightScheme, getTextSize, getTheme, isDark, previewScheme,
  setContrast, setDarkScheme, setLightScheme, setTextSize,
  type Contrast, type DarkScheme, type LightScheme, type TextSize, type Theme,
} from '@/lib/theme'
import { GEN_SCHEME_ITEMS } from '@/lib/schemes.gen'
import { notifySettings, settingsRevision, subscribeSettings } from '@/lib/settings'
import { getPortalContainer } from '@/lib/portals'
import { cn } from '@/lib/utils'

export type SchemeItem = { value: string; label: string; family: string; scheme: string }

const BASE_LIGHT: SchemeItem[] = [
  { value: 'default', label: 'Reading Room', family: 'Reading Room', scheme: 'scheme-rr' },
  { value: 'latte', label: 'Catppuccin Latte', family: 'Catppuccin', scheme: 'scheme-latte' },
  { value: 'solarized', label: 'Solarized Light', family: 'Solarized', scheme: 'scheme-solarized' },
]

const BASE_DARK: SchemeItem[] = [
  { value: 'default', label: 'Reading Room', family: 'Reading Room', scheme: 'dark' },
  { value: 'dracula', label: 'Dracula', family: 'Dracula', scheme: 'dark scheme-dracula' },
  { value: 'onedark', label: 'One Dark Pro', family: 'One Dark Pro', scheme: 'dark scheme-onedark' },
]

/** Reading Room first, then plain label order; family variants share a label
 * prefix, so they stay together on their own. */
function schemeItems(side: 'light' | 'dark'): SchemeItem[] {
  const [rr, ...base] = side === 'light' ? BASE_LIGHT : BASE_DARK
  const gen = GEN_SCHEME_ITEMS.filter((s) => s.side === side)
  const rest = [...base, ...gen].sort((a, b) => a.label.localeCompare(b.label))
  return [rr, ...rest]
}

export const LIGHT_SCHEME_ITEMS = schemeItems('light')
export const DARK_SCHEME_ITEMS = schemeItems('dark')

/** The swatch wears the scheme class itself, so it paints that scheme's own page
 * and brand color. Both lists render at once, so the light rows keep their light
 * colors while a dark scheme is active. */
export function SchemeDot({ scheme }: { scheme: string }) {
  return (
    <span
      className={cn('size-3.5 shrink-0 rounded-full border', scheme)}
      style={{ backgroundColor: 'var(--background)', borderColor: 'var(--brand)' }}
    />
  )
}

// On auto, a system flip must reach subscribed UIs too, not only the root paint.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (getTheme() === 'auto') notifySettings()
})

window.matchMedia('(prefers-contrast: more)').addEventListener('change', () => {
  if (getContrast() === 'auto') notifySettings()
})

export function chooseTheme(next: Theme): void {
  applyTheme(getPortalContainer(), next)
  notifySettings()
}

export function chooseContrast(next: Contrast): void {
  setContrast(getPortalContainer(), next)
  notifySettings()
}

export function chooseTextSize(next: TextSize): void {
  setTextSize(getPortalContainer(), next)
  notifySettings()
}

// Debounce for the full-UI preview, so scanning the list does not strobe.
export const PREVIEW_DELAY_MS = 150

let previewTimer: number | undefined

function schedulePreview(fn: () => void): void {
  window.clearTimeout(previewTimer)
  previewTimer = window.setTimeout(fn, PREVIEW_DELAY_MS)
}

/** Debounced full-UI preview; follows hover and keyboard focus. */
export function previewSchemeChoice(side: 'light' | 'dark', value: string): void {
  schedulePreview(() => previewScheme(getPortalContainer(), side, value))
}

/** Immediate return to the saved state, for Escape and for closing a picker. */
export function dropSchemePreview(): void {
  window.clearTimeout(previewTimer)
  clearPreview(getPortalContainer())
}

/** Commit: store the scheme for its side and move the theme to that side,
 * so what was just previewed is what stays on screen. */
export function chooseScheme(side: 'light' | 'dark', value: string): void {
  window.clearTimeout(previewTimer)
  if (side === 'light') setLightScheme(getPortalContainer(), value as LightScheme)
  else setDarkScheme(getPortalContainer(), value as DarkScheme)
  chooseTheme(side)
}

export function useAppearance(): {
  theme: Theme
  contrast: Contrast
  textSize: TextSize
  lightScheme: LightScheme
  darkScheme: DarkScheme
  dark: boolean
} {
  useSyncExternalStore(subscribeSettings, settingsRevision)
  const theme = getTheme()
  return {
    theme,
    contrast: getContrast(),
    textSize: getTextSize(),
    lightScheme: getLightScheme(),
    darkScheme: getDarkScheme(),
    dark: isDark(theme),
  }
}
