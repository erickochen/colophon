import { Component, useMemo, useState, type ReactNode } from 'react'
import type { ShellData } from '@/lib/extract/shell'
import { resolveRoute } from '@/app/router'
import { AppSidebar } from '@/app/shell/app-sidebar'
import { Topbar } from '@/app/shell/topbar'
import { CommandMenu } from '@/app/shell/command-menu'
import { SiteAlerts } from '@/app/shell/site-alerts'
import { LegacyDialogHost } from '@/app/shell/legacy-dialog-host'
import { GiftDialogHost } from '@/components/giftmam-actions'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { useNotifCounts } from '@/lib/notify'
import { ScrollProgress } from '@/components/ui/scroll-progress'
import { getPortalContainer } from '@/lib/portals'
import { detachWysiwyg } from '@/lib/wysiwyg'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

/** Keeps a view render error inside the content area, so the shell stays usable. */
class ViewBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <Card>
        <CardHeader>
          <CardTitle>This page hit an error</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground">
          <p>The rest of the site keeps working. Reloading may help; if it keeps happening the page layout on MAM's side has probably changed.</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-[11.5px] text-foreground">{String(this.state.error)}</pre>
        </CardContent>
      </Card>
    )
  }
}

export function App({ page, host }: { page: ShellData; host: HTMLElement }) {
  const route = useMemo(() => resolveRoute(location), [])
  // Tear down MAM's TinyMCE before any view reads a textarea (this runs during
  // App's render, ahead of the child view). We replace it with our BBComposer.
  useMemo(() => detachWysiwyg(), [])
  const [cmdOpen, setCmdOpen] = useState(false)
  const defaultOpen = !document.cookie.includes('sidebar_state=false')
  // One poll feeds the sidebar badges and the topbar chips alike.
  const counts = useNotifCounts(page.pmCount)

  return (
    <TooltipProvider delayDuration={250}>
      <ScrollProgress />
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar page={page} counts={counts} />
        <SidebarInset className="min-w-0">
          {/* Keyboard users would otherwise tab the whole sidebar on every page. */}
          <a
            href="#colophon-main"
            className="sr-only rounded-md bg-card px-3 py-2 text-[13px] font-medium ring-[3px] ring-ring focus:not-sr-only focus:absolute focus:left-4 focus:top-3 focus:z-50"
          >
            Skip to content
          </a>
          <Topbar page={page} counts={counts} onOpenSearch={() => setCmdOpen(true)} />
          <SiteAlerts alerts={page.alerts} />
          <main id="colophon-main" tabIndex={-1} className="flex-1 px-4 py-6 sm:px-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <ViewBoundary>
                <route.View page={page} host={host} />
              </ViewBoundary>
            </div>
          </main>
          <footer className="px-4 py-4 text-xs text-muted-foreground sm:px-6 lg:px-8">
            © {new Date().getFullYear()} MyAnonaMouse
          </footer>
        </SidebarInset>
        <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
        <LegacyDialogHost host={host} />
        <GiftDialogHost page={page} />
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  )
}

export function portalProps() {
  return { container: getPortalContainer() }
}
