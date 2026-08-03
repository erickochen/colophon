import { useEffect, useState } from 'react'
import { Eye, Headset, Mail, Moon, PackageCheck, Search, Sun, SunMoon } from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { applyTheme, getDarkScheme, getLightScheme, getTheme, isDark, setDarkScheme, setLightScheme, type DarkScheme, type LightScheme, type Theme } from '@/lib/theme'
import { NOTIF_TARGETS, type NotifCounts } from '@/lib/notify'
import { useLiveBonus, useLiveWedges } from '@/lib/bonus'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'

const LIGHT_SCHEME_ITEMS: { value: LightScheme; label: string; dot: string }[] = [
  { value: 'default', label: 'Reading Room', dot: 'oklch(0.473 0.078 46)' },
  { value: 'latte', label: 'Catppuccin Latte', dot: 'oklch(0.555 0.25 297)' },
  { value: 'solarized', label: 'Solarized Light', dot: 'oklch(0.56 0.13 245)' },
]

const DARK_SCHEME_ITEMS: { value: DarkScheme; label: string; dot: string }[] = [
  { value: 'default', label: 'Reading Room', dot: 'oklch(0.75 0.09 70)' },
  { value: 'dracula', label: 'Dracula', dot: 'oklch(0.742 0.149 302)' },
  { value: 'onedark', label: 'One Dark Pro', dot: 'oklch(0.73 0.121 245)' },
]

function SchemeDot({ color }: { color: string }) {
  return <span className="size-2 shrink-0 rounded-full" style={{ background: color }} />
}

/** `href` mirrors where MAM's own header sends these numbers: Bonus and B/hr to
 * the store, Unsat(s) to the snatch summary. Wedges carry no link there either. */
function StatChip({
  label, value, tone, href, hint,
}: {
  label: string
  value: string | number | null
  tone?: 'ok' | 'warn'
  href?: string
  hint?: string
}) {
  if (value == null) return null
  const body = (
    <>
      {tone && (
        <span
          className={
            'size-1.5 rounded-full ' + (tone === 'ok' ? 'bg-ok' : 'bg-warn')
          }
        />
      )}
      {label}
      <span className="font-medium tabular-nums text-foreground">{value}</span>
    </>
  )
  const base = 'hidden items-center gap-1.5 text-[12.5px] text-muted-foreground md:flex'
  if (!href) return <div className={base}>{body}</div>
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href={href}
          className={base + ' -mx-1.5 rounded-md px-1.5 py-1 transition-colors hover:bg-accent/50 hover:text-foreground'}
        >
          {body}
        </a>
      </TooltipTrigger>
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  )
}

const NOTIF_ICONS: Record<keyof NotifCounts, typeof Mail> = {
  pms: Mail,
  topics: Eye,
  tickets: Headset,
  requests: PackageCheck,
}

/** One fixed glance point for every live counter. Stays visible on small
 * screens where the sidebar folds away, so nothing hides in the sheet. */
