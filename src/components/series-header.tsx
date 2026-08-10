import { fmtInt, plural } from '@/lib/format'
import { seriesProgress, type SeriesGroup } from '@/lib/series'
import { Card, CardContent } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'

// Gap ranges named before the line falls back to a count.
const GAPS_SHOWN_MAX = 8

/** How far the reader is through a series. Counts only what MAM holds: the API
 * cannot know whether a missing number was ever published, so a gap is named
 * as a missing upload rather than as something the reader failed to get. */
export function SeriesHeader({ name, groups, total }: { name: string; groups: SeriesGroup[]; total: number }) {
  const p = seriesProgress(groups)
  if (p.parts === 0) return null
  const shownGaps = p.gaps.slice(0, GAPS_SHOWN_MAX)
  return (
    <Card>
      <CardContent className="grid gap-2 px-6">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-[17px] font-semibold tracking-tight">{name}</h2>
          <span className="text-[12.5px] tabular-nums text-muted-foreground">
            {fmtInt(p.snatched)} of {fmtInt(p.parts)} parts on MAM snatched · {fmtInt(total)} torrents
          </span>
        </div>
        <Progress
          aria-label="Parts snatched"
          value={(p.snatched / p.parts) * 100}
          className="bg-brand-soft [&>div]:bg-brand"
        />
        {p.gaps.length > 0 && (
          <p className="text-[12px] text-muted-foreground">
            No upload for {plural(p.missingCount, 'part')}: {shownGaps.join(', ')}
            {p.gaps.length > shownGaps.length && ' plus further gaps'}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
