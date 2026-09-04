// How a member stands with one torrent, in the wording the snatched list uses.
// The tints live here so a badge reads the same on every page that shows one.
import { Sprout } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { pileBadge, readPile, type BadgeTone } from '@/lib/snatch-status'

export type { BadgeTone }

// The quiet tone keeps its outline: beside a category or a language badge, which
// carry the same fill and no border, that line is what marks it as a state.
const TONES: Record<BadgeTone, string> = {
  ok: 'bg-ok/15 text-ok',
  warn: 'border-warn/40 text-warn',
  muted: 'border-border text-muted-foreground',
}

// A state standing on its own needs no outline to be told apart, so it carries
// a fill. That fill is neutral: a tint of the tone's own hue sits under the word
// and costs it up to half a point of contrast on the darker palettes.
const STATE_TONES: Record<BadgeTone, string> = {
  ok: 'bg-muted text-ok',
  warn: 'bg-muted text-warn',
  muted: 'bg-muted text-muted-foreground',
}

/** A state named in the site's own words: a ticket status, a topic tag. The
 * wording always shows, so the tone is a hint rather than the message. */
export function StateBadge({ text, tone, title }: { text: string; tone: BadgeTone; title?: string }) {
  return (
    <Badge variant="secondary" className={cn('font-medium', STATE_TONES[tone])} title={title}>
      {text}
    </Badge>
  )
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
        dense ? 'h-4 px-1 text-9-5 [&>svg]:size-2.5' : 'h-5 px-2 text-11'
      )}
    >
      {tone === 'ok' && <Sprout />}
      {text}
    </Badge>
  )
}

/** Whether there is anything to say about holding this torrent. */
export const snatchMarked = (pile?: string | null, snatched?: boolean) => !!pile || !!snatched

/** Where a member stands with a torrent they already hold, for any list that can
 * answer it. The pile says it best, since it knows whether the torrent is still
 * seeding; without one the search flag still says they have had it before. */
export function SnatchMark({ pile, snatched, dense }: { pile?: string | null; snatched?: boolean; dense?: boolean }) {
  if (pile) {
    const read = pileBadge(readPile(pile))
    return <SnatchBadge text={read.text} tone={read.tone} title={pile} dense={dense} />
  }
  if (!snatched) return null
  return <SnatchBadge text="Snatched" tone="muted" title="You have had this torrent before" dense={dense} />
}
