import { useMemo, useState } from 'react'
import type { ShellData } from '@/lib/extract/shell'
import { resolveRoute } from '@/app/router'
import { AppSidebar } from '@/app/shell/app-sidebar'
import { Topbar } from '@/app/shell/topbar'
import { CommandMenu } from '@/app/shell/command-menu'
import { LegacyDialogHost } from '@/app/shell/legacy-dialog-host'
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/toast'
import { ScrollProgress } from '@/components/ui/scroll-progress'
import { getPortalContainer } from '@/lib/portals'
import { detachWysiwyg } from '@/lib/wysiwyg'

export function App({ page, host }: { page: ShellData; host: HTMLElement }) {
  const route = useMemo(() => resolveRoute(location), [])
  // Tear down MAM's TinyMCE before any view reads a textarea (this runs during
  // App's render, ahead of the child view). We replace it with our BBComposer.
  useMemo(() => detachWysiwyg(), [])
  const [cmdOpen, setCmdOpen] = useState(false)
  const defaultOpen = !document.cookie.includes('sidebar_state=false')

  return (
    <TooltipProvider delayDuration={250}>
      <ScrollProgress />
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar page={page} />
        <SidebarInset className="min-w-0">
          <Topbar page={page} onOpenSearch={() => setCmdOpen(true)} />
          <main className="flex-1 px-6 py-6 lg:px-8">
            <div className="mx-auto w-full max-w-6xl">
              <route.View page={page} host={host} />
            </div>
          </main>
          <footer className="px-8 py-4 text-xs text-muted-foreground">
            © {new Date().getFullYear()} MyAnonaMouse
          </footer>
        </SidebarInset>
        <CommandMenu open={cmdOpen} onOpenChange={setCmdOpen} />
        <LegacyDialogHost host={host} />
        <Toaster position="bottom-right" />
      </SidebarProvider>
    </TooltipProvider>
  )
}

export function portalProps() {
  return { container: getPortalContainer() }
}
