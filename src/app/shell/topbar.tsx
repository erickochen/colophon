import { useEffect, useState } from 'react'
import { Moon, Search, Sun } from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { applyTheme, type Theme } from '@/main'
import { Button } from '@/components/ui/button'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Kbd } from '@/components/ui/kbd'

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

export function Topbar({ page, onOpenSearch }: { page: ShellData; onOpenSearch: () => void }) {
  const [dark, setDark] = useState(() => document.querySelector('#mam-root')?.classList.contains('dark') ?? false)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => setDark(document.querySelector('#mam-root')?.classList.contains('dark') ?? false)
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  function toggleTheme() {
    const next: Theme = dark ? 'light' : 'dark'
    const rootEl = document.querySelector<HTMLElement>('#mam-remaster-host')?.shadowRoot?.getElementById('mam-root')
    if (rootEl) applyTheme(rootEl, next)
    setDark(next === 'dark')
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-3 bg-background/85 px-4 backdrop-blur lg:px-6">
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
        <StatChip label="" value={page.client.ipv4 ? 'Connectable' : page.client.ipv4 === false ? 'Not connectable' : null} tone={page.client.ipv4 ? 'ok' : 'warn'} />
        <StatChip label="Bonus" value={page.stats.bonus} href="/store.php" hint="Spend bonus points in the store" />
        <StatChip label="Wedges" value={page.stats.wedges} />
        <StatChip
          label="Unsats"
          value={page.stats.unsats}
          tone={page.stats.unsats ? 'warn' : undefined}
          href="/snatch_summary.php#unsat"
          hint="Review your unsatisfied snatches"
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" onClick={toggleTheme}>
              {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Switch to {dark ? 'light' : 'dark'} mode</TooltipContent>
        </Tooltip>
      </div>
    </header>
  )
}
