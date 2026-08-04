import { useRef, useState } from 'react'
import { Ticket } from 'lucide-react'
import { applyPointsUpdate, useLiveWedges } from '@/lib/bonus'
import { fmtRatio } from '@/lib/format'
import { TRIVIAL_DROP, useRatioGuard } from '@/lib/ratio-protect'
import { spendWedgeAndDownload } from '@/lib/wedge'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'

const LABEL = 'Download with FL wedge'
// Where MAM sells wedges, for when the stash is empty.
const STORE_URL = '/store.php'

export interface WedgeTarget {
  id: number
  /** null when the page did not name the torrent; the confirm falls back. */
  title: string | null
  /** Size as MAM writes it ("1.2 GiB"); drives the ratio line in the confirm. */
  size: string | null
  /** MAM's signed download URL when the page carries one. */
  href?: string | null
}

/** Confirm step for a spend that cannot be undone: names the torrent, the ratio
 * it saves and what the stash looks like afterwards. */
function WedgeConfirm({ target, onDone, onClose }: { target: WedgeTarget; onDone: () => void; onClose: () => void }) {
  const guard = useRatioGuard(target.size)
  const wedges = useLiveWedges(null)
  const [busy, setBusy] = useState(false)
  // The button goes disabled a render later, so a held Enter can fire twice.
  const inFlight = useRef(false)
  const left = wedges != null ? Number(wedges.replace(/,/g, '')) : null
  const none = left === 0
  const drop = guard?.impact.drop
  const showRatio = guard != null && (drop == null || drop > TRIVIAL_DROP)

  async function spend() {
    if (inFlight.current || none) return
    inFlight.current = true
    setBusy(true)
    try {
      const result = await spendWedgeAndDownload(target.id, target.href)
      applyPointsUpdate(result)
      const after = Number(result.FLleft)
      toast.success('Wedge applied', {
        description: Number.isNaN(after)
          ? 'The download is on its way.'
          : `${after.toLocaleString('en-US')} wedge${after === 1 ? '' : 's'} left. The download is on its way.`,
      })
      onDone()
      onClose()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The wedge did not go through, so nothing was downloaded.')
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="sm" className="gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Spend a freeleech wedge?</AlertDialogTitle>
          <AlertDialogDescription>
            The download starts right away and never counts against your ratio.
            {showRatio && guard?.impact.current != null && (
              <> Without a wedge it takes your ratio to <b className="font-semibold tabular-nums">{fmtRatio(guard.impact.next)}</b>.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* min-w-0 gives the nowrap title a floor to truncate against; a grid
            item otherwise sizes to its min-content. */}
        <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-left">
          <p className="truncate text-[13.5px] font-semibold" title={target.title ?? undefined}>{target.title ?? 'This torrent'}</p>
          <p className="mt-0.5 text-[12px] text-muted-foreground">
            {target.size ?? 'Size unknown'}
            {left != null && (
              <>
                {' · '}
                {none ? 'no wedges left' : `${left.toLocaleString('en-US')} wedges, ${(left - 1).toLocaleString('en-US')} after this`}
              </>
            )}
          </p>
        </div>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {none ? (
            <Button asChild>
              <a href={STORE_URL}><Ticket /> Get wedges</a>
            </Button>
          ) : (
            <Button onClick={spend} disabled={busy}>
              {busy ? <Spinner /> : <Ticket />}
              {busy ? 'Spending' : 'Spend wedge'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

/** Wedge download in a list row: a hover action in the same shape as the
 * bookmark and download buttons beside it. */
export function WedgeRowButton({ target, className, onDone }: { target: WedgeTarget; className?: string; onDone: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" onClick={() => setOpen(true)} aria-label={LABEL} className={className}>
            <Ticket className="size-[15px]" />
          </button>
        </TooltipTrigger>
        <TooltipContent>{LABEL}</TooltipContent>
      </Tooltip>
      {open && <WedgeConfirm target={target} onDone={onDone} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Wedge download on the torrent page, sitting next to the plain Download. */
export function WedgeDetailButton({ target, emphasis, onDone }: { target: WedgeTarget; emphasis?: boolean; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button variant={emphasis ? 'default' : 'outline'} onClick={() => setOpen(true)} className={cn(emphasis && 'font-medium')}>
        <Ticket /> {LABEL}
      </Button>
      {open && <WedgeConfirm target={target} onDone={() => onDone?.()} onClose={() => setOpen(false)} />}
    </>
  )
}
