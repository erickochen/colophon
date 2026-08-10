// Shared appearance state for the topbar picker and the preferences card.
// Setters repaint the shadow root and bump the settings store revision, so
// every subscribed surface follows a change from any of them.
import { useSyncExternalStore } from 'react'
import {
  applyTheme, getDarkScheme, getLightScheme, getTheme, isDark, setDarkScheme, setLightScheme,
  type DarkScheme, type LightScheme, type Theme,
} from '@/lib/theme'
import { notifySettings, settingsRevision, subscribeSettings } from '@/lib/settings'
import { getPortalContainer } from '@/lib/portals'
import { cn } from '@/lib/utils'

export const LIGHT_SCHEME_ITEMS: { value: LightScheme; label: string; scheme: string }[] = [
  { value: 'default', label: 'Reading Room', scheme: 'scheme-rr' },
  { value: 'latte', label: 'Catppuccin Latte', scheme: 'scheme-latte' },
  { value: 'solarized', label: 'Solarized Light', scheme: 'scheme-solarized' },
]

export const DARK_SCHEME_ITEMS: { value: DarkScheme; label: string; scheme: string }[] = [
  { value: 'default', label: 'Reading Room', scheme: 'dark' },
  { value: 'dracula', label: 'Dracula', scheme: 'dark scheme-dracula' },
  { value: 'onedark', label: 'One Dark Pro', scheme: 'dark scheme-onedark' },
]

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

export function chooseTheme(next: Theme): void {
  applyTheme(getPortalContainer(), next)
  notifySettings()
}

export function chooseLightScheme(next: LightScheme): void {
  setLightScheme(getPortalContainer(), next)
  notifySettings()
}

export function chooseDarkScheme(next: DarkScheme): void {
  setDarkScheme(getPortalContainer(), next)
  notifySettings()
}

export function useAppearance(): { theme: Theme; lightScheme: LightScheme; darkScheme: DarkScheme; dark: boolean } {
  useSyncExternalStore(subscribeSettings, settingsRevision)
  const theme = getTheme()
  return { theme, lightScheme: getLightScheme(), darkScheme: getDarkScheme(), dark: isDark(theme) }
}
