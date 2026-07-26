import { useEffect } from 'react'
import type { PageProps } from '@/app/router'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

/** Fallback for pages not yet rebuilt: the original #mainBody is adopted as a
 * light-DOM child and slotted in, so MAM's own CSS and scripts keep working. */
export function LegacyView({ page, host }: PageProps) {
  useEffect(() => {
    const el = page.mainContent
    if (!el) return
    el.setAttribute('slot', 'legacy')
    host.appendChild(el)
    return () => {
      el.removeAttribute('slot')
    }
  }, [page.mainContent, host])

  return (
    <div className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold">{page.title || 'MyAnonaMouse'}</h1>
        <Badge variant="outline" className="text-muted-foreground">original page</Badge>
      </div>
      {page.mainContent ? (
        <Card className="overflow-hidden py-0">
          <CardContent className="legacy-frame overflow-x-auto p-6">
            <slot name="legacy" />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            This page has no readable content. <a className="underline" href="/">Back to the dashboard</a>.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
