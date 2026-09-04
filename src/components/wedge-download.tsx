import { useCallback, useRef, useState, type ComponentProps, type KeyboardEvent, type RefObject } from 'react'
import { Ticket } from 'lucide-react'
import { applyPointsUpdate, useLiveWedges } from '@/lib/bonus'
import { fmtInt, fmtRatio, plural } from '@/lib/format'
import { buyPersonalFreeleech, downloadZipOf, ZIP_BATCH_MAX } from '@/lib/mam-api'
import { useRatioGuard, worthNoting } from '@/lib/ratio-protect'
import { useFeature } from '@/lib/settings'
import { spendWedgeAndDownload } from '@/lib/wedge'
import { cn } from '@/lib/utils'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
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

/** A held Enter auto-repeats into the freshly focused confirm, so only a
 * released plus re-pressed key may activate it. */
function blockHeldEnter(e: KeyboardEvent) {
  if (e.key === 'Enter' && e.repeat) e.preventDefault()
}

/** Whether the spend also takes the file. MAM offers both routes, so
 * bookmarking now and downloading later stays possible. */
export type WedgeMode = 'download' | 'only'

/** What the spend leaves behind, for the toast and the confirm. */
const WEDGE_RESULT: Record<WedgeMode, string> = {
  download: 'The download is on its way.',
  only: 'This torrent is freeleech for you now.',
}

/** Torrents with a spend on the way. A page can offer two wedge routes side by
 * side, each with its own button state, while no spend can be taken back. */
const spending = new Set<number>()

/** The spend itself, without any UI around it. Both the confirm dialog and the
 * skip path call this, so the toast and the stash update read the same. A null
 * target leaves the caller with a spend that does nothing. The boolean says
 * whether the spend landed. */
export function useSpendWedge(
  target: WedgeTarget | null,
  onDone: () => void,
  mode: WedgeMode = 'download',
): { spend: () => Promise<boolean>; busy: boolean } {
  const [busy, setBusy] = useState(false)
  // The button goes disabled a render later, so a held Enter can fire twice.
  const inFlight = useRef(false)
  const id = target?.id ?? null
  const href = target?.href ?? null

  const spend = useCallback(async () => {
    if (id == null || inFlight.current) return false
    // Another route is already spending on this torrent. Saying so beats a
    // click that appears to do nothing.
    if (spending.has(id)) {
      toast.info('A wedge for this torrent is already on its way.')
      return false
    }
    inFlight.current = true
    spending.add(id)
    setBusy(true)
    try {
      const result = mode === 'only' ? await buyPersonalFreeleech(id) : await spendWedgeAndDownload(id, href)
      applyPointsUpdate(result)
      const after = Number(result.FLleft)
      toast.success('Wedge applied', {
        description: Number.isNaN(after)
          ? WEDGE_RESULT[mode]
          : `${after.toLocaleString('en-US')} wedge${after === 1 ? '' : 's'} left. ${WEDGE_RESULT[mode]}`,
      })
      onDone()
      return true
    } catch (e) {
      const failed = mode === 'only' ? 'The wedge did not go through.' : 'The wedge did not go through, so nothing was downloaded.'
      toast.error(e instanceof Error ? e.message : failed)
      return false
    } finally {
      inFlight.current = false
      spending.delete(id)
      setBusy(false)
    }
  }, [id, href, mode, onDone])

  return { spend, busy }
}

/** Confirm step for a spend that cannot be undone: names the torrent, the ratio
 * it saves and what the stash looks like afterwards. */