function NotifChips({ counts }: { counts: NotifCounts }) {
  const active = (Object.keys(NOTIF_ICONS) as (keyof NotifCounts)[]).filter((k) => counts[k] > 0)
  if (active.length === 0) return null
  return (
    <div className="flex items-center gap-1">
      {active.map((key) => {
        const Icon = NOTIF_ICONS[key]
        const target = NOTIF_TARGETS[key]
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <a
                href={target.href}
                aria-label={target.describe(counts[key])}
                className="badge-pop flex items-center gap-1 rounded-full bg-brand-soft px-2 py-1 text-[12px] font-medium text-accent-foreground transition-colors hover:bg-accent"
              >
                <Icon className="size-3.5" />
                <span className="tabular-nums">{counts[key]}</span>
              </a>
            </TooltipTrigger>
            <TooltipContent>{target.describe(counts[key])}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}

/* MAM reports connectability per protocol; show both, like the site does. */
function ClientChip({ client }: { client: ShellData['client'] }) {
  const dot = (state: boolean | null) =>
    state == null ? 'bg-muted-foreground/40' : state ? 'bg-ok' : 'bg-warn'
  const word = (state: boolean | null) =>
    state == null ? 'unknown' : state ? 'connectable' : 'offline'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <a
          href="/userClientDetails.php"
          className="hidden items-center gap-2 rounded-md px-1.5 py-1 text-[12.5px] text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground md:flex"
        >
          <span className="flex items-center gap-1.5">
            <span className={'size-1.5 rounded-full ' + dot(client.ipv4)} />
            v4
          </span>
          <span className="flex items-center gap-1.5">
            <span className={'size-1.5 rounded-full ' + dot(client.ipv6)} />
            v6
          </span>
        </a>
      </TooltipTrigger>
      <TooltipContent>
        IPv4 {word(client.ipv4)} · IPv6 {word(client.ipv6)} · client details
      </TooltipContent>
    </Tooltip>
  )
}

export function Topbar({ page, counts, onOpenSearch }: { page: ShellData; counts: NotifCounts; onOpenSearch: () => void }) {
  const [theme, setTheme] = useState<Theme>(getTheme)
  const [dark, setDark] = useState(() => isDark())
  const [lightScheme, setLightState] = useState<LightScheme>(getLightScheme)
  const [darkScheme, setDarkState] = useState<DarkScheme>(getDarkScheme)
  const bonus = useLiveBonus(page.stats.bonus)
  const wedges = useLiveWedges(page.stats.wedges)

  // On auto the icon has to follow the system, so track the media query.
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setDark(isDark())
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function shadowRootEl() {
    return document.querySelector<HTMLElement>('#mam-remaster-host')?.shadowRoot?.getElementById('mam-root') ?? null
  }

  function chooseTheme(next: Theme) {
    const rootEl = shadowRootEl()
    if (rootEl) applyTheme(rootEl, next)
    setTheme(next)
    setDark(isDark(next))
  }

  function chooseLightScheme(next: LightScheme) {
    const rootEl = shadowRootEl()
    if (rootEl) setLightScheme(rootEl, next)
    setLightState(next)
  }

  function chooseDarkScheme(next: DarkScheme) {
    const rootEl = shadowRootEl()
    if (rootEl) setDarkScheme(rootEl, next)
    setDarkState(next)
  }

  return (
    <header className="topbar-condense sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur lg:px-6">
      <SidebarTrigger />
      <button
        onClick={onOpenSearch}
        className="flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border bg-card px-3 text-[13px] text-muted-foreground shadow-xs transition-colors hover:bg-accent/50"
      >
        <Search className="size-3.5" />
        Search the catalog…
        <Kbd className="ml-auto">⌘K</Kbd>
      </button>
      <div className="ml-auto flex items-center gap-4">
        <NotifChips counts={counts} />
        <ClientChip client={page.client} />
        <StatChip label="Bonus" value={bonus} href="/store.php" hint="Spend bonus points in the store" />
        <StatChip label="Wedges" value={wedges} />
        <StatChip
          label="Unsats"
          value={page.stats.unsats}
          tone={page.stats.unsats ? 'warn' : undefined}
          href="/snatch_summary.php#unsat"
          hint="Review your unsatisfied snatches"
        />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label={`Appearance: ${theme}`}>
              {dark ? <Moon className="size-4" /> : <Sun className="size-4" />}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup value={theme} onValueChange={(v) => chooseTheme(v as Theme)}>
              <DropdownMenuRadioItem value="light"><Sun className="size-3.5" /> Light</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="dark"><Moon className="size-3.5" /> Dark</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="auto"><SunMoon className="size-3.5" /> Auto</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Light scheme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={lightScheme} onValueChange={(v) => chooseLightScheme(v as LightScheme)}>
              {LIGHT_SCHEME_ITEMS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  <SchemeDot color={s.dot} /> {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Dark scheme</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={darkScheme} onValueChange={(v) => chooseDarkScheme(v as DarkScheme)}>
              {DARK_SCHEME_ITEMS.map((s) => (
                <DropdownMenuRadioItem key={s.value} value={s.value}>
                  <SchemeDot color={s.dot} /> {s.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
