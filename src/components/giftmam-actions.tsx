import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Gift, Ticket } from 'lucide-react'
import type { ShellData } from '@/lib/extract/shell'
import { giftPoints, sendWedgeTo, MAX_GIFT, MIN_GIFT, type BonusBuyResult } from '@/lib/mam-api'
import { readDefaultGiftAmount, syncPanelBalance, useGiftingEnabled, useGiftMam, type GiftSurface } from '@/lib/giftmam'
import { applyPointsUpdate, useLiveBonus, useLiveWedges } from '@/lib/bonus'
import { closeGiftDialog, getGiftDialog, openGiftDialog, subscribeGiftDialog, type GiftRequest } from '@/lib/gift-dialog'
import { initials } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from '@/components/ui/toast'

// Round numbers a reader recognises, ending at MAM's own ceiling.
const GIFT_PRESETS = [100, 250, 500, MAX_GIFT]

const toNumber = (value: string | null) => {
  if (!value) return null
  const num = Number(value.replace(/,/g, ''))
  return Number.isNaN(num) ? null : num
}

/** Gift and wedge triggers for one member. Needs GiftMAM present plus its switch
 * for this surface on. */
export function GiftActions({ uid, name, surface, buttonClass, iconClass }: {
  uid: string
  name: string
  surface: GiftSurface
  buttonClass?: string
  iconClass?: string
}) {
  const giftMam = useGiftMam()
  const enabled = useGiftingEnabled(surface)
  if (!giftMam || !enabled) return null
  const cls = cn('size-7 text-muted-foreground hover:text-foreground', buttonClass)
  const icon = cn('size-3.5', iconClass)

  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cls} onClick={() => openGiftDialog({ kind: 'points', uid, name, surface })}>
            <Gift className={icon} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Gift bonus points</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button type="button" variant="ghost" size="icon" className={cls} onClick={() => openGiftDialog({ kind: 'wedge', uid, name, surface })}>
            <Ticket className={icon} />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Send a freeleech wedge</TooltipContent>
      </Tooltip>
    </>
  )
}

const sameRequest = (a: GiftRequest | null, b: GiftRequest | null) =>
  !!a && !!b && a.uid === b.uid && a.kind === b.kind

/** Whether the send in progress belongs to the dialog on screen, to another one,
 * or there is none. */
export type SendState = 'idle' | 'sending' | 'waiting'

/** Shell-level host for both dialogs, so the row that opened one can go away. */
export function GiftDialogHost({ page }: { page: ShellData }) {
  const request = useSyncExternalStore(subscribeGiftDialog, getGiftDialog)
  const [pending, setPending] = useState<GiftRequest | null>(null)
  // State drives the UI, this ref is the lock: a burst of Enter keys fires
  // several times before React has re-rendered.
  const inFlight = useRef(false)
  const bonus = useLiveBonus(page.stats.bonus)
  const wedges = useLiveWedges(page.stats.wedges)
  const shoutboxOn = useGiftingEnabled('shoutbox')
  const forumOn = useGiftingEnabled('forum')
  const allowed =
    request == null || request.surface === 'profile' || (request.surface === 'shoutbox' ? shoutboxOn : forumOn)

  // Switching gifting off in the widget takes an open dialog with it.
  useEffect(() => {
    if (!allowed) closeGiftDialog()
  }, [allowed])

  async function run(target: GiftRequest, action: () => Promise<BonusBuyResult>, done: string) {
    // Silent: the controls go disabled a tick later, so a repeated key needs no
    // second message.
    if (inFlight.current) return
    inFlight.current = true
    setPending(target)
    try {
      const result = await action()
      applyPointsUpdate(result)
      const balance = Number(result.seedbonus)
      if (!Number.isNaN(balance)) syncPanelBalance(balance)
      toast.success(done)
      // Close only if that same dialog is still the one on screen.
      if (sameRequest(getGiftDialog(), target)) closeGiftDialog()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Something went wrong.')
    } finally {
      inFlight.current = false
      setPending(null)
    }
  }

  if (!request || !allowed) return null
  const state: SendState = pending == null ? 'idle' : sameRequest(pending, request) ? 'sending' : 'waiting'

  if (request.kind === 'wedge') {
    return (
      <WedgeDialog
        name={request.name}
        wedges={toNumber(wedges)}
        state={state}
        onSend={() => run(request, () => sendWedgeTo(request.uid), `Wedge sent to ${request.name}`)}
      />
    )
  }
  return (
    <PointsDialog
      key={request.uid}
      name={request.name}
      balance={toNumber(bonus)}
      state={state}
      onSend={(points) => run(request, () => giftPoints(request.uid, points), `Gifted ${points.toLocaleString('en-US')} points to ${request.name}`)}
    />
  )
}