export function WedgeConfirm({
  target, mode = 'download', onDone, onClose,
}: {
  target: WedgeTarget
  mode?: WedgeMode
  onDone: () => void
  onClose: () => void
}) {
  const guard = useRatioGuard(target.size)
  const wedges = useLiveWedges(null)
  const [, setSkip] = useFeature('skipWedgeConfirm')
  const [dontAsk, setDontAsk] = useState(false)
  const confirmRef = useRef<HTMLElement>(null)
  const { spend, busy } = useSpendWedge(target, onDone, mode)
  const left = wedges != null ? Number(wedges.replace(/,/g, '')) : null
  const none = left === 0
  const showRatio = guard != null && worthNoting(guard.impact)

  // A refused spend keeps the dialog open and never saves the checkbox, so a
  // failure cannot switch the confirm off.
  async function confirm() {
    if (none) return
    const landed = await spend()
    if (!landed) return
    if (dontAsk) {
      setSkip(true)
      toast.info('Wedge confirmations are off', {
        description: 'Turn them back on any time in Preferences, Colophon tab.',
      })
    }
    onClose()
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent size="sm" className="gap-4" initialFocus={confirmRef}>
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Spend a freeleech wedge?</AlertDialogTitle>
          <AlertDialogDescription>
            {mode === 'only'
              ? 'This torrent turns freeleech for you, so downloading it whenever you like costs no ratio. Spending a wedge is final.'
              : 'The download starts right away and never counts against your ratio. Spending a wedge is final.'}
            {showRatio && guard?.impact.current != null && (
              <> Without a wedge it takes your ratio to <b className="font-semibold tabular-nums">{fmtRatio(guard.impact.next)}</b>.</>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {/* min-w-0 gives the nowrap title a floor to truncate against; a grid
            item otherwise sizes to its min-content. */}
        <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-left">
          <p className="truncate text-13-5 font-semibold" title={target.title ?? undefined}>{target.title ?? 'This torrent'}</p>
          <p className="mt-0.5 text-12 text-muted-foreground">
            {target.size ?? 'Size unknown'}
            {left != null && (
              <>
                {' · '}
                {none ? 'no wedges left' : `${left.toLocaleString('en-US')} wedges, ${(left - 1).toLocaleString('en-US')} after this`}
              </>
            )}
          </p>
        </div>
        <Label className="flex items-center gap-2 text-12-5 font-normal">
          <Checkbox checked={dontAsk} onCheckedChange={(v) => setDontAsk(!!v)} />
          Don't ask again
        </Label>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          {none ? (
            <Button asChild>
              <a ref={confirmRef as RefObject<HTMLAnchorElement>} href={STORE_URL}><Ticket /> Get wedges</a>
            </Button>
          ) : (
            <Button
              ref={confirmRef as RefObject<HTMLButtonElement>}
              onClick={() => void confirm()}
              onKeyDown={blockHeldEnter}
              disabled={busy}
            >
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
  const [skip] = useFeature('skipWedgeConfirm')
  const { spend, busy } = useSpendWedge(target, onDone)
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="outline"
            size="icon"
            disabled={busy}
            onClick={() => (skip ? void spend() : setOpen(true))}
            aria-label={LABEL}
            className={className}
          >
            {busy ? <Spinner className="size-[15px]" /> : <Ticket className="size-[15px]" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{LABEL}</TooltipContent>
      </Tooltip>
      {open && <WedgeConfirm target={target} onDone={onDone} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Wedge download on the torrent page, sitting next to the plain Download. */
export function WedgeDetailButton({
  target, emphasis, size, onDone,
}: {
  target: WedgeTarget
  emphasis?: boolean
  size?: ComponentProps<typeof Button>['size']
  onDone?: () => void
}) {
  const [open, setOpen] = useState(false)
  const [skip] = useFeature('skipWedgeConfirm')
  const { spend, busy } = useSpendWedge(target, onDone ?? (() => {}))
  return (
    <>
      <Button
        variant={emphasis ? 'default' : 'outline'}
        size={size}
        disabled={busy}
        onClick={() => (skip ? void spend() : setOpen(true))}
        className={cn(emphasis && 'font-medium')}
      >
        {busy ? <Spinner /> : <Ticket />} {LABEL}
      </Button>
      {open && <WedgeConfirm target={target} onDone={() => onDone?.()} onClose={() => setOpen(false)} />}
    </>
  )
}

/** Wedging a whole selection. One confirm for the batch, because asking per
 * torrent turns the question into noise the reader stops reading. The spends
 * run one by one; the files follow as a single zip, since a chain of
 * programmatic downloads trips the browser's multiple-download block. */
export function WedgeBatchButton({ targets, onDone }: { targets: WedgeTarget[]; onDone: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [doneCount, setDoneCount] = useState(0)
  const stopAsked = useRef(false)
  const wedges = useLiveWedges(null)
  const batch = targets.slice(0, ZIP_BATCH_MAX)
  const left = wedges != null ? Number(wedges.replace(/,/g, '')) : null
  const short = left != null && left < batch.length
  const confirmRef = useRef<HTMLElement>(null)

  async function run() {
    setBusy(true)
    stopAsked.current = false
    const landed: number[] = []
    try {
      for (const t of batch) {
        if (stopAsked.current) break
        const result = await buyPersonalFreeleech(t.id)
        applyPointsUpdate(result)
        landed.push(t.id)
        setDoneCount(landed.length)
      }
      toast.success(`${plural(landed.length, 'wedge')} applied`, {
        description: 'One zip with every torrent is on its way.',
      })
    } catch (e) {
      // Wedges cannot be refunded, so a half finished run has to name itself.
      toast.error(e instanceof Error ? e.message : 'The run stopped early.', {
        description: landed.length > 0
          ? `${plural(landed.length, 'wedge')} went through before it stopped. Their zip is on its way; the rest is untouched.`
          : 'Nothing was spent.',
      })
    } finally {
      // A stopped run still zips what landed; those wedges are spent either way.
      if (landed.length > 0) downloadZipOf(landed)
      onDone(landed)
      setBusy(false)
      setDoneCount(0)
      setOpen(false)
    }
  }

  if (batch.length === 0) return null
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 text-12-5" onClick={() => setOpen(true)}>
        <Ticket /> Wedge {fmtInt(batch.length)}
      </Button>
      {open && (
        <AlertDialog open onOpenChange={(v) => !v && !busy && setOpen(false)}>
          <AlertDialogContent size="sm" className="gap-4" initialFocus={confirmRef}>
            <AlertDialogHeader>
              <AlertDialogTitle className="font-display">
                Spend {plural(batch.length, 'freeleech wedge')}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                None of these downloads count against your ratio. The torrents arrive as one zip.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="min-w-0 rounded-lg bg-muted/50 px-3 py-2 text-left">
              <p className="text-12 text-muted-foreground">
                {left == null
                  ? 'Stash unknown'
                  : short
                    ? `Only ${plural(left, 'wedge')} left, so this needs ${fmtInt(batch.length - left)} more.`
                    : `${fmtInt(left)} wedges now, ${fmtInt(left - batch.length)} after this.`}
                {targets.length > batch.length && ` First ${fmtInt(batch.length)} of the selection; one zip takes no more.`}
              </p>
            </div>
            <AlertDialogFooter>
              <Button variant="ghost" onClick={() => (busy ? (stopAsked.current = true) : setOpen(false))}>
                {busy ? 'Stop after this one' : 'Cancel'}
              </Button>
              {short ? (
                <Button asChild>
                  <a ref={confirmRef as RefObject<HTMLAnchorElement>} href={STORE_URL}><Ticket /> Get wedges</a>
                </Button>
              ) : (
                <Button
                  ref={confirmRef as RefObject<HTMLButtonElement>}
                  onClick={() => void run()}
                  onKeyDown={blockHeldEnter}
                  disabled={busy}
                >
                  {busy ? <Spinner /> : <Ticket />}
                  {busy ? `Spending ${fmtInt(doneCount)} of ${fmtInt(batch.length)}` : `Spend ${fmtInt(batch.length)} wedges`}
                </Button>
              )}
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </>
  )
}
