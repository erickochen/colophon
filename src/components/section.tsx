// Foldable section: a header you can click, a count next to it and the list
// inside. Frameless on purpose, so a page can stack several in one card.
import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'

import { cn } from '@/lib/utils'
import { fmtInt } from '@/lib/format'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export function CollapsibleSection({
  title,
  icon,
  count,
  open,
  onOpenChange,
  children,
  className,
}: {
  title: ReactNode
  icon?: ReactNode
  count?: number
  open: boolean
  onOpenChange: (open: boolean) => void
  children: ReactNode
  className?: string
}) {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className={className}>
      <CollapsibleTrigger
        className={cn(
          'group flex w-full items-center gap-2.5 px-4 py-3 text-left transition-colors hover:bg-accent/40',
          'focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none',
          open && 'border-b'
        )}
      >
        <ChevronRight
          className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')}
        />
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <span className="font-display truncate text-[14px] font-semibold tracking-tight">{title}</span>
        {count != null && (
          <span className="shrink-0 text-[12px] tabular-nums text-muted-foreground">{fmtInt(count)}</span>
        )}
      </CollapsibleTrigger>
      <CollapsibleContent>{children}</CollapsibleContent>
    </Collapsible>
  )
}
