// How a member stands with one torrent, in the wording the snatched list uses.
// The tints live here so a badge reads the same on every page that shows one.
import { Sprout } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { BadgeTone } from '@/lib/snatch-status'

// The quiet tone keeps its outline: beside a category or a language badge, which
// carry the same fill and no border, that line is what marks it as a state.
const TONES: Record<BadgeTone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'border-warn/40 text-warn',
  muted: 'border-border text-muted-foreground',
}

/** `dense` is the h-4 size the freeleech rows use beside language plus
 * category. The default is the h-5 size the snatched rows carry. */
export function SnatchBadge({
  text,
  tone,
  dense,
  title,
}: {
  text: string
  tone: BadgeTone
  dense?: boolean
  title?: string
}) {
  return (
    <Badge
      variant={tone === 'ok' ? 'secondary' : 'outline'}
      title={title}
      className={cn(
        'gap-1 font-medium',
        TONES[tone],
        // The icon size rides on the badge: Badge's own [&>svg]:size-3 beats a
        // class on the icon itself, on specificity plus on source order.
        dense ? 'h-4 px-1 text-[9.5px] [&>svg]:size-2.5' : 'h-5 px-2 text-[11px]'
      )}
    >
      {tone === 'ok' && <Sprout />}
      {text}
    </Badge>
  )
}