/** The person on the receiving end, shown the way member cards show them. */
function Recipient({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg bg-muted/50 px-3 py-2">
      <Avatar className="size-8 rounded-md">
        <AvatarFallback className="rounded-md bg-brand-soft text-[11px] font-semibold text-accent-foreground">{initials(name)}</AvatarFallback>
      </Avatar>
      <span className="min-w-0 truncate text-[13.5px] font-semibold">{name}</span>
    </div>
  )
}

function PointsDialog({ name, balance, state, onSend }: {
  name: string
  balance: number | null
  state: SendState
  onSend: (points: number) => void
}) {
  const [amount, setAmount] = useState(() => String(readDefaultGiftAmount()))
  const points = Number(amount)
  const valid = Number.isInteger(points) && points >= MIN_GIFT && points <= MAX_GIFT
  const short = valid && balance != null && points > balance
  const left = valid && balance != null ? balance - points : null
  const busy = state !== 'idle'

  function send() {
    if (busy || !valid || short) return
    onSend(points)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && closeGiftDialog()}>
      <DialogContent className="gap-4 sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">Gift bonus points</DialogTitle>
        </DialogHeader>
        <Recipient name={name} />
        <div className="grid gap-2">
          <Label htmlFor="gift-amount" className="text-[12.5px] text-muted-foreground">How many points</Label>
          <ToggleGroup
            type="single"
            value={GIFT_PRESETS.includes(points) ? String(points) : ''}
            onValueChange={(v) => v && setAmount(v)}
            className="w-full"
          >
            {GIFT_PRESETS.map((p) => (
              <ToggleGroupItem
                key={p}
                value={String(p)}
                disabled={busy}
                className="h-8 flex-1 text-[12.5px] font-medium text-muted-foreground data-pressed:bg-brand-soft data-pressed:text-accent-foreground"
              >
                {p.toLocaleString('en-US')}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Input
            id="gift-amount"
            type="number"
            inputMode="numeric"
            min={MIN_GIFT}
            max={MAX_GIFT}
            value={amount}
            disabled={busy}
            autoFocus
            aria-invalid={amount !== '' && (!valid || short)}
            onChange={(e) => setAmount(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            className="tabular-nums"
          />
          <p className={cn('text-[12px]', short ? 'text-warn' : 'text-muted-foreground')}>
            {state === 'waiting'
              ? 'Finishing the previous gift first.'
              : short
                ? `You have ${balance?.toLocaleString('en-US')} points, so that is more than you can send.`
                : left != null
                  ? `${balance?.toLocaleString('en-US')} points now, ${left.toLocaleString('en-US')} after this.`
                  : `Anything from ${MIN_GIFT} to ${MAX_GIFT.toLocaleString('en-US')} points.`}
          </p>
        </div>
        <DialogFooter>
          {/* While sending, closing only hides the dialog: the gift is already out. */}
          <Button variant="ghost" onClick={() => closeGiftDialog()}>{state === 'sending' ? 'Close' : 'Cancel'}</Button>
          <Button onClick={send} disabled={busy || !valid || short}>
            {state === 'sending' ? <Spinner /> : <Gift />}
            {state === 'sending' ? 'Sending' : valid ? `Send ${points.toLocaleString('en-US')} points` : 'Send points'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function WedgeDialog({ name, wedges, state, onSend }: {
  name: string
  wedges: number | null
  state: SendState
  onSend: () => void
}) {
  const none = wedges === 0
  useEffect(() => {
    if (none) toast.warning('You have no freeleech wedges left.')
  }, [none])

  return (
    <AlertDialog open onOpenChange={(open) => !open && closeGiftDialog()}>
      <AlertDialogContent size="sm" className="gap-4">
        <AlertDialogHeader>
          <AlertDialogTitle className="font-display">Send a freeleech wedge?</AlertDialogTitle>
          <AlertDialogDescription>
            {state === 'waiting'
              ? 'Finishing the previous gift first.'
              : (
                <>
                  {name} gets one wedge from your stash
                  {wedges != null && wedges > 0 ? `, leaving you ${(wedges - 1).toLocaleString('en-US')}` : ''}.
                </>
              )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => closeGiftDialog()}>{state === 'sending' ? 'Close' : 'Cancel'}</Button>
          <Button onClick={onSend} disabled={state !== 'idle' || none}>
            {state === 'sending' ? <Spinner /> : <Ticket />}
            {state === 'sending' ? 'Sending' : 'Send wedge'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
